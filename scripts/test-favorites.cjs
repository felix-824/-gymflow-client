// Favorites uses real GraphQL/MongoDB fixtures; fault injection targets responses only.
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
	await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	for (const locale of ['en', 'kr', 'ru']) {
		assert.deepEqual(
			Object.keys(resources[locale].common['User favorites']).sort(),
			Object.keys(resources.en.common['User favorites']).sort(),
		);
		for (const key of Object.keys(resources.en.common['User favorites'])) {
			const value = i18n.getFixedT(locale)('User favorites.' + key, { count: 21, page: 3, name: 'Program' });
			assert.ok(value !== 'User favorites.' + key && !value.includes('{{'), key);
		}
		for (const count of [0, 1, 2, 5, 21])
			assert.ok(i18n.getFixedT(locale)('User favorites.Saved count', { count }).includes(String(count)));
	}
	assert.equal(i18n.getFixedT('en')('User favorites.Saved count', { count: 1 }), '1 saved program');
	assert.equal(i18n.getFixedT('en')('User favorites.Saved count', { count: 2 }), '2 saved programs');
	assert.equal(i18n.getFixedT('ru')('User favorites.Saved count', { count: 1 }), '1 сохранённая программа');
	assert.equal(i18n.getFixedT('ru')('User favorites.Saved count', { count: 2 }), '2 сохранённые программы');
	assert.equal(i18n.getFixedT('ru')('User favorites.Saved count', { count: 5 }), '5 сохранённых программ');
	pass('EN/KR/RU key parity, interpolation and actual singular/plural resolution');
	const css = require('sass')
		.renderSync({ file: path.join(__dirname, '../scss/pc/mypage/myFavorites.scss') })
		.css.toString();
	assert.ok(css.includes('repeat(4, minmax(0, 1fr))') && css.includes('grid-template-columns: minmax(0, 1fr)'));
	assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.user-favorites-layout #footer\s*\{\s*display: none/);
	assert.ok(css.includes('overflow-wrap: anywhere') && css.includes(':focus-visible'));
	pass('Favorites SCSS compiles; four-column/single-column grid, scoped mobile footer and long-text/focus rules');
	for (const variant of ['pc', 'mobile']) {
		const compiled = require('sass').renderSync({
			file: path.join(__dirname, '../scss', variant, 'main.scss'),
			importer: (url) => (url.startsWith('/scss/') ? { file: path.join(__dirname, '..', url.slice(1)) } : null),
		});
		assert.ok(compiled.css.length);
	}
	pass('complete desktop and mobile SCSS entrypoints compile with existing imports');
	return { i18n, resources };
}
function typecheck() {
	const configPath = path.join(__dirname, '../tsconfig.json');
	const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(
		{ ...config, exclude: [...config.exclude, 'skills', '.agents'] },
		ts.sys,
		path.dirname(configPath),
	);
	const program = ts.createProgram(parsed.fileNames, { ...parsed.options, incremental: false, noEmit: true });
	const errors = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
	if (errors.length)
		throw new Error(
			ts.formatDiagnosticsWithColorAndContext(errors, {
				getCurrentDirectory: ts.sys.getCurrentDirectory,
				getCanonicalFileName: (f) => f,
				getNewLine: () => '\n',
			}),
		);
	pass('full application TypeScript (only skill example directories excluded in memory)');
}
async function integration({ i18n, resources }) {
	const previousLog = console.log,
		previousCwd = process.cwd();
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-favorites-test-'));
	let fixture, dom, client, root;
	try {
		console.log = () => {};
		process.chdir(temporary);
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const { user, trainer, admin, program, programs, members, token, gql, uri } = fixture;
		const saved = [program];
		for (let index = 1; index < 9; index++) {
			const data = program.toObject();
			for (const key of ['_id', '__v', 'createdAt', 'updatedAt']) delete data[key];
			saved.push(
				await programs.create({
					...data,
					programName: ('Saved program ' + index + ' long text '.repeat(12)).slice(0, 100),
					programImages: ['broken-favorites.jpg'],
				}),
			);
		}
		// Missing media is a defensive display case; seed only this owned disposable record.
		await programs.collection.updateOne({ _id: saved[2]._id }, { $set: { programImages: [] } });
		for (const item of saved) assert.ok(!(await gql('LIKE_TARGET_PROGRAM', String(item._id), user)).errors);
		const secondUser = await members.create({
			memberNick: 'other-consumer',
			memberPassword: user.memberPassword,
			memberPhone: 'other-consumer',
			memberType: 'USER',
		});
		assert.ok(!(await gql('LIKE_TARGET_PROGRAM', String(saved[0]._id), secondUser)).errors);
		const { JSDOM, VirtualConsole } = require('jsdom');
		const virtualConsole = new VirtualConsole();
		virtualConsole.on('jsdomError', (error) => {
			if (!error.message.includes('navigation')) throw error;
		});
		dom = new JSDOM('<div id="test-root"></div>', {
			url: 'http://localhost/mypage?category=myFavorites',
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
		// Use fresh HTTP connections, avoiding Node fetch's idle pooled sockets during JSDOM startup.
		const fixtureFetch = global.fetch;
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const requests = [];
		let failRead = false,
			mutationFault = '',
			holdRead = false,
			holdMutation = false,
			releaseRead,
			releaseMutation,
			holdAuth = false,
			releaseAuth;
		client = new ApolloClient({
			cache: new InMemoryCache(),
			link: new HttpLink({
				uri,
				fetch: async (url, options) => {
					const body = JSON.parse(options.body);
					requests.push(body);
					if (body.operationName === 'GetFavorites' && failRead) throw new Error('Private network diagnostics');
					if (body.operationName === 'LikeTargetProgram' && mutationFault === 'rejected')
						return new Response(
							JSON.stringify({ errors: [{ message: 'Rejected', extensions: { code: 'FORBIDDEN' } }] }),
							{ headers: { 'Content-Type': 'application/json' } },
						);
					const response = await fixtureFetch(url, {
						...options,
						headers: { ...options.headers, Authorization: 'Bearer ' + auth.getJwtToken(), Connection: 'close' },
					});
					if (body.operationName === 'GetMyMember' && holdAuth)
						await new Promise((resolve) => {
							releaseAuth = resolve;
						});
					if (body.operationName === 'GetFavorites' && holdRead)
						await new Promise((resolve) => {
							releaseRead = resolve;
						});
					if (body.operationName === 'LikeTargetProgram' && holdMutation)
						await new Promise((resolve) => {
							releaseMutation = resolve;
						});
					if (body.operationName === 'LikeTargetProgram' && mutationFault === 'lost')
						throw new Error('Response lost after write');
					return response;
				},
			}),
		});
		const requestFailures = [];
		const query = client.query.bind(client);
		client.query = (options) => {
			if (options.query.definitions[0].name.value === 'GetFavorites') {
				assert.equal(options.context.handleErrorLocally, true);
				assert.equal(options.context.queryDeduplication, false);
				assert.equal(options.fetchPolicy, 'no-cache');
			}
			return query(options).catch((error) => {
				requestFailures.push(error.message);
				throw error;
			});
		};
		const mutate = client.mutate.bind(client);
		client.mutate = (options) => {
			assert.equal(options.context.handleErrorLocally, true);
			assert.equal(options.fetchPolicy, 'no-cache');
			return mutate(options);
		};
		const auth = loadTs(path.join(__dirname, '../libs/auth/index.ts'), {
			'../../apollo/client': { initializeApollo: () => client },
			'../../apollo/store': store,
		});
		let width = 1440;
		const router = {
			isReady: true,
			pathname: '/mypage',
			query: { category: 'myFavorites' },
			asPath: '/mypage?category=myFavorites',
			locale: 'en',
			push: async () => true,
		};
		const link = React.forwardRef(({ href, children, passHref, scroll, ...props }, ref) =>
			React.createElement(
				'a',
				{
					...props,
					ref,
					href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
				},
				children,
			),
		);
		const noop = { __esModule: true, default: () => null };
		const mocks = {
			'@mui/material': {
				...require('@mui/material'),
				useMediaQuery: (query) =>
					typeof query === 'string' && query.includes('max-width') ? width <= Number(query.match(/\d+/)[0]) : false,
			},
			'next/router': { useRouter: () => router },
			'next/link': { __esModule: true, default: link },
			'next/head': noop,
			'next/image': { __esModule: true, default: (props) => React.createElement('img', props) },
			'next-i18next': { useTranslation: () => ({ t: i18n.getFixedT(router.locale) }) },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
			'../../../apollo/store': store,
			'../../apollo/store': store,
			'../../auth': auth,
			'../../libs/auth': auth,
			'../Chat': noop,
			'../Footer': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'footer' }) },
		};
		for (const name of [
			'MyPrograms',
			'RecentlyVisited',
			'AddNewProgram',
			'MyProfile',
			'MyArticles',
			'WriteArticle',
			'TrainerSchedule',
			'MyBookings',
			'TrainerReservations',
			'TrainerDashboard',
		])
			mocks['../../libs/components/mypage/' + name] = noop;
		for (const name of ['MemberFollowers', 'MemberFollowings']) mocks['../../libs/components/member/' + name] = noop;
		const { ProgramsHeader } = loadTs(path.join(__dirname, '../libs/components/program/ProgramsNavigation.tsx'), mocks);
		mocks['../Top'] = {
			__esModule: true,
			default: ({ variant }) =>
				variant === 'programs'
					? React.createElement(ProgramsHeader)
					: React.createElement('div', { 'data-test': 'legacy-top' }),
		};
		const Page = loadTs(path.join(__dirname, '../pages/mypage/index.tsx'), mocks).default;
		root = createRoot(document.getElementById('test-root'));
		let routeKey = 0;
		const render = () =>
			flushSync(() =>
				root.render(React.createElement(ApolloProvider, { client }, React.createElement(Page, { key: routeKey }))),
			);
		const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
		const until = async (fn) => {
			const start = Date.now();
			while (!fn()) {
				if (Date.now() - start > 12000)
					throw new Error(
						'Favorites timeout: ' +
							document.body.textContent +
							'\nRequests: ' +
							requests.map((r) => r.operationName).join(', ') +
							'\nFailures: ' +
							requestFailures.join(', '),
					);
				await pause();
			}
		};
		const rows = () => [...document.querySelectorAll('.saved-program-card')];
		const reads = () => requests.filter((r) => r.operationName === 'GetFavorites');
		const writes = () => requests.filter((r) => r.operationName === 'LikeTargetProgram');
		const settled = () => document.querySelector('.user-favorites-collection')?.getAttribute('aria-busy') === 'false';
		const count = () => document.querySelector('.user-favorites-count')?.textContent;
		const heart = () => document.querySelector('.saved-program-heart');
		const click = (selector) => {
			const element = document.querySelector(selector);
			assert.ok(element, selector);
			flushSync(() => element.click());
		};
		const signIn = async (member) => {
			await auth.invalidateSession();
			auth.setJwtToken(token(member));
			await auth.updateUserInfo(auth.getJwtToken(), { ...member.toObject(), _id: String(member._id) });
		};
		const remount = async (member = user) => {
			if (member) await signIn(member);
			routeKey++;
			render();
			await until(settled);
		};

		// Actual auth restoration must finish getMyMember before a private Favorites read.
		auth.setJwtToken(token(user));
		holdAuth = true;
		const restore = auth.updateUserInfo(auth.getJwtToken());
		render();
		await until(() => releaseAuth);
		assert.equal(reads().length, 0);
		assert.ok(!document.querySelector('.is-empty'));
		holdAuth = false;
		releaseAuth();
		await restore;
		await until(settled);
		assert.equal(rows().length, 8);
		assert.equal(count(), '9 saved programs');
		assert.ok(
			requests.findIndex((r) => r.operationName === 'GetFavorites') >
				requests.findIndex((r) => r.operationName === 'GetMyMember'),
		);
		pass('no private read before actual auth restoration; real rows and metaCounter total independent of page length');
		assert.ok(document.querySelector('.programs-header, .user-favorites-layout'));
		assert.equal(document.querySelectorAll('.user-account-navigation').length, 1);
		assert.ok(
			document.querySelector('.user-account-navigation [aria-current="page"]').href.includes('category=myFavorites'),
		);
		assert.equal(document.querySelectorAll('.programs-bottom-navigation a').length, 5);
		assert.ok(!document.querySelector('#my-page .left-config'));
		const card = rows()[0];
		assert.equal(card.querySelector('a').getAttribute('href'), '/program/detail?id=' + card.dataset.programId);
		assert.ok(
			card.textContent.includes('0') && card.textContent.includes('/session') && card.textContent.includes('60'),
		);
		assert.ok(
			!card.textContent.includes('Fixture Trainer') && !card.querySelector('.discovery-likes, .discovery-views'),
		);
		assert.equal(card.querySelector('button').closest('a'), null);
		assert.equal(card.querySelector('button').getAttribute('aria-pressed'), 'true');
		assert.ok(rows().some((r) => r.querySelector('h2').textContent.length === 100));
		assert.ok(document.querySelector('.saved-program-image-fallback'));
		const image = document.querySelector('.saved-program-image img');
		assert.ok(image);
		const imageContainer = image.parentElement;
		flushSync(() => image.dispatchEvent(new window.Event('error')));
		assert.ok(!imageContainer.querySelector('img'));
		for (const link of document.querySelectorAll('.user-favorites-explore'))
			assert.equal(link.getAttribute('href'), '/program');
		pass('canonical card/CTA links, saved state, allowed fields only, long text, zero price and missing/broken images');
		for (const [viewport, ua] of [
			[1440, 'Desktop'],
			[390, 'Desktop'],
			[390, 'iPhone Mobile'],
		]) {
			width = viewport;
			Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
			await remount();
			assert.equal(rows().length, 8);
			assert.equal(document.querySelectorAll('.user-favorites-explore').length, 1);
			assert.ok(document.querySelector('.user-favorites-discovery .user-favorites-explore'));
			assert.ok(document.querySelector('.user-favorites-layout .programs-header'));
			assert.ok(document.querySelector('.programs-bottom-navigation'));
			assert.ok(!document.body.textContent.includes('MY FAVORITES MOBILE'));
			pass(`ACTIVE USER consumer structure at ${viewport}px / ${ua}`);
		}
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			render();
			assert.equal(
				document.querySelector('.user-favorites-heading h1').textContent,
				resources[locale].common['User favorites'].Title,
			);
			assert.ok(!document.getElementById('my-favorites-page').textContent.includes('User favorites.'));
		}
		router.locale = 'en';
		width = 1440;
		render();
		pass('actual localized card/page/account navigation render in EN/KR/RU');

		click('[aria-label="Go to page 2"]');
		await until(() => settled() && rows().length === 1);
		const finalId = rows()[0].dataset.programId,
			beforeWrites = writes().length;
		holdMutation = true;
		releaseMutation = undefined;
		let navigated = false;
		document.addEventListener('click', (event) => {
			if (event.target.closest('a')) navigated = true;
		});
		const button = heart();
		flushSync(() => {
			button.click();
			button.click();
		});
		await until(() => releaseMutation);
		assert.equal(writes().length, beforeWrites + 1);
		assert.ok(heart().disabled);
		assert.equal(navigated, false);
		assert.equal(rows().length, 1);
		assert.ok(!document.querySelector('.is-empty'));
		holdRead = true;
		releaseRead = undefined;
		holdMutation = false;
		releaseMutation();
		await until(() => releaseRead);
		assert.ok(!document.querySelector('.is-empty'));
		holdRead = false;
		releaseRead();
		await until(() => settled() && rows().length === 8 && count() === '8 saved programs');
		assert.ok(!rows().some((row) => row.dataset.programId === finalId));
		assert.deepEqual(
			reads()
				.slice(-2)
				.map((r) => r.variables.input.page),
			[2, 1],
		);
		pass(
			'real unlike, authoritative refetch, duplicate-click lock, heart isolation and final-page correction without false empty',
		);
		await remount();
		assert.equal(count(), '8 saved programs');
		pass('removed program stays removed after remount / fresh server read');

		mutationFault = 'rejected';
		const rejectedId = rows()[0].dataset.programId;
		click('.saved-program-heart');
		await until(() => settled() && document.querySelector('.user-favorites-feedback'));
		assert.ok(rows().some((r) => r.dataset.programId === rejectedId));
		assert.equal(count(), '8 saved programs');
		assert.equal(
			document.querySelector('.user-favorites-feedback').textContent,
			resources.en.common['User favorites']['Remove error'],
		);
		mutationFault = '';
		pass('rejected mutation preserves saved row and uses separate mutation feedback after reconciliation');
		failRead = true;
		const writeCount = writes().length;
		click('.saved-program-heart');
		await until(() => settled() && document.querySelector('.is-error'));
		assert.equal(writes().length, writeCount + 1);
		assert.equal(count(), '8 saved programs');
		assert.ok(heart().disabled);
		assert.equal(
			document.querySelector('.user-favorites-feedback').textContent,
			resources.en.common['User favorites']['Sync error'],
		);
		assert.ok(!document.body.textContent.includes('Private network'));
		failRead = false;
		click('.is-error button');
		await until(() => settled() && count() === '7 saved programs');
		assert.equal(writes().length, writeCount + 1);
		pass(
			'accepted removal + failed refetch keeps stale rows/count disabled; Retry reads only and restores authoritative state',
		);
		mutationFault = 'lost';
		const lostCount = writes().length;
		click('.saved-program-heart');
		await until(() => settled() && count() === '6 saved programs');
		assert.equal(writes().length, lostCount + 1);
		assert.equal(
			document.querySelector('.user-favorites-feedback').textContent,
			resources.en.common['User favorites'].Uncertain,
		);
		await pause();
		assert.equal(writes().length, lostCount + 1);
		pass('lost response after actual toggle reconciles server state and never blindly retries the mutation');
		failRead = true;
		click('.saved-program-heart');
		await until(() => settled() && document.querySelector('.is-error'));
		assert.equal(
			document.querySelector('.user-favorites-feedback').textContent,
			resources.en.common['User favorites']['Reconcile error'],
		);
		const uncertainWrites = writes().length;
		mutationFault = '';
		failRead = false;
		click('.is-error button');
		await until(() => settled() && count() === '5 saved programs');
		assert.equal(writes().length, uncertainWrites);
		pass('uncertain toggle + failed reconciliation stays protected until successful read-only Retry');

		failRead = true;
		await remount();
		assert.ok(document.querySelector('.is-error'));
		assert.equal(rows().length, 0);
		assert.ok(!document.querySelector('.is-empty'));
		failRead = false;
		holdRead = true;
		releaseRead = undefined;
		click('.is-error button');
		await until(() => releaseRead);
		assert.ok(document.querySelector('.user-favorites-loading'));
		assert.ok(!document.querySelector('.is-empty'));
		holdRead = false;
		releaseRead();
		await until(() => settled() && rows().length === 5);
		pass('initial loading/error/Retry are distinct from empty; recovery loads genuine results');

		// Account switch while a private read is in flight: old response cannot fill a new account or its cache.
		holdRead = true;
		releaseRead = undefined;
		routeKey++;
		render();
		await until(() => releaseRead);
		const oldReadRelease = releaseRead;
		holdRead = false;
		await signIn(secondUser);
		render();
		await until(() => settled() && count() === '1 saved program');
		oldReadRelease();
		await pause();
		assert.equal(count(), '1 saved program');
		assert.equal(rows()[0].dataset.programId, String(saved[0]._id));
		assert.ok(!Object.keys(client.cache.extract()).some((key) => key.startsWith('Program:')));
		pass('account changes reset pagination/private state; stale reads ignored and never cached or deduplicated');
		holdMutation = true;
		releaseMutation = undefined;
		click('.saved-program-heart');
		await until(() => releaseMutation);
		const oldMutationRelease = releaseMutation;
		await signIn(user);
		render();
		await until(() => settled() && count() === '5 saved programs');
		const readCount = reads().length;
		holdMutation = false;
		oldMutationRelease();
		await pause();
		assert.equal(count(), '5 saved programs');
		assert.equal(reads().length, readCount);
		assert.ok(!heart().disabled);
		assert.ok(!document.querySelector('.user-favorites-feedback'));
		pass('late mutation from old account cannot refetch or change current private rows/feedback/interaction locks');

		await remount(secondUser);
		assert.equal(count(), '0 saved programs');
		assert.ok(document.querySelector('.is-empty'));
		await gql('LIKE_TARGET_PROGRAM', String(saved[0]._id), secondUser);
		await remount(secondUser);
		assert.equal(count(), '1 saved program');
		click('.saved-program-heart');
		await until(() => settled() && count() === '0 saved programs');
		assert.ok(document.querySelector('.is-empty'));
		assert.equal(rows().length, 0);
		assert.equal(document.querySelector('.is-empty a').getAttribute('href'), '/program');
		assert.equal(document.querySelectorAll('.user-favorites-explore').length, 1);
		assert.ok(!document.querySelector('.user-favorites-discovery'));
		pass('remove final saved item transitions to real zero count and restrained empty state');
		for (const member of [trainer, admin]) {
			const before = reads().length;
			await signIn(member);
			render();
			await pause();
			assert.equal(reads().length, before);
			assert.ok(!document.querySelector('.user-account-navigation, .user-favorites-collection'));
			assert.ok(document.body.textContent.includes(resources.en.common.MyBookings.forbidden));
			pass(`${member.memberType} cannot query or receive the USER Favorites collection`);
		}
		await signIn(user);
		store.userVar({ ...store.userVar(), memberStatus: 'BLOCK' });
		render();
		await pause();
		assert.ok(!document.querySelector('.user-favorites-collection'));
		await auth.invalidateSession();
		render();
		await pause();
		const guestReads = reads().length;
		assert.ok(document.querySelector('#my-favorites-page a[href*="referrer="]'));
		assert.ok(!document.querySelector('.user-favorites-collection'));
		await pause();
		assert.equal(reads().length, guestReads);
		pass('blocked/guest access hides private state and offers sign-in with Favorites return route');
		store.authErrorVar('Private restoration diagnostic');
		render();
		assert.ok(document.querySelector('#my-favorites-page [role="alert"] button'));
		assert.ok(!document.body.textContent.includes('Private restoration diagnostic'));
		store.authErrorVar('');
		store.authReadyVar(false);
		router.isReady = false;
		render();
		assert.ok(!document.querySelector('.is-empty, .user-favorites-collection'));
		assert.equal(reads().length, guestReads);
		pass('restoration errors use existing localized access feedback/Retry; router initialization never queries');
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
	if (process.argv.includes('--typecheck')) typecheck();
	else {
		const context = await staticChecks();
		if (!process.argv.includes('--static')) await integration(context);
	}
	output(checks + ' Favorites checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
