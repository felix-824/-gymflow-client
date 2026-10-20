// Focused UI checks and real documents against the existing disposable Nest/Mongo fixture.
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
const helpers = loadTs(path.join(__dirname, '../libs/trainer-application.ts'));
const valid = {
	fullName: 'Alex Trainer',
	categories: ['MUSCLE_GAIN'],
	experienceSummary: 'Coaching experience',
	bio: 'My approach',
};
function unit() {
	assert.equal(helpers.trainerApplicationRoute, '/mypage?category=trainerApplication');
	assert.deepEqual(helpers.trainerApplicationCategories, [
		'WEIGHT_LOSS',
		'MUSCLE_GAIN',
		'YOGA',
		'PILATES',
		'CROSSFIT',
		'CARDIO',
		'REHAB',
	]);
	assert.deepEqual(helpers.trainerApplicationErrors(valid), {});
	for (const [field, min, max] of [
		['fullName', 3, 100],
		['experienceSummary', 1, 1000],
		['bio', 1, 2000],
	]) {
		for (const length of [min, max])
			assert.deepEqual(helpers.trainerApplicationErrors({ ...valid, [field]: '  ' + 'x'.repeat(length) + '  ' }), {});
		for (const value of ['   ', 'x'.repeat(min - 1), 'x'.repeat(max + 1)])
			assert(helpers.trainerApplicationErrors({ ...valid, [field]: value })[field]);
	}
	for (const categories of [[], ['BOXING'], ['RUNNING'], ['YOGA', 'YOGA']])
		assert(helpers.trainerApplicationErrors({ ...valid, categories }).categories);
	const payload = helpers.trainerApplicationPayload({
		...valid,
		fullName: ' Alex Trainer ',
		experienceSummary: ' Experience ',
		bio: ' Bio ',
		memberId: 'injected',
		status: 'APPROVED',
		memberType: 'TRAINER',
		previousApplicationId: 'injected',
	});
	assert.deepEqual(payload, {
		fullName: 'Alex Trainer',
		categories: ['MUSCLE_GAIN'],
		experienceSummary: 'Experience',
		bio: 'Bio',
	});
	assert.equal(helpers.trainerApplicationPayload(valid, 'a'.repeat(24)).previousApplicationId, 'a'.repeat(24));
	pass(
		'actual category contract, trimmed inclusive text boundaries, unique specialties and whitelisted/new-application payload',
	);
	const page = fs.readFileSync(path.join(__dirname, '../pages/mypage/index.tsx'), 'utf8');
	assert.match(page, /category === 'trainerApplication'\) return <TrainerApplication/);
	assert.match(page, /category !== 'trainerApplication'/);
	assert.match(page, /serverSideTranslations\(locale, \['common', 'trainer-application'\]/);
	const layout = fs.readFileSync(path.join(__dirname, '../libs/components/layout/LayoutBasic.tsx'), 'utf8');
	assert.match(layout, /userFavorites \|\| trainerApplication\)/);
	pass(
		'existing My Page controller routes trainerApplication through the modern shared layout and loads the separate namespace',
	);
}

async function translationLoadingChecks() {
	const pageFile = path.join(__dirname, '../pages/mypage/index.tsx');
	const source = ts.createSourceFile(pageFile, fs.readFileSync(pageFile, 'utf8'), ts.ScriptTarget.Latest);
	const mocks = Object.fromEntries(
		source.statements.filter(ts.isImportDeclaration).map((statement) => [statement.moduleSpecifier.text, {}]),
	);
	mocks['../../libs/components/layout/LayoutBasic'] = { __esModule: true, default: (page) => page };
	mocks['next-i18next/serverSideTranslations'] = require('next-i18next/serverSideTranslations');
	mocks['next-i18next'] = require('next-i18next');
	const { getStaticProps } = loadTs(pageFile, mocks);
	const appModule = require('next-i18next/dist/commonjs/appWithTranslation');
	const React = require('react');
	const { renderToStaticMarkup } = require('react-dom/server');
	const App = appModule.appWithTranslation(() => null);
	const originalEnvironment = process.env.NODE_ENV;
	try {
		process.env.NODE_ENV = 'development';
		const initial = await getStaticProps({ locale: 'en' });
		renderToStaticMarkup(React.createElement(App, { pageProps: initial.props }));
		for (const locale of ['en', 'kr', 'ru']) {
			// Simulate a long-running dev server that loaded the Phase 5C bundle before status keys existed.
			const stale = { Title: 'Become a GymFlow Trainer' };
			appModule.globalI18n.removeResourceBundle(locale, 'trainer-application');
			appModule.globalI18n.addResourceBundle(locale, 'trainer-application', stale);
			assert.equal(appModule.globalI18n.getResource(locale, 'trainer-application', 'PENDING title'), undefined);
			const loaded = await getStaticProps({ locale });
			const bundle = loaded.props._nextI18Next.initialI18nStore[locale]['trainer-application'];
			const expected = JSON.parse(
				fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'trainer-application.json'), 'utf8'),
			);
			assert.deepEqual(bundle, expected, locale + ' must refresh the stale server namespace from disk');
			for (const status of ['PENDING', 'REJECTED', 'APPROVED']) {
				for (const key of ['Status title', 'Status ' + status, status + ' title', status + ' copy']) {
					const translated = appModule.globalI18n.getFixedT(locale, 'trainer-application')(key);
					assert.equal(translated, expected[key]);
					assert.notEqual(translated, key, locale + ' must not expose ' + key);
				}
			}
		}
		process.env.NODE_ENV = 'production';
		appModule.globalI18n.removeResourceBundle('en', 'trainer-application');
		appModule.globalI18n.addResourceBundle('en', 'trainer-application', { Title: 'Cached production bundle' });
		const production = await getStaticProps({ locale: 'en' });
		assert.deepEqual(production.props._nextI18Next.initialI18nStore.en['trainer-application'], {
			Title: 'Cached production bundle',
		});
		pass(
			'real My Page translation loader refreshes stale EN/KR/RU status bundles in development; production caching stays enabled',
		);
	} finally {
		if (originalEnvironment === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = originalEnvironment;
	}
}

async function domChecks() {
	const previousGlobals = Object.fromEntries(
		['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator'].map((name) => [
			name,
			Object.getOwnPropertyDescriptor(global, name),
		]),
	);
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<div id="test-root"></div>', { url: 'http://localhost/mypage?category=trainerApplication' });
	Object.assign(global, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		DocumentFragment: dom.window.DocumentFragment,
	});
	Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { flushSync } = require('react-dom');
	const { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } = require('@apollo/client');
	const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
	const user = {
		...store.emptyUser,
		_id: 'a'.repeat(24),
		memberType: 'USER',
		memberStatus: 'ACTIVE',
		memberNick: 'member',
		memberFullName: 'Profile Name',
	};
	store.userVar(user);
	store.authReadyVar(true);
	store.authErrorVar('');
	let identity = 'session-1',
		locale = 'en',
		routerReady = true;
	let visibility = 'visible',
		roleRefreshCalls = 0,
		refreshedRole = 'TRAINER',
		holdRole = false,
		releaseRole;
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
	const nativeSetTimeout = global.setTimeout,
		nativeClearTimeout = global.clearTimeout;
	const pollingTimers = new Map();
	global.setTimeout = (callback, delay, ...args) => {
		const timer = nativeSetTimeout(callback, delay, ...args);
		if (delay === helpers.trainerApplicationPollInterval)
			pollingTimers.set(timer, () => {
				nativeClearTimeout(timer);
				pollingTimers.delete(timer);
				callback(...args);
			});
		return timer;
	};
	global.clearTimeout = (timer) => {
		pollingTimers.delete(timer);
		return nativeClearTimeout(timer);
	};
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((lng) => [
			lng,
			Object.fromEntries(
				['common', 'trainer-application'].map((ns) => [
					ns,
					JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', lng, ns + '.json'), 'utf8')),
				]),
			),
		]),
	);
	await i18n.init({ resources, lng: 'en', defaultNS: 'common', initImmediate: false });
	for (const [key, expected] of Object.entries({
		'Status title': 'Trainer Application',
		'Status PENDING': 'PENDING',
		'PENDING title': 'Your application is under review',
		'PENDING copy':
			'We’ve received your trainer application. Trainer access will remain unavailable until the application is approved.',
		'Review note':
			'Applications are reviewed before trainer access is enabled. Submitting an application does not automatically make your account a trainer account.',
		'Back to profile': 'Back to profile',
	}))
		assert.equal(i18n.getFixedT('en', 'trainer-application')(key), expected);
	for (const lng of ['en', 'kr', 'ru']) {
		assert.deepEqual(
			Object.keys(resources[lng]['trainer-application']).sort(),
			Object.keys(resources.en['trainer-application']).sort(),
		);
		for (const key of Object.keys(resources.en['trainer-application']))
			assert(i18n.exists(key, { lng, ns: 'trainer-application' }));
	}
	pass('EN/KR/RU separate application namespaces have matching keys and real i18next resolution');
	const mocks = {
		'../../../apollo/store': store,
		'../../auth': {
			getAuthSessionId: () => identity,
			updateUserInfo: async () => {
				roleRefreshCalls++;
				const owner = store.userVar()._id,
					session = identity;
				if (holdRole)
					await new Promise((resolve) => {
						releaseRole = resolve;
					});
				if (refreshedRole === 'error') throw new Error('Account refresh unavailable');
				if (owner === store.userVar()._id && session === identity)
					store.userVar({ ...store.userVar(), memberType: refreshedRole });
			},
			ensureAccessToken: async () => '',
			logOut: async () => true,
		},
		'../../hooks/useDeviceDetect': { __esModule: true, default: () => 'desktop' },
		'next/router': {
			useRouter: () => ({ isReady: routerReady, pathname: '/mypage', query: { category: 'trainerApplication' } }),
		},
		'next/link': {
			__esModule: true,
			default: ({ href, children, passHref, ...props }) =>
				React.createElement(
					'a',
					{ ...props, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) },
					children,
				),
		},
		'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(locale, ns ?? 'common'), i18n }) },
	};
	const Page = loadTs(path.join(__dirname, '../libs/components/mypage/TrainerApplication.tsx'), mocks).default;
	const Profile = loadTs(path.join(__dirname, '../libs/components/mypage/MyProfile.tsx'), mocks).default;
	const root = createRoot(document.getElementById('test-root'));
	let client,
		requests,
		latest,
		holdQuery,
		queryFailure,
		mutationFailure,
		holdMutation,
		releaseQuery,
		releaseMutation,
		version = 0;
	const receipt = (status = 'PENDING') => ({
		_id: 'b'.repeat(24),
		memberId: user._id,
		status,
		...valid,
		rejectionReason: null,
		reviewedAt: null,
		createdAt: '2026-10-20T00:00:00Z',
		updatedAt: '2026-10-20T00:00:00Z',
	});
	const until = async (condition) => {
		const started = Date.now();
		while (!condition()) {
			if (Date.now() - started > 5000) throw new Error('UI check timed out');
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	};
	const render = (Component = Page, props = {}) =>
		flushSync(() =>
			root.render(
				React.createElement(ApolloProvider, { client }, React.createElement(Component, { ...props, key: version })),
			),
		);
	const reset = () => {
		flushSync(() => root.render(null));
		client?.stop();
		requests = [];
		latest = null;
		holdQuery = false;
		queryFailure = false;
		mutationFailure = null;
		holdMutation = false;
		releaseQuery = null;
		releaseMutation = null;
		version++;
		identity = 'session-' + version;
		visibility = 'visible';
		roleRefreshCalls = 0;
		refreshedRole = 'TRAINER';
		holdRole = false;
		releaseRole = undefined;
		routerReady = true;
		store.userVar({ ...user });
		store.authReadyVar(true);
		store.authErrorVar('');
		client = new ApolloClient({
			cache: new InMemoryCache(),
			link: new ApolloLink(
				(operation) =>
					new Observable((observer) => {
						requests.push({
							name: operation.operationName,
							variables: operation.variables,
							context: operation.getContext(),
						});
						const respond = () => {
							if (operation.operationName === 'GetMyTrainerApplication') {
								if (queryFailure) observer.error(new Error('Connection unavailable'));
								else {
									observer.next({ data: { getMyTrainerApplication: latest } });
									observer.complete();
								}
							} else {
								if (mutationFailure === 'UNCERTAIN') {
									latest = { ...receipt(), ...operation.variables.input, _id: 'd'.repeat(24) };
									observer.error(new Error('Response lost after write'));
									return;
								} else if (mutationFailure) observer.next({ errors: [{ message: mutationFailure }] });
								else {
									latest = {
										...receipt(),
										...operation.variables.input,
										_id: operation.variables.input.previousApplicationId ? 'd'.repeat(24) : 'b'.repeat(24),
									};
									observer.next({ data: { submitTrainerApplication: latest } });
								}
								observer.complete();
							}
						};
						if (operation.operationName === 'GetMyTrainerApplication' && holdQuery) releaseQuery = respond;
						else if (operation.operationName === 'SubmitTrainerApplication' && holdMutation) releaseMutation = respond;
						else setTimeout(respond, 0);
					}),
			),
		});
	};
	const field = (name) => document.querySelector(`[name="${name}"]`);
	const input = (name, value) =>
		flushSync(() => {
			const element = field(name);
			assert(element, name);
			const prototype =
				element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
			Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
			element.dispatchEvent(new window.Event('input', { bubbles: true }));
		});
	const submit = () =>
		flushSync(() =>
			document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
		);
	const clickCategory = (label) =>
		flushSync(() =>
			[...document.querySelectorAll('.application-category-options button')]
				.find((button) => button.textContent === label)
				.click(),
		);
	const writes = () => requests.filter((request) => request.name === 'SubmitTrainerApplication');
	const fill = () => {
		input('fullName', ' Alex Trainer ');
		input('experienceSummary', ' Experience ');
		input('bio', ' Philosophy ');
		clickCategory('Yoga');
	};
	try {
		reset();
		for (const memberType of ['USER', 'TRAINER', 'ADMIN']) {
			for (const memberStatus of ['ACTIVE', 'BLOCK', 'DELETE']) {
				store.userVar({ ...user, memberType, memberStatus });
				version++;
				render(Profile, { userProfile: true });
				assert.equal(
					Boolean(document.querySelector('.user-profile-heading a[href="' + helpers.trainerApplicationRoute + '"]')),
					memberType === 'USER' && memberStatus === 'ACTIVE',
				);
			}
		}
		store.userVar({ ...store.emptyUser });
		version++;
		render(Profile, { userProfile: true });
		assert.equal(document.querySelector('.trainer-application-entry'), null);
		pass('actual MyProfile heading entry appears only for ACTIVE USER and hides for TRAINER/ADMIN/guest/BLOCK/DELETE');
		for (const account of [
			{ ...store.emptyUser },
			{ ...user, memberType: 'ADMIN' },
			{ ...user, memberStatus: 'BLOCK' },
			{ ...user, memberStatus: 'DELETE' },
		]) {
			reset();
			store.userVar(account);
			render();
			await new Promise((resolve) => setTimeout(resolve, 10));
			assert.equal(document.querySelector('form'), null);
			assert.equal(requests.length, 0);
		}
		reset();
		store.authReadyVar(false);
		render();
		assert.equal(requests.length, 0);
		assert(!document.querySelector('form'));
		reset();
		store.authErrorVar('Restore failed');
		render();
		assert.equal(requests.length, 0);
		assert(!document.querySelector('form'));
		reset();
		routerReady = false;
		render();
		assert.equal(requests.length, 0);
		assert(!document.querySelector('form'));
		pass(
			'route guards deny ineligible roles/statuses and wait for account/router readiness without querying or rendering a form',
		);
		reset();
		holdQuery = true;
		render();
		await until(() => releaseQuery);
		assert.equal(document.querySelector('form'), null);
		assert.deepEqual(requests[0].variables, {});
		assert.equal(requests[0].context.handleErrorLocally, true);
		releaseQuery();
		await until(() => document.querySelector('form'));
		assert.equal(field('fullName').value, 'Profile Name');
		assert.equal(document.querySelectorAll('.application-category-options button').length, 7);
		for (const name of ['fullName', 'experienceSummary', 'bio']) assert(field(name).labels.length);
		assert.equal(field('fullName').maxLength, 100);
		assert.equal(field('experienceSummary').maxLength, 1000);
		assert.equal(field('bio').maxLength, 2000);
		pass(
			'owner query has no memberId/input; unresolved query hides form; confirmed null shows labeled fields and unverified profile name prefill',
		);
		submit();
		assert(document.querySelector('#application-categories-error'));
		assert.equal(document.activeElement, field('experienceSummary'));
		assert.equal(writes().length, 0);
		fill();
		assert.equal(document.querySelector('[aria-pressed="true"]').textContent, 'Yoga');
		assert.equal(document.querySelector('#application-experienceSummary-count').textContent, '10 / 1000 characters');
		clickCategory('Yoga');
		assert.equal(document.querySelector('[aria-pressed="true"]'), null);
		clickCategory('Yoga');
		input('fullName', 'ab');
		submit();
		assert.equal(field('fullName').getAttribute('aria-invalid'), 'true');
		assert.equal(writes().length, 0);
		input('fullName', ' Alex Trainer ');
		input('experienceSummary', '   ');
		submit();
		assert.equal(writes().length, 0);
		input('experienceSummary', ' Experience ');
		input('bio', '   ');
		submit();
		assert.equal(writes().length, 0);
		input('bio', ' Philosophy ');
		pass(
			'specialties toggle with pressed/check states; required specialties and trimmed text validation prevent writes with field focus/errors and counters',
		);
		holdMutation = true;
		flushSync(() => {
			const form = document.querySelector('form');
			for (let i = 0; i < 3; i++) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
		});
		await until(() => releaseMutation);
		assert.equal(writes().length, 1);
		assert.equal(document.querySelector('form').getAttribute('aria-busy'), 'true');
		assert.deepEqual(writes()[0].variables.input, {
			fullName: 'Alex Trainer',
			categories: ['YOGA'],
			experienceSummary: 'Experience',
			bio: 'Philosophy',
		});
		releaseMutation();
		await until(() => !document.querySelector('form'));
		assert(document.body.textContent.includes('Your application is under review'));
		assert.equal(store.userVar().memberType, 'USER');
		assert(!document.body.textContent.includes(receipt()._id));
		assert(!document.body.textContent.includes(user._id));
		assert(document.querySelector('a[href="/mypage?category=myProfile"]'));
		pass(
			'same-tick submissions dispatch once with exact trimmed contract; backend PENDING receipt shows read-only state, keeps USER and hides internal IDs',
		);
		for (const status of ['PENDING', 'APPROVED', 'REJECTED']) {
			reset();
			latest = receipt(status);
			render();
			await until(() => document.body.textContent.includes(resources.en['trainer-application'][status + ' title']));
			assert(!document.querySelector('form'));
			assert.equal(writes().length, 0);
			assert(!document.body.textContent.includes(latest._id));
			assert.equal(document.querySelector('.application-status-label').textContent, status);
			assert.equal(
				document.querySelector('.application-status-overview > p:not(.application-status-label)').textContent,
				resources.en['trainer-application'][status + ' copy'],
			);
			assert(document.querySelector('dl').textContent.includes(latest.fullName));
			assert(document.querySelector('dl').textContent.includes(latest.experienceSummary));
			assert(document.querySelector('dl').textContent.includes(latest.bio));
			assert.equal(document.querySelector('.application-status-view input, .application-status-view textarea'), null);
			if (status === 'PENDING') {
				assert.equal(
					document.querySelector('.application-review-note').textContent,
					resources.en['trainer-application']['Review note'],
				);
				assert.equal(document.querySelector('.application-status-view button'), null);
				assert.equal(document.querySelector('a[href="/mypage?category=trainerDashboard"]'), null);
			}
			if (status === 'REJECTED') assert.equal(document.querySelector('.application-review-note'), null);
			if (status === 'APPROVED') {
				assert.deepEqual(
					[...document.querySelectorAll('.application-trainer-access li')].map((node) => node.textContent),
					['Create Programs', 'Manage Schedule', 'Manage Reservations'],
				);
				assert(
					document.querySelector('.application-submitted-summary h2').textContent.includes('Approved Application'),
				);
				assert(!document.querySelector('.application-status-view button')?.textContent.includes('Apply again'));
			}
		}
		pass(
			'PENDING/APPROVED/REJECTED render frozen read-only values and status/actions; no IDs, form, editing or duplicate writes',
		);
		const clickText = (text) =>
			flushSync(() => [...document.querySelectorAll('button')].find((button) => button.textContent === text).click());
		reset();
		latest = {
			...receipt('REJECTED'),
			rejectionReason: 'Please explain your coaching approach.\nInclude relevant experience.',
			reviewedBy: 'private-reviewer',
			reviewedAt: '2026-10-19T01:02:03Z',
		};
		const predecessor = latest,
			predecessorSnapshot = JSON.stringify(latest);
		render();
		await until(() => document.querySelector('.application-review-feedback'));
		assert.equal(document.querySelector('.application-review-feedback p').textContent, predecessor.rejectionReason);
		for (const hidden of [
			predecessor._id,
			predecessor.memberId,
			predecessor.reviewedBy,
			predecessor.reviewedAt,
			predecessor.createdAt,
		])
			assert(!document.body.textContent.includes(hidden));
		clickText('Apply again');
		assert(document.querySelector('form'));
		assert.equal(document.activeElement, field('fullName'));
		assert.equal(field('fullName').value, predecessor.fullName);
		assert.equal(field('bio').value, predecessor.bio);
		assert.equal(document.querySelector('[aria-pressed="true"]').textContent, 'Muscle gain');
		input('bio', ' Revised coaching philosophy ');
		mutationFailure = 'Application history changed; reload before submitting';
		submit();
		await until(() => document.querySelector('#application-error'));
		assert.equal(writes()[0].variables.input.previousApplicationId, predecessor._id);
		assert.equal(field('bio').value, ' Revised coaching philosophy ');
		assert.equal(JSON.stringify(predecessor), predecessorSnapshot);
		submit();
		assert.equal(writes().length, 1);
		clickText('Check application before retrying');
		await until(() => !document.querySelector('button[type="submit"]').disabled);
		assert.equal(field('bio').value, ' Revised coaching philosophy ');
		mutationFailure = null;
		holdMutation = true;
		flushSync(() => {
			const form = document.querySelector('form');
			for (let i = 0; i < 3; i++) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
		});
		await until(() => releaseMutation);
		assert.equal(writes().length, 2);
		assert.equal(writes()[1].variables.input.previousApplicationId, predecessor._id);
		assert.equal(writes()[1].variables.input.bio, 'Revised coaching philosophy');
		releaseMutation();
		await until(() => document.querySelector('.application-status-label')?.textContent === 'PENDING');
		assert.equal(JSON.stringify(predecessor), predecessorSnapshot);
		assert.notEqual(latest._id, predecessor._id);
		assert.equal(store.userVar().memberType, 'USER');
		pass(
			'REJECTED actual feedback stays private; Apply again opens/focuses an editable copy; failed retry preserves draft/predecessor and rapid successful resubmission creates new PENDING',
		);
		reset();
		latest = receipt('REJECTED');
		render();
		await until(() => document.querySelector('.application-status-label'));
		clickText('Apply again');
		input('bio', 'Draft for uncertain write');
		mutationFailure = 'UNCERTAIN';
		submit();
		await until(() => document.querySelector('#application-error'));
		assert.equal(field('bio').value, 'Draft for uncertain write');
		assert.equal(writes().length, 1);
		submit();
		assert.equal(writes().length, 1);
		clickText('Check application before retrying');
		await until(() => document.querySelector('.application-status-label')?.textContent === 'PENDING');
		assert.equal(writes().length, 1);
		assert(!document.querySelector('form'));
		pass('uncertain reapplication response blocks replay and reconciles the new PENDING record through an owner read');
		reset();
		latest = receipt();
		holdRole = true;
		render();
		await until(() => document.querySelector('.application-status-label')?.textContent === 'PENDING');
		latest = receipt('APPROVED');
		window.dispatchEvent(new window.Event('focus'));
		await until(() => releaseRole);
		assert.equal(store.userVar().memberType, 'USER');
		assert.equal(roleRefreshCalls, 1);
		assert(!document.querySelector('a[href="/mypage?category=trainerDashboard"]'));
		assert(
			[...document.querySelectorAll('button')].find((button) => button.textContent === 'Go to Trainer Workspace')
				.disabled,
		);
		releaseRole();
		await until(() => document.querySelector('a[href="/mypage?category=trainerDashboard"]'));
		assert.equal(store.userVar().memberType, 'TRAINER');
		assert.equal(roleRefreshCalls, 1);
		assert.equal(document.querySelector('.application-status-label').textContent, 'APPROVED');
		assert(!/Verified Coach|certification|calendar sync|client roster/i.test(document.body.textContent));
		pass(
			'APPROVED waits for updateUserInfo, retains the same lifecycle across USER→TRAINER, enables only the real workspace route and adds no unsupported claims',
		);
		reset();
		latest = receipt('APPROVED');
		refreshedRole = 'USER';
		render();
		await until(() => document.querySelector('.application-role-reconciliation[role="alert"]'));
		assert.equal(roleRefreshCalls, 1);
		assert(!document.querySelector('a[href="/mypage?category=trainerDashboard"]'));
		window.dispatchEvent(new window.Event('focus'));
		await new Promise((resolve) => setTimeout(resolve, 30));
		assert.equal(roleRefreshCalls, 1);
		refreshedRole = 'TRAINER';
		clickText('Refresh trainer access');
		await until(() => document.querySelector('a[href="/mypage?category=trainerDashboard"]'));
		assert.equal(roleRefreshCalls, 2);
		pass(
			'unconfirmed approval cannot navigate to workspace or refresh-loop; explicit authoritative-role Retry recovers',
		);
		reset();
		store.userVar({ ...user, memberType: 'TRAINER' });
		render();
		await until(() => document.body.textContent.includes('Your trainer workspace is available'));
		assert(!document.querySelector('form, .application-status-label, dl'));
		assert(document.querySelector('a[href="/mypage?category=trainerDashboard"]'));
		assert.equal(roleRefreshCalls, 0);
		pass(
			'grandfathered ACTIVE TRAINER with no application retains workspace access without a form or fabricated approval',
		);
		reset();
		latest = receipt();
		render();
		await until(() => pollingTimers.size > 0);
		assert.equal(helpers.trainerApplicationPollInterval, 30000);
		const beforePoll = requests.length;
		[...pollingTimers.values()][0]();
		await until(() => requests.length > beforePoll);
		await until(() => pollingTimers.size > 0);
		visibility = 'hidden';
		document.dispatchEvent(new window.Event('visibilitychange'));
		assert.equal(pollingTimers.size, 0);
		const hiddenRequests = requests.length;
		window.dispatchEvent(new window.Event('focus'));
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(requests.length, hiddenRequests);
		visibility = 'visible';
		document.dispatchEvent(new window.Event('visibilitychange'));
		await until(() => requests.length > hiddenRequests);
		await new Promise((resolve) => setTimeout(resolve, 20));
		latest = { ...receipt('REJECTED'), rejectionReason: 'Add experience details' };
		window.dispatchEvent(new window.Event('focus'));
		await until(() => document.querySelector('.application-status-label')?.textContent === 'REJECTED');
		assert.equal(pollingTimers.size, 0);
		pass(
			'entry/focus reads and 30-second PENDING polling refresh state; hidden tabs pause polling and terminal status stops it',
		);
		reset();
		queryFailure = true;
		render();
		await until(() => document.querySelector('[role="alert"]'));
		assert(!document.querySelector('form'));
		queryFailure = false;
		flushSync(() => document.querySelector('.application-notice button').click());
		await until(() => document.querySelector('form'));
		fill();
		mutationFailure = 'A pending or approved trainer application already exists';
		submit();
		await until(() => document.querySelector('#application-error'));
		assert.equal(document.querySelector('#application-error').textContent, mutationFailure);
		assert.equal(document.querySelector('button[type="submit"]').disabled, true);
		submit();
		assert.equal(writes().length, 1);
		latest = receipt();
		flushSync(() =>
			[...document.querySelectorAll('button')]
				.find((button) => button.textContent.includes('Check application'))
				.click(),
		);
		await until(() => document.body.textContent.includes('Your application is under review'));
		assert.equal(writes().length, 1);
		pass(
			'query errors fail closed with read-only Retry; backend submit error stays readable and duplicate recovery reads existing state without replay',
		);
		reset();
		render();
		await until(() => document.querySelector('form'));
		fill();
		holdMutation = true;
		submit();
		await until(() => releaseMutation);
		const releaseOldMutation = releaseMutation;
		flushSync(() => {
			identity = 'new-session';
			store.userVar({ ...user, _id: 'c'.repeat(24) });
		});
		await until(() => document.querySelector('form') && field('bio').value === '');
		releaseOldMutation();
		await new Promise((resolve) => setTimeout(resolve, 30));
		assert(!document.body.textContent.includes('Your application is under review'));
		assert.equal(store.userVar()._id, 'c'.repeat(24));
		pass('obsolete mutation completion cannot show success or change the next account/session');
		for (locale of ['en', 'kr', 'ru']) {
			reset();
			render();
			await until(() => document.querySelector('form'));
			assert.equal(document.querySelector('h1').textContent, resources[locale]['trainer-application'].Title);
			assert.equal(
				document.querySelector('.application-category-options button').textContent,
				resources[locale].common.WEIGHT_LOSS,
			);
			assert.equal(
				document.querySelector('.trainer-application-editorial img').getAttribute('src'),
				'/img/fiber/strength-barbell.webp',
			);
			for (const status of ['PENDING', 'REJECTED', 'APPROVED']) {
				reset();
				latest = { ...receipt(status), rejectionReason: 'Actual feedback' };
				render();
				await until(() => document.querySelector('.application-status-label'));
				assert.equal(
					document.querySelector('.application-status-label').textContent,
					resources[locale]['trainer-application']['Status ' + status],
				);
				assert.equal(
					document.querySelector('#application-status-heading').textContent,
					resources[locale]['trainer-application'][status + ' title'],
				);
				assert.equal(
					document.querySelector('h1').textContent,
					resources[locale]['trainer-application']['Status title'],
				);
				assert.equal(
					document.querySelector('.application-breadcrumb [aria-current="page"]').textContent,
					resources[locale]['trainer-application']['Status title'],
				);
				assert.equal(
					document.querySelector('.application-status-overview > p:not(.application-status-label)').textContent,
					resources[locale]['trainer-application'][status + ' copy'],
				);
				assert.doesNotMatch(
					document.getElementById('trainer-application-page').textContent,
					/Status title|Status (?:PENDING|REJECTED|APPROVED)|(?:PENDING|REJECTED|APPROVED) (?:title|copy)/,
				);
				if (status === 'PENDING') {
					assert.equal(
						document.querySelector('.application-review-note').textContent,
						resources[locale]['trainer-application']['Review note'],
					);
					assert.equal(
						document.querySelector('.application-status-overview a[href="/mypage?category=myProfile"]').textContent,
						resources[locale]['trainer-application']['Back to profile'],
					);
				}
			}
		}
		pass(
			'EN/KR/RU state titles, copy, breadcrumb and PENDING note/action render without key fallbacks; approved form/photo stay unchanged',
		);
	} finally {
		flushSync(() => root.unmount());
		client?.stop();
		for (const timer of pollingTimers.keys()) nativeClearTimeout(timer);
		pollingTimers.clear();
		global.setTimeout = nativeSetTimeout;
		global.clearTimeout = nativeClearTimeout;
		dom.window.close();
		for (const [name, descriptor] of Object.entries(previousGlobals)) {
			if (descriptor) Object.defineProperty(global, name, descriptor);
			else delete global[name];
		}
	}
}

async function integration() {
	let fixture;
	const previousCwd = process.cwd(),
		previousLog = console.log;
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-application-test-'));
	try {
		console.log = () => {};
		process.chdir(temporary);
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const backendRequire = require('node:module').createRequire(path.join(__dirname, '../../gymflow/package.json'));
		const { validate } = backendRequire('graphql');
		const { GraphQLSchemaHost } = backendRequire('@nestjs/graphql');
		const { GET_MY_TRAINER_APPLICATION } = loadTs(path.join(__dirname, '../apollo/user/query.ts'));
		const { SUBMIT_TRAINER_APPLICATION } = loadTs(path.join(__dirname, '../apollo/user/mutation.ts'));
		for (const document of [GET_MY_TRAINER_APPLICATION, SUBMIT_TRAINER_APPLICATION]) {
			assert.deepEqual(validate(fixture.app.get(GraphQLSchemaHost).schema, document), []);
		}
		assert.equal(
			(await fixture.gql('GET_MY_TRAINER_APPLICATION', undefined, fixture.user)).data.getMyTrainerApplication,
			null,
		);
		const result = await fixture.gql(
			'SUBMIT_TRAINER_APPLICATION',
			helpers.trainerApplicationPayload(valid),
			fixture.user,
		);
		assert.equal(result.errors, undefined, JSON.stringify(result.errors));
		const application = result.data.submitTrainerApplication;
		assert.equal(application.status, 'PENDING');
		assert.equal(application.memberId, String(fixture.user._id));
		assert.equal((await fixture.members.findById(fixture.user._id)).memberType, 'USER');
		assert.equal(
			(await fixture.gql('GET_MY_TRAINER_APPLICATION', undefined, fixture.user)).data.getMyTrainerApplication._id,
			application._id,
		);
		for (const member of [null, fixture.trainer, fixture.admin])
			assert((await fixture.gql('SUBMIT_TRAINER_APPLICATION', valid, member)).errors?.length);
		assert((await fixture.gql('GET_MY_TRAINER_APPLICATION', undefined, null)).errors?.length);
		assert((await fixture.gql('SUBMIT_TRAINER_APPLICATION', valid, fixture.user)).errors?.length);
		assert.equal(await fixture.db.model('TrainerApplication').countDocuments({ memberId: fixture.user._id }), 1);
		pass(
			'real frontend documents validate against backend; owner-scoped null/read/submit creates PENDING without promotion; guest/role and duplicate guards hold',
		);
		const applications = fixture.db.model('TrainerApplication');
		const { TrainerApplicationService } = backendRequire(
			path.join(
				__dirname,
				'../../gymflow/apps/gymflow-api/src/components/trainer-application/trainer-application.service.ts',
			),
		);
		const service = fixture.app.get(TrainerApplicationService);
		await service.reviewTrainerApplication(fixture.admin._id, {
			applicationId: application._id,
			decision: 'REJECTED',
			rejectionReason: 'More detail needed',
		});
		const rejectedSnapshot = JSON.parse(JSON.stringify(await applications.findById(application._id).lean()));
		assert.equal(
			(await fixture.gql('GET_MY_TRAINER_APPLICATION', undefined, fixture.user)).data.getMyTrainerApplication
				.rejectionReason,
			'More detail needed',
		);
		assert((await fixture.gql('SUBMIT_TRAINER_APPLICATION', valid, fixture.user)).errors?.length);
		const again = await fixture.gql(
			'SUBMIT_TRAINER_APPLICATION',
			helpers.trainerApplicationPayload(valid, application._id),
			fixture.user,
		);
		assert.equal(again.errors, undefined, JSON.stringify(again.errors));
		assert.notEqual(again.data.submitTrainerApplication._id, application._id);
		assert.equal((await applications.findById(application._id)).status, 'REJECTED');
		assert.deepEqual(JSON.parse(JSON.stringify(await applications.findById(application._id).lean())), rejectedSnapshot);
		assert.equal(await applications.countDocuments({ memberId: fixture.user._id }), 2);
		pass(
			'actual backend rejection is owner-readable; reapplication requires previousApplicationId and creates a new PENDING record with identical preserved rejected history',
		);
		const approvedId = again.data.submitTrainerApplication._id;
		await service.reviewTrainerApplication(fixture.admin._id, { applicationId: approvedId, decision: 'APPROVED' });
		assert.equal(
			(await fixture.gql('GET_MY_TRAINER_APPLICATION', undefined, fixture.user)).data.getMyTrainerApplication.status,
			'APPROVED',
		);
		assert.equal((await fixture.members.findById(fixture.user._id)).memberType, 'TRAINER');
		assert((await fixture.gql('SUBMIT_TRAINER_APPLICATION', valid, fixture.user)).errors?.length);
		assert.equal(
			(await fixture.gql('GET_MY_TRAINER_APPLICATION', undefined, fixture.trainer)).data.getMyTrainerApplication,
			null,
		);
		pass(
			'real approval promotes the backend account; original session reads APPROVED and prevents reapplication; grandfathered trainer has no fabricated record',
		);
		const previousGlobals = Object.fromEntries(
			['window', 'localStorage'].map((name) => [name, Object.getOwnPropertyDescriptor(global, name)]),
		);
		let client;
		try {
			global.window = {};
			const storage = new Map();
			global.localStorage = {
				getItem: (key) => storage.get(key) ?? null,
				setItem: (key, value) => storage.set(key, value),
				removeItem: (key) => storage.delete(key),
			};
			const { ApolloClient, ApolloLink, HttpLink, InMemoryCache } = require('@apollo/client');
			const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
			let auth;
			client = new ApolloClient({
				cache: new InMemoryCache(),
				link: new ApolloLink((operation, forward) => {
					operation.setContext({ headers: { Authorization: 'Bearer ' + auth.getJwtToken() } });
					return forward(operation);
				}).concat(new HttpLink({ uri: fixture.uri, fetch: fixture.sessionFetch })),
			});
			auth = loadTs(path.join(__dirname, '../libs/auth/index.ts'), {
				'../../apollo/client': { initializeApollo: () => client },
				'../../apollo/store': store,
			});
			const originalToken = fixture.token(fixture.user);
			auth.setJwtToken(originalToken);
			store.userVar({ ...store.emptyUser, _id: String(fixture.user._id), memberType: 'USER', memberStatus: 'ACTIVE' });
			const originalSession = auth.getAuthSessionId();
			await auth.updateUserInfo();
			assert.equal(store.userVar().memberType, 'TRAINER');
			assert.equal(store.userVar().memberStatus, 'ACTIVE');
			assert.equal(auth.getJwtToken(), originalToken);
			assert.equal(auth.getAuthSessionId(), originalSession);
			assert.equal(store.authReadyVar(), true);
			assert.equal(storage.has('accessToken'), false);
			pass(
				'actual updateUserInfo GET_MY_MEMBER reconciles stale USER to ACTIVE TRAINER while retaining the same healthy memory-only token/session',
			);
		} finally {
			client?.stop();
			for (const [name, descriptor] of Object.entries(previousGlobals)) {
				if (descriptor) Object.defineProperty(global, name, descriptor);
				else delete global[name];
			}
		}
	} finally {
		await fixture?.stop();
		console.log = previousLog;
		process.chdir(previousCwd);
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
(async () => {
	unit();
	await translationLoadingChecks();
	await domChecks();
	if (process.argv.includes('--integration')) await integration();
	output(checks + ' trainer application checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
