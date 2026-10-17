// Auth UI and session checks. All API writes use the existing disposable Nest/Mongo fixture.
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
async function unit() {
	const { safeAuthDestination, authErrorMessage } = loadTs(path.join(__dirname, '../libs/auth-form.ts'));
	for (const value of [
		undefined,
		null,
		['//example.com'],
		{},
		'https://example.com',
		'//example.com',
		'/\\example.com',
		'/%2fexample.com',
		'/%5cexample.com',
		'/\n/example.com',
		'/%0d/example.com',
	])
		assert.equal(safeAuthDestination(value), '/');
	for (const value of [
		'/program/booking?id=real&date=2027-01-01',
		'/mypage?category=myBookings&period=HISTORY',
		'/trainer',
		'/program?input=%7B%22text%22%3A%22a%20b%22%7D',
	])
		assert.equal(safeAuthDestination(value), value);
	pass('safe local return destinations retain route/query context and reject external/ambiguous URLs');
	assert.equal(
		authErrorMessage(
			{
				graphQLErrors: [
					{
						message: 'Bad Request Exception',
						extensions: { originalError: { message: ['Nickname validation', 'Password validation'] } },
					},
				],
			},
			'connection',
			'fallback',
		),
		'Nickname validation Password validation',
	);
	assert.equal(
		authErrorMessage({ graphQLErrors: [{ message: 'Wrong password!' }] }, 'connection', 'fallback'),
		'Wrong password!',
	);
	assert.equal(
		authErrorMessage({ networkError: new Error('private connection details') }, 'connection', 'fallback'),
		'connection',
	);
	assert.equal(authErrorMessage(null, 'connection', 'fallback'), 'fallback');
	pass('backend validation/business errors remain readable; connection failures use a safe localized message');
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{ common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')) },
		]),
	);
	await i18n.init({ resources, lng: 'en', defaultNS: 'common', ns: ['common'], initImmediate: false });
	for (const locale of ['en', 'kr', 'ru']) {
		assert.deepEqual(Object.keys(resources[locale].common.Auth).sort(), Object.keys(resources.en.common.Auth).sort());
		for (const key of Object.keys(resources.en.common.Auth)) {
			const value = i18n.getFixedT(locale)('Auth.' + key);
			assert.notEqual(value, 'Auth.' + key);
			assert.ok(!/\?{2,}|\ufffd/.test(value));
		}
	}
	pass('EN/KR/RU Auth keys and actual i18next resolution, including intact non-ASCII text');
}
async function logoutContract() {
	const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
	const storage = new Map();
	const navigation = [];
	let clearCache = () => Promise.resolve();
	const client = { clearStore: () => clearCache() };
	const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../libs/auth/index.ts'), 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
	}).outputText;
	const module = { exports: {} };
	const mocks = {
		'../../apollo/client': { initializeApollo: () => client },
		'../../apollo/store': store,
		'../../apollo/user/mutation': loadTs(path.join(__dirname, '../apollo/user/mutation.ts')),
		'../../apollo/user/query': loadTs(path.join(__dirname, '../apollo/user/query.ts')),
	};
	vm.runInNewContext('(function(require,module,exports){' + code + '\n})', {
		window: { location: { replace: (href) => navigation.push(href), reload: () => navigation.push('reload') } },
		localStorage: {
			getItem: (key) => storage.get(key) ?? null,
			setItem: (key, value) => storage.set(key, value),
			removeItem: (key) => storage.delete(key),
		},
	})((name) => mocks[name] || require(name), module, module.exports);
	const auth = module.exports;
	const authenticate = (memberType, id = 'a'.repeat(24)) => {
		store.userVar({ ...store.emptyUser, _id: id, memberType, memberStatus: 'ACTIVE' });
		storage.set('accessToken', 'owned-unit-token');
		navigation.length = 0;
	};
	authenticate('USER');
	let release;
	clearCache = () =>
		new Promise((resolve) => {
			release = resolve;
		});
	const pending = auth.logOut();
	assert.equal(storage.has('accessToken'), false);
	assert.ok(storage.has('logout'));
	assert.equal(store.userVar()._id, '');
	assert.equal(store.authReadyVar(), true);
	assert.deepEqual(navigation, []);
	release();
	assert.equal(await pending, true);
	assert.deepEqual(navigation, ['/']);
	pass('central no-argument USER logout captures role before invalidation and waits for cache cleanup before Home');
	clearCache = () => Promise.resolve();
	for (const [memberType, id] of [
		['TRAINER', 'a'.repeat(24)],
		['ADMIN', 'b'.repeat(24)],
		['', ''],
		['USER', ''],
	]) {
		authenticate(memberType, id);
		assert.equal(auth.logOut(), undefined);
		assert.deepEqual(navigation, ['reload']);
		assert.equal(storage.has('accessToken'), false);
		assert.equal(store.userVar()._id, '');
	}
	pass('TRAINER, ADMIN and guest logout retain their existing reload behavior');
	authenticate('USER');
	clearCache = async () => {
		throw new Error('owned cleanup failure');
	};
	assert.equal(await auth.logOut(), false);
	assert.deepEqual(navigation, []);
	assert.equal(storage.has('accessToken'), false);
	assert.equal(store.userVar()._id, '');
	pass('failed USER cleanup returns failure without navigation or an unhandled rejection');
}
async function integration() {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-auth-test-'));
	const previousCwd = process.cwd(),
		previousLog = console.log;
	let fixture, root, client, dom;
	try {
		console.log = () => {};
		process.chdir(temporary);
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const { JSDOM } = require('jsdom');
		dom = new JSDOM('<div id="test-root"></div>', { url: 'http://localhost/account/join' });
		Object.assign(global, {
			window: dom.window,
			document: dom.window.document,
			localStorage: dom.window.localStorage,
			HTMLElement: dom.window.HTMLElement,
			DocumentFragment: dom.window.DocumentFragment,
			requestAnimationFrame: (fn) => setTimeout(fn, 0),
			cancelAnimationFrame: clearTimeout,
		});
		Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
		const React = require('react'),
			{ hydrateRoot } = require('react-dom/client'),
			{ flushSync } = require('react-dom');
		const { ApolloClient, ApolloProvider, HttpLink, InMemoryCache } = require('@apollo/client');
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const requests = [],
			contexts = [],
			destinations = [];
		let hold = false,
			release,
			offline = false;
		client = new ApolloClient({
			cache: new InMemoryCache(),
			link: new HttpLink({
				uri: fixture.uri,
				fetch: async (url, options) => {
					const body = JSON.parse(options.body);
					requests.push(body);
					if (offline) throw new Error('private connection details');
					const response = await fetch(url, {
						...options,
						headers: { ...options.headers, Authorization: 'Bearer ' + window.localStorage.getItem('accessToken') },
					});
					if (hold)
						await new Promise((resolve) => {
							release = resolve;
						});
					return response;
				},
			}),
		});
		const mutate = client.mutate.bind(client);
		client.mutate = (options) => {
			contexts.push(options.context);
			return mutate(options);
		};
		const auth = loadTs(path.join(__dirname, '../libs/auth/index.ts'), {
			'../../apollo/client': { initializeApollo: () => client },
			'../../apollo/store': store,
		});
		const resources = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/en/common.json'), 'utf8'));
		const t = (key) => key.split('.').reduce((value, part) => value?.[part], resources) || key;
		const router = {
			pathname: '/account/join',
			query: {},
			locale: 'en',
			isReady: true,
			push: async (href) => {
				destinations.push(href);
				return true;
			},
		};
		const noop = { __esModule: true, default: () => null };
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/link': {
				__esModule: true,
				default: ({ href, children, passHref, ...props }) => React.createElement('a', { ...props, href }, children),
			},
			'next/head': noop,
			'next-i18next': { useTranslation: () => ({ t }) },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
			'../../libs/auth': auth,
			'../../../apollo/store': store,
			'../Top': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'legacy-top' }) },
			'../Footer': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'legacy-footer' }) },
			'../Chat': noop,
			'../program/ProgramsNavigation': { ProgramsBottomNavigation: () => null },
		};
		const Page = loadTs(path.join(__dirname, '../pages/account/join.tsx'), mocks).default;
		const wrap = () => React.createElement(ApolloProvider, { client }, React.createElement(Page));
		const { renderToString } = require('react-dom/server');
		const originalError = console.error;
		let markup;
		try {
			// MUI was loaded in the client test environment; its server layout-effect warning is expected here.
			console.error = (...args) => {
				if (!String(args[0]).includes('useLayoutEffect does nothing on the server')) originalError(...args);
			};
			markup = renderToString(wrap());
		} finally {
			console.error = originalError;
		}
		assert.ok(markup.includes('auth-password'));
		assert.ok(!markup.includes('LOGIN MOBILE'));
		document.getElementById('test-root').innerHTML = markup;
		const hydrationErrors = [];
		root = hydrateRoot(document.getElementById('test-root'), wrap(), {
			onRecoverableError: (error) => hydrationErrors.push(error),
		});
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.deepEqual(hydrationErrors, []);
		pass('server-rendered auth form hydrates without recoverable errors');
		const render = () => flushSync(() => root.render(wrap()));
		const until = async (condition) => {
			const started = Date.now();
			while (!condition()) {
				if (Date.now() - started > 15000) throw new Error('Auth check timeout');
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		};
		const select = (selector) => {
			const element = document.querySelector(selector);
			assert.ok(element, selector);
			return element;
		};
		const click = (selector) => flushSync(() => select(selector).click());
		const input = (name, value) =>
			flushSync(() => {
				const element = select(`[name="${name}"]`);
				Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value);
				element.dispatchEvent(new window.Event('input', { bubbles: true }));
			});
		const submit = () =>
			flushSync(() => select('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
		const writes = () => requests.filter((request) => ['Login', 'Signup'].includes(request.operationName));
		render();
		assert.ok(document.querySelector('.auth-layout .auth-header'));
		assert.ok(!document.querySelector('[data-test="legacy-top"], [data-test="legacy-footer"]'));
		assert.equal(document.querySelectorAll('form').length, 1);
		assert.ok(!document.body.textContent.includes('LOGIN MOBILE'));
		pass('auth route uses the dedicated shell and one form without legacy navbar/footer or placeholder');
		for (const [width, userAgent] of [
			[1440, 'Desktop'],
			[390, 'Desktop'],
			[390, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'],
		]) {
			window.innerWidth = width;
			Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
			window.dispatchEvent(new window.Event('resize'));
			render();
			await new Promise((resolve) => setTimeout(resolve, 30));
			assert.ok(document.querySelector('form #auth-password'));
			assert.ok(!document.body.textContent.includes('LOGIN MOBILE'));
		}
		pass('desktop, 390px desktop and actual mobile-user-agent paths keep the same working form');
		assert.equal(select('#auth-password').type, 'password');
		assert.equal(select('[name="nick"]').autocomplete, 'username');
		assert.equal(select('#auth-password').autocomplete, 'current-password');
		click('[aria-controls="auth-password"]');
		assert.equal(select('#auth-password').type, 'text');
		click('[aria-controls="auth-password"]');
		assert.equal(select('#auth-password').type, 'password');
		click('.auth-mode-switch button:nth-child(2)');
		assert.equal(select('#auth-password').type, 'password');
		assert.equal(select('[name="nick"]').autocomplete, 'username');
		assert.equal(select('#auth-password').autocomplete, 'new-password');
		assert.equal(select('#auth-confirmPassword').autocomplete, 'new-password');
		pass('Login/Signup retain credential autocomplete semantics independently from profile editing');
		click('[aria-controls="auth-confirmPassword"]');
		assert.equal(select('#auth-confirmPassword').type, 'text');
		pass('password visibility controls work independently and reset when auth mode changes');
		input('nick', 'auth-member');
		input('phone', 'auth-member-phone');
		input('password', fixture.password);
		input('confirmPassword', 'different');
		const beforeMismatch = writes().length;
		submit();
		assert.equal(writes().length, beforeMismatch);
		assert.equal(select('#auth-confirmPassword').getAttribute('aria-invalid'), 'true');
		assert.equal(document.activeElement.id, 'auth-confirmPassword');
		assert.equal(select('[role="alert"]').textContent, resources.Auth['Password mismatch']);
		pass('confirm-password mismatch prevents mutation and focuses the invalid field');
		input('confirmPassword', fixture.password);
		hold = true;
		flushSync(() => {
			const form = select('form');
			form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
			form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
		});
		await until(() => release);
		assert.equal(writes().length, beforeMismatch + 1);
		assert.ok(select('.auth-submit').disabled);
		assert.equal(select('form').getAttribute('aria-busy'), 'true');
		assert.ok([...document.querySelectorAll('.auth-mode-switch button')].every((button) => button.disabled));
		hold = false;
		release();
		release = undefined;
		await until(() => store.userVar().memberNick === 'auth-member' && !select('.auth-submit').disabled);
		const signup = writes().at(-1);
		assert.deepEqual(
			Object.keys(signup.variables.input).sort(),
			['memberNick', 'memberPassword', 'memberPhone', 'memberType'].sort(),
		);
		assert.equal(signup.variables.input.memberType, 'USER');
		assert.equal(store.userVar().memberType, 'USER');
		assert.ok(auth.getJwtToken());
		assert.equal(store.authReadyVar(), true);
		assert.equal(contexts.at(-1).handleErrorLocally, true);
		assert.equal(destinations.at(-1), '/');
		pass(
			'Member signup maps to USER, uses only contract fields, updates session and rejects same-tick duplicate submissions',
		);
		auth.invalidateSession();
		input('nick', 'auth-trainer');
		input('phone', 'auth-trainer-phone');
		click('[name="accountType"][value="TRAINER"]');
		submit();
		await until(() => store.userVar().memberNick === 'auth-trainer' && !select('.auth-submit').disabled);
		assert.equal(writes().at(-1).variables.input.memberType, 'TRAINER');
		assert.equal(store.userVar().memberType, 'TRAINER');
		pass('Trainer signup maps to TRAINER and uses the existing successful-signup session behavior');
		auth.invalidateSession();
		submit();
		await until(() => document.querySelector('[role="alert"]'));
		assert.ok(
			select('[role="alert"]').textContent.includes('nick') || select('[role="alert"]').textContent.includes('phone'),
		);
		assert.equal(store.userVar()._id, '');
		assert.equal(auth.getJwtToken(), '');
		pass('real duplicate signup backend error is displayed without inventing success/session state');
		input('nick', 'auth-nickname-too-long');
		submit();
		await until(() => document.querySelector('[role="alert"]'));
		assert.ok(select('[role="alert"]').textContent.includes('memberNick'));
		pass('real Nest validation response is displayed as field validation rather than generic Bad Request');
		click('.auth-mode-switch button:first-child');
		input('nick', fixture.user.memberNick);
		input('password', 'wrongpass');
		submit();
		await until(() => document.querySelector('[role="alert"]'));
		assert.ok(/password/i.test(select('[role="alert"]').textContent));
		assert.equal(store.userVar()._id, '');
		pass('real failed login exposes the backend business error and leaves the account unauthenticated');
		input('password', fixture.password);
		router.query.referrer = '/mypage?category=myBookings&period=HISTORY';
		submit();
		await until(() => store.userVar()._id === String(fixture.user._id) && !select('.auth-submit').disabled);
		assert.equal(destinations.at(-1), router.query.referrer);
		assert.deepEqual(writes().at(-1).variables.input, {
			memberNick: fixture.user.memberNick,
			memberPassword: fixture.password,
		});
		const savedToken = auth.getJwtToken();
		store.userVar({ ...store.emptyUser });
		await auth.updateUserInfo(savedToken);
		assert.equal(store.userVar()._id, String(fixture.user._id));
		assert.equal(store.authReadyVar(), true);
		assert.equal(store.authErrorVar(), '');
		assert.ok(requests.some((request) => request.operationName === 'CheckAuth'));
		assert.ok(requests.some((request) => request.operationName === 'GetMyMember'));
		assert.ok(!requests.some((request) => request.operationName === 'GetMember'));
		assert.equal(store.userVar().memberPhone, fixture.user.memberPhone);
		pass('real login preserves return context, token persistence and server-authoritative session restoration');
		const inquiry = { page: 1, limit: 5, search: { period: 'UPCOMING' } };
		const { GET_MY_RESERVATIONS } = loadTs(path.join(__dirname, '../apollo/user/query.ts'));
		const bookings = await client.query({
			query: GET_MY_RESERVATIONS,
			variables: { input: inquiry },
			fetchPolicy: 'network-only',
		});
		assert.ok(bookings.data.getMyReservations.list.length > 0);
		pass('restored USER session can query its real My Bookings through the same disposable API');
		auth.invalidateSession();
		assert.equal(auth.getJwtToken(), '');
		assert.equal(store.userVar()._id, '');
		assert.equal(store.authReadyVar(), true);
		input('password', fixture.password);
		router.query.referrer = '//example.com';
		submit();
		await until(() => store.userVar()._id && !select('.auth-submit').disabled);
		assert.equal(destinations.at(-1), '/');
		pass('unsafe post-auth destination falls back to Home; session invalidation remains intact');
		auth.invalidateSession();
		offline = true;
		input('password', fixture.password);
		submit();
		await until(() => document.querySelector('[role="alert"]'));
		assert.equal(select('[role="alert"]').textContent, resources.Auth['Connection error']);
		assert.ok(!select('.auth-submit').disabled);
		pass('connection failure returns the form to a retryable state without exposing connection details');
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
	await unit();
	await logoutContract();
	if (process.argv.includes('--integration')) await integration();
	output(checks + ' Auth checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
