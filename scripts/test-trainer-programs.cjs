// Program writes run only against an owned disposable GraphQL/MongoDB fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const output = console.log;
let checks = 0;
const pass = (name) => {
	checks++;
	output('PASS ' + name);
};
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file,
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2021,
			jsx: ts.JsxEmit.React,
			esModuleInterop: true,
		},
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.endsWith('.css') || name.startsWith('swiper/css')) return {};
		if (name.startsWith('.')) {
			const resolved = path.resolve(path.dirname(file), name);
			return loadTs(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '.tsx', mocks, cache);
		}
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
		localRequire,
		module,
		module.exports,
	);
	return module.exports;
}
async function staticChecks() {
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{
				common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')),
			},
		]),
	);
	const i18n = require('i18next').createInstance();
	await i18n.init({ resources, lng: 'en', defaultNS: 'common', ns: ['common'], initImmediate: false });
	for (const locale of ['en', 'kr', 'ru']) {
		assert.deepEqual(
			Object.keys(resources[locale].common['Trainer programs']).sort(),
			Object.keys(resources.en.common['Trainer programs']).sort(),
		);
		for (const key of Object.keys(resources.en.common['Trainer programs'])) {
			const text = i18n.getFixedT(locale)('Trainer programs.' + key, {
				count: 21,
				name: 'Program',
				duration: 60,
				capacity: 2,
				page: 3,
			});
			assert.ok(!text.includes('{{') && text !== 'Trainer programs.' + key, key);
		}
		for (const count of [0, 1, 2, 5, 21])
			assert.ok(i18n.getFixedT(locale)('Trainer programs.Count', { count }).includes(String(count)));
	}
	assert.equal(i18n.getFixedT('en')('Trainer programs.Count', { count: 1 }), '1 program');
	assert.equal(i18n.getFixedT('ru')('Trainer programs.Count', { count: 2 }), '2 программы');
	assert.equal(i18n.getFixedT('ru')('Trainer programs.Count', { count: 5 }), '5 программ');
	pass('EN/KR/RU management keys, interpolation and real plural resolution');
	for (const variant of ['pc', 'mobile']) {
		const compiled = require('sass').renderSync({
			file: path.join(__dirname, '../scss', variant, 'main.scss'),
			importer: (url) => (url.startsWith('/scss/') ? { file: path.join(__dirname, '..', url.slice(1)) } : null),
		});
		assert.ok(compiled.css.length);
		if (variant === 'pc') {
			const css = compiled.css.toString();
			assert.ok(css.includes('#pc-wrap.trainer-programs-layout .trainer-program-row'));
			assert.ok(css.includes('grid-template-columns: 176px minmax(0, 1fr) auto'));
			assert.match(
				css,
				/@media \(max-width: 767px\)[\s\S]*?#pc-wrap\.trainer-programs-layout \.trainer-program-row\s*\{\s*display: flex;\s*flex-direction: column/,
			);
			assert.ok(css.includes('overflow-wrap: anywhere') && css.includes(':focus-visible'));
		}
	}
	pass('desktop/mobile SCSS compile; Programs-scoped rows, independent mobile cards and focus/long-text rules');
	return { i18n, resources };
}
async function integration({ i18n, resources }) {
	const previousLog = console.log,
		previousCwd = process.cwd();
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-trainer-programs-'));
	let fixture, root, client, dom;
	try {
		console.log = () => {};
		process.chdir(temporary);
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const { trainer, otherTrainer, user, admin, programs, program, token, gql } = fixture;
		const seed = async (owner, name, status = 'ACTIVE') => {
			const data = program.toObject();
			for (const key of ['_id', '__v', 'createdAt', 'updatedAt']) delete data[key];
			return programs.create({ ...data, memberId: owner._id, programName: name, programStatus: status });
		};
		for (let i = 1; i <= 5; i++) await seed(trainer, ('Management ' + i + ' long name '.repeat(15)).slice(0, 100));
		const paused = await seed(trainer, 'Paused editable Program', 'PAUSED');
		const foreign = await seed(otherTrainer, 'Other trainer private Program');
		const inquiry = { page: 1, limit: 5, sort: 'createdAt', direction: 'DESC', search: { programStatus: 'ACTIVE' } };
		for (const actor of [user, admin, null]) assert.ok((await gql('GET_TRAINER_PROGRAMS', inquiry, actor)).errors);
		const owned = await gql(
			'GET_TRAINER_PROGRAMS',
			{ ...inquiry, search: { ...inquiry.search, memberId: String(otherTrainer._id) } },
			trainer,
		);
		assert.equal(owned.data.getTrainerPrograms.metaCounter[0].total, 6);
		assert.ok(owned.data.getTrainerPrograms.list.every((row) => row.memberId === String(trainer._id)));
		assert.ok((await gql('UPDATE_PROGRAM', { _id: String(foreign._id), expectedRevision: 0, programStatus: 'DELETE' }, trainer)).errors);
		pass('real resolver/service TRAINER authorization, forced ownership and foreign update denial');

		const { JSDOM, VirtualConsole } = require('jsdom');
		const virtualConsole = new VirtualConsole();
		virtualConsole.on('jsdomError', (error) => {
			if (!error.message.includes('navigation')) throw error;
		});
		dom = new JSDOM('<div id="test-root"></div>', {
			url: 'http://localhost/mypage?category=myPrograms',
			virtualConsole,
		});
		Object.assign(global, {
			window: dom.window,
			document: dom.window.document,
			localStorage: dom.window.localStorage,
			HTMLElement: dom.window.HTMLElement,
			Image: dom.window.Image,
			DocumentFragment: dom.window.DocumentFragment,
			requestAnimationFrame: (fn) => setTimeout(fn, 0),
			cancelAnimationFrame: clearTimeout,
		});
		Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
		const React = require('react'),
			{ createRoot } = require('react-dom/client'),
			{ flushSync } = require('react-dom');
		const { ApolloClient, ApolloProvider, InMemoryCache, HttpLink } = require('@apollo/client');
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const fixtureFetch = require('next/dist/compiled/node-fetch');
		const fixtureAgent = new (require('node:http').Agent)({ keepAlive: false });
		let session = '',
			failRead = false,
			fault = '',
			failAfterWrite = false,
			holdReads = false,
			holdWrites = false;
		const requests = [],
			gates = [],
			routes = [];
		client = new ApolloClient({
			cache: new InMemoryCache(),
			link: new HttpLink({
				uri: fixture.uri,
				fetch: async (url, options) => {
					const body = JSON.parse(options.body),
						capturedSession = session;
					requests.push({ ...body, session: capturedSession });
					const read = body.operationName === 'GetTrainerPrograms',
						write = body.operationName === 'UpdateProgram';
					const held = (read && holdReads) || (write && holdWrites);
					if (read && failRead) throw new Error('Private read diagnostic');
					if (write && fault === 'rejected')
						return new Response(
							JSON.stringify({ errors: [{ message: 'Rejected fixture write', extensions: { code: 'FORBIDDEN' } }] }),
							{ headers: { 'Content-Type': 'application/json' } },
						);
					const response = await fixtureFetch(url, {
						agent: fixtureAgent,
						...options,
						headers: { ...options.headers, Authorization: 'Bearer ' + capturedSession },
					});
					if (write && failAfterWrite) failRead = true;
					if (held) await new Promise((resolve) => gates.push({ resolve, read, session: capturedSession }));
					if (write && fault === 'lost') throw new Error('Response lost after write');
					return response;
				},
			}),
		});
		const query = client.query.bind(client),
			mutate = client.mutate.bind(client);
		client.query = (options) => {
			if (options.query.definitions[0].name.value === 'GetTrainerPrograms') {
				assert.equal(options.fetchPolicy, 'no-cache');
				assert.equal(options.context.queryDeduplication, false);
				assert.equal(options.context.handleErrorLocally, true);
			}
			return query(options);
		};
		client.mutate = (options) => {
			assert.equal(options.fetchPolicy, 'no-cache');
			assert.equal(options.context.handleErrorLocally, true);
			return mutate(options);
		};
		let width = 1440,
			routeKey = 0;
		const router = {
			isReady: true,
			pathname: '/mypage',
			query: { category: 'myPrograms' },
			locale: 'en',
			asPath: '/mypage?category=myPrograms',
		};
		const route = async (href, replace = false) => {
			routes.push({ href, replace });
			if (typeof href === 'string') {
				const url = new URL(href, 'http://localhost');
				router.pathname = url.pathname;
				router.query = Object.fromEntries(url.searchParams);
			} else {
				router.pathname = href.pathname;
				router.query = href.query;
			}
			render();
			return true;
		};
		router.push = (href) => route(href);
		router.replace = (href) => route(href, true);
		const link = React.forwardRef(({ href, children, passHref, ...props }, ref) =>
			React.createElement(
				'a',
				{
					...props,
					ref,
					href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
					onClick: (event) => {
						event.preventDefault();
						props.onClick?.(event);
						void router.push(href);
					},
				},
				children,
			),
		);
		const noop = { __esModule: true, default: () => null };
		const auth = {
			getJwtToken: () => session, getAuthSessionId: () => session, ensureAccessToken: async () => session,
			updateUserInfo: async () => {},
			invalidateSession: () => {},
			isAuthenticationError: () => false,
		};
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/link': { __esModule: true, default: link },
			'next/head': noop,
			'next/image': { __esModule: true, default: (props) => React.createElement('img', props) },
			'next-i18next': { useTranslation: () => ({ t: i18n.getFixedT(router.locale) }) },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
			'@mui/material': {
				...require('@mui/material'),
				useMediaQuery: (q) => typeof q === 'string' && q.includes('max-width') && width <= Number(q.match(/\d+/)[0]),
			},
			'../../../apollo/store': store,
			'../../apollo/store': store,
			'../../auth': auth,
			'../../libs/auth': auth,
			'../Top': noop,
			'../Chat': noop,
			'../Footer': noop,
		};
		for (const name of [
			'MyFavorites',
			'RecentlyVisited',
			'MyProfile',
			'MyArticles',
			'MyMenu',
			'WriteArticle',
			'TrainerSchedule',
			'MyBookings',
			'TrainerReservations',
			'TrainerDashboard',
		])
			mocks['../../libs/components/mypage/' + name] = noop;
		for (const name of ['MemberFollowers', 'MemberFollowings']) mocks['../../libs/components/member/' + name] = noop;
		const Page = loadTs(path.join(__dirname, '../pages/mypage/index.tsx'), mocks).default;
		root = createRoot(document.getElementById('test-root'));
		const render = () =>
			root.render(
				React.createElement(
					React.StrictMode,
					null,
					React.createElement(ApolloProvider, { client }, React.createElement(Page, { key: routeKey })),
				),
			);
		const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
		const until = async (fn) => {
			const start = Date.now();
			while (!fn()) {
				if (Date.now() - start > 12000) throw new Error('Programs timeout: ' + document.body.textContent);
				await pause();
			}
		};
		const rows = () => [...document.querySelectorAll('.trainer-program-row')];
		const reads = () => requests.filter((r) => r.operationName === 'GetTrainerPrograms');
		const writes = () => requests.filter((r) => r.operationName === 'UpdateProgram');
		const settled = () => document.querySelector('.trainer-programs-collection')?.getAttribute('aria-busy') === 'false';
		const click = (selector) => {
			const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
			assert.ok(element, String(selector));
			flushSync(() => element.click());
		};
		const actionButton = (row, action) =>
			[...row.querySelectorAll('button')].find((b) => b.textContent.trim() === action);
		const tab = (status) =>
			[...document.querySelectorAll('.trainer-programs-tabs button')].find(
				(b) => b.textContent === resources.en.common['Trainer programs'][status],
			);
		const confirmButton = () =>
			document.querySelector('.trainer-program-confirmation .MuiDialogActions-root button:last-child');
		const feedback = () => document.querySelector('.trainer-programs-feedback')?.textContent;
		const signIn = (member) => {
			session = token(member);
			store.userVar({ ...member.toObject(), _id: String(member._id) });
		};
		store.authReadyVar(false);
		signIn(trainer);
		render();
		await until(() => document.body.textContent.includes(resources.en.common['Trainer programs']['Auth loading']));
		assert.equal(reads().length, 0);
		store.authReadyVar(true);
		render();
		await until(() => settled() && rows().length === 5);
		assert.equal(reads().at(-1).variables.input.search.programStatus, 'ACTIVE');
		assert.equal(document.querySelector('.trainer-programs-count').textContent, '6 programs');
		assert.ok(!document.body.textContent.includes(foreign.programName));
		pass('StrictMode/auth restoration, ACTIVE real query and metaCounter total independent of page length');
		assert.equal(
			document.querySelector('.trainer-programs-create').getAttribute('href'),
			'/mypage?category=addProgram',
		);
		const image = rows()[0].querySelector('img');
		flushSync(() => image.dispatchEvent(new window.Event('error')));
		assert.ok(rows()[0].querySelector('.trainer-program-image-fallback'));
		pass('canonical Create route and neutral broken-image fallback');
		click(tab('PAUSED'));
		await until(() => settled() && rows().length === 1 && rows()[0].dataset.programId === String(paused._id));
		assert.equal(reads().at(-1).variables.input.search.programStatus, 'PAUSED');
		click(actionButton(rows()[0], 'Edit'));
		await until(() => document.querySelector('#add-program-page input')?.value === paused.programName);
		assert.equal(router.query.programId, String(paused._id));
		assert.equal(JSON.parse(router.query.input).search.programStatus, 'PAUSED');
		await route({ pathname: '/mypage', query: { category: 'myPrograms', input: router.query.input } });
		await until(() => settled() && rows().length === 1);
		pass('PAUSED query and actual unchanged edit form loads with preserved management context');
		click(actionButton(rows()[0], 'Resume'));
		await until(() => confirmButton());
		assert.ok(document.querySelector('[role="dialog"]').textContent.includes('Resume Program?'));
		click(confirmButton());
		await until(() => settled() && document.querySelector('.is-empty'));
		assert.equal((await programs.findById(paused._id)).programStatus, 'ACTIVE');
		assert.ok(document.querySelector('.is-empty').textContent.includes('No paused programs'));
		assert.ok(!document.querySelector('.is-empty .trainer-programs-create'));
		pass('Resume confirmation, persisted ACTIVE status, authoritative refresh and contextual PAUSED empty');
		click(tab('ACTIVE'));
		await until(() => settled() && rows().length === 5);
		const target = rows()[0].dataset.programId;
		let before = writes().length;
		click(actionButton(rows()[0], 'Pause'));
		await until(() => confirmButton());
		assert.equal(writes().length, before);
		assert.ok(document.querySelector('[role="dialog"]').textContent.includes('hidden from public discovery'));
		click(document.querySelector('.trainer-program-confirmation .MuiDialogActions-root button:first-child'));
		await until(() => !document.querySelector('[role="dialog"]'));
		assert.equal(writes().length, before);
		click(actionButton(rows()[0], 'Pause'));
		await until(() => confirmButton());
		holdWrites = true;
		const confirmControl = confirmButton();
		flushSync(() => {
			confirmControl.click();
			confirmControl.click();
		});
		await until(() => gates.some((gate) => !gate.read));
		assert.equal(writes().length, before + 1);
		assert.ok(rows().every((row) => [...row.querySelectorAll('button')].every((b) => b.disabled)));
		holdWrites = false;
		gates.splice(0).forEach((gate) => gate.resolve());
		await until(() => settled() && feedback() === resources.en.common['Trainer programs'].Saved);
		assert.equal((await programs.findById(target)).programStatus, 'PAUSED');
		pass('Pause cancellation/confirmation, synchronous duplicate lock, pending controls and authoritative refresh');
		fault = 'rejected';
		before = writes().length;
		const rejectedId = rows()[0].dataset.programId;
		click(actionButton(rows()[0], 'Pause'));
		await until(() => confirmButton());
		click(confirmButton());
		await until(() => settled() && feedback() === resources.en.common['Trainer programs']['Mutation error']);
		assert.equal((await programs.findById(rejectedId)).programStatus, 'ACTIVE');
		assert.equal(writes().length, before + 1);
		fault = '';
		pass('rejected mutation remains distinct from success and is never automatically retried');
		failAfterWrite = true;
		before = writes().length;
		click(actionButton(rows()[0], 'Pause'));
		await until(() => confirmButton());
		click(confirmButton());
		await until(() => settled() && feedback() === resources.en.common['Trainer programs']['Sync error']);
		assert.ok(rows().length > 0 && document.querySelector('.is-error'));
		assert.ok(!document.querySelector('.is-empty'));
		assert.equal((await programs.findById(rejectedId)).programStatus, 'PAUSED');
		failAfterWrite = false;
		failRead = false;
		click('.is-error button');
		await until(() => settled() && !document.querySelector('.is-error'));
		assert.equal(writes().length, before + 1);
		pass('saved mutation + refresh failure preserves rows; Retry only reads and restores authoritative state');
		fault = 'lost';
		before = writes().length;
		const uncertainId = rows()[0].dataset.programId;
		click(actionButton(rows()[0], 'Pause'));
		await until(() => confirmButton());
		click(confirmButton());
		await until(() => settled() && feedback() === resources.en.common['Trainer programs'].Uncertain);
		assert.equal((await programs.findById(uncertainId)).programStatus, 'PAUSED');
		assert.equal(writes().length, before + 1);
		fault = '';
		pass('lost mutation response is reconciled through a read without repeating the write');

		// Restore six active disposable records to exercise a final-row deletion on page two.
		await programs.updateMany({ memberId: trainer._id }, { $set: { programStatus: 'ACTIVE' } });
		await programs.deleteOne({ _id: paused._id });
		await route({
			pathname: '/mypage',
			query: { category: 'myPrograms', input: JSON.stringify({ ...inquiry, page: 2 }) },
		});
		await until(() => settled() && rows().length === 1);
		const deletedId = rows()[0].dataset.programId;
		const existingReservations = await fixture.reservations.countDocuments({ programId: deletedId });
		click(actionButton(rows()[0], 'Delete'));
		await until(() => confirmButton());
		assert.ok(
			document
				.querySelector('[role="dialog"]')
				.textContent.includes('no longer appear in your Programs list or public discovery'),
		);
		assert.ok(!document.querySelector('[role="dialog"]').textContent.includes('cancel'));
		let falseEmpty = false;
		const observer = new window.MutationObserver(() => {
			if (document.querySelector('.is-empty')) falseEmpty = true;
		});
		observer.observe(document.getElementById('test-root'), { childList: true, subtree: true });
		before = writes().length;
		const deleteConfirm = confirmButton();
		flushSync(() => {
			deleteConfirm.click();
			deleteConfirm.click();
		});
		await until(() => settled() && rows().length === 5 && JSON.parse(router.query.input).page === 1);
		observer.disconnect();
		assert.equal(falseEmpty, false);
		assert.equal(writes().length, before + 1);
		assert.equal((await programs.findById(deletedId)).programStatus, 'DELETE');
		assert.ok((await programs.findById(deletedId)).deletedAt);
		assert.equal(await fixture.reservations.countDocuments({ programId: deletedId }), existingReservations);
		assert.ok(routes.some((entry) => entry.replace && JSON.parse(entry.href.query.input).page === 1));
		pass(
			'destructive soft-delete confirmation, duplicate protection, final-page/URL correction without false empty or reservation cancellation',
		);
		await seed(trainer, 'Second page pagination Program');
		await route({
			pathname: '/mypage',
			query: { category: 'myPrograms', input: JSON.stringify({ ...inquiry, page: 2 }) },
		});
		await until(() => settled() && rows().length === 1);
		click(document.querySelector('.trainer-programs-pagination button[aria-label="Go to page 1"]'));
		await until(() => settled() && JSON.parse(router.query.input).page === 1 && rows().length === 5);
		pass('real numbered pagination and URL context synchronization');
		// Capture A's real response, switch to B, then release A late.
		holdReads = true;
		await route({
			pathname: '/mypage',
			query: { category: 'myPrograms', input: JSON.stringify({ ...inquiry, page: 2 }) },
		});
		await until(() => gates.length > 0);
		holdReads = false;
		signIn(otherTrainer);
		render();
		await until(() => settled() && rows().length === 1 && rows()[0].dataset.programId === String(foreign._id));
		gates.splice(0).forEach((gate) => gate.resolve());
		await pause();
		await pause();
		assert.equal(rows().length, 1);
		assert.equal(rows()[0].dataset.programId, String(foreign._id));
		pass('account switch clears A rows; cache/dedup bypass and session/request fences discard A late response');
		signIn(trainer);
		await route({ pathname: '/mypage', query: { category: 'myPrograms' } });
		await until(() => settled() && rows().length === 5);
		holdWrites = true;
		click(actionButton(rows()[0], 'Pause'));
		await until(() => confirmButton());
		click(confirmButton());
		await until(() => gates.some((gate) => !gate.read));
		holdWrites = false;
		signIn(otherTrainer);
		render();
		await until(() => settled() && rows().length === 1 && rows()[0].dataset.programId === String(foreign._id));
		const readsBeforeLateWrite = reads().length;
		gates.splice(0).forEach((gate) => gate.resolve());
		await pause();
		await pause();
		assert.equal(reads().length, readsBeforeLateWrite);
		assert.equal(rows()[0].dataset.programId, String(foreign._id));
		assert.ok(!feedback());
		await programs.collection.updateOne({ _id: foreign._id }, { $set: { programImages: [] } });
		routeKey++;
		flushSync(render);
		await until(() => settled() && rows().length === 1);
		assert.ok(rows()[0].querySelector('.trainer-program-image-fallback'));
		assert.ok(!rows()[0].querySelector('img'));
		pass('late previous-account mutation cannot refresh B or change feedback; missing images use neutral fallback');
		for (const [viewport, ua] of [
			[1440, 'Desktop'],
			[390, 'Desktop'],
			[390, 'iPhone'],
			[900, 'iPhone'],
		]) {
			width = viewport;
			Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
			routeKey++;
			flushSync(render);
			await until(() => settled() && rows().length === 1);
			assert.ok(document.querySelector('#pc-wrap.trainer-programs-layout'));
			assert.ok(document.querySelector('.schedule-desktop-navigation [aria-current="page"][href*="myPrograms"]'));
			assert.ok(document.querySelector('.schedule-mobile-navigation [aria-current="page"][href*="myPrograms"]'));
			assert.ok(!document.querySelector('.left-config') && !document.body.textContent.includes('MY PAGE'));
		}
		pass('actual MyPage/Layout Workspace integration on desktop, 390px desktop/mobile UA and wide mobile UA');
		for (const locale of ['kr', 'ru']) {
			router.locale = locale;
			render();
			await pause();
			assert.ok(document.body.textContent.includes(resources[locale].common['Trainer programs'].Title));
		}
		router.locale = 'en';
		failRead = true;
		routeKey++;
		flushSync(render);
		await until(() => document.querySelector('.is-error button'));
		assert.ok(!document.querySelector('.is-empty'));
		before = writes().length;
		failRead = false;
		click('.is-error button');
		await until(() => settled() && rows().length === 1);
		assert.equal(writes().length, before);
		await programs.updateOne({ _id: foreign._id }, { $set: { programStatus: 'PAUSED' } });
		routeKey++;
		flushSync(render);
		await until(() => settled() && document.querySelector('.is-empty'));
		assert.ok(document.querySelector('.is-empty').textContent.includes('No programs yet'));
		assert.ok(document.querySelector('.is-empty .trainer-programs-create'));
		pass('localized rendering, initial read error/read-only Retry and intentional ACTIVE empty state');
		const privateReads = reads().length;
		store.userVar({ ...otherTrainer.toObject(), _id: String(otherTrainer._id), memberStatus: 'BLOCK' });
		render();
		await until(() => document.body.textContent.includes('Only trainers'));
		await fixture.members.updateOne({ _id: otherTrainer._id }, { $set: { memberStatus: 'BLOCK' } });
		assert.ok((await gql('GET_TRAINER_PROGRAMS', inquiry, otherTrainer)).errors);
		pass('inactive frontend state removes private content and the backend independently denies its token');
		for (const member of [user, admin]) {
			signIn(member);
			render();
			await until(() => document.body.textContent.includes('Only trainers'));
			assert.equal(rows().length, 0);
		}
		store.authErrorVar('Private authentication diagnostic');
		render();
		await pause();
		assert.ok(!document.body.textContent.includes('Private authentication diagnostic'));
		store.authErrorVar('');
		store.userVar({ ...store.emptyUser });
		session = '';
		render();
		await until(() => routes.some((entry) => entry.href === '/'));
		assert.equal(reads().length, privateReads);
		pass('USER/ADMIN denial, private auth-error handling and existing guest redirect without protected reads');
	} finally {
		console.log = previousLog;
		root?.unmount();
		client?.stop();
		dom?.window.close();
		if (fixture) await fixture.stop();
		process.chdir(previousCwd);
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
(async () => {
	const context = await staticChecks();
	if (!process.argv.includes('--static')) await integration(context);
	output(checks + ' Trainer Programs checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
