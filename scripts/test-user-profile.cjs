// Profile flows use an owned disposable database and temporary upload directory only.
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
function loadTs(file, mocks = {}, cache = new Map(), browserWindow = global.window) {
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
			return loadTs(
				fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '.tsx',
				mocks,
				cache,
				browserWindow,
			);
		}
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports,window){' + code + '\n})', { filename: file })(
		localRequire,
		module,
		module.exports,
		browserWindow,
	);
	return module.exports;
}
async function locales() {
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{ common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')) },
		]),
	);
	await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	for (const locale of ['en', 'kr', 'ru']) {
		assert.deepEqual(
			Object.keys(resources[locale].common['User profile']).sort(),
			Object.keys(resources.en.common['User profile']).sort(),
		);
		for (const key of Object.keys(resources.en.common['User profile']))
			assert.ok(i18n.getFixedT(locale)('User profile.' + key) !== 'User profile.' + key);
	}
	pass('EN/KR/RU Profile JSON, matching keys and actual i18next resolution');
}
async function integration() {
	const previousLog = console.log,
		previousCwd = process.cwd();
	const previousGraphql = process.env.REACT_APP_API_GRAPHQL_URL;
	const NativeFormData = global.FormData,
		NativeBlob = global.Blob;
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-user-profile-test-'));
	let fixture, root, client, dom;
	try {
		console.log = () => {};
		process.chdir(temporary);
		fixture = await require('./test-trainer-reservations.cjs').createFixture({ multipart: true });
		process.env.REACT_APP_API_GRAPHQL_URL = fixture.uri;
		const { trainer, otherTrainer, user, admin, uri, members, token } = fixture;
		// Exercise an unset image using only this test's owned disposable member.
		user.memberImage = '';
		await user.save();
		const { JSDOM, VirtualConsole } = require('jsdom');
		const virtualConsole = new VirtualConsole();
		virtualConsole.on('jsdomError', (error) => {
			if (!error.message.includes('navigation')) throw error;
		});
		dom = new JSDOM('<div id="test-root"></div>', {
			url: 'http://localhost/mypage?category=myProfile',
			virtualConsole,
		});
		Object.assign(global, {
			window: dom.window,
			localStorage: dom.window.localStorage,
			document: dom.window.document,
			HTMLElement: dom.window.HTMLElement,
			Image: dom.window.Image,
			DocumentFragment: dom.window.DocumentFragment,
			FormData: dom.window.FormData,
			requestAnimationFrame: (fn) => setTimeout(fn, 0),
			cancelAnimationFrame: clearTimeout,
		});
		Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
		const React = require('react'),
			{ createRoot } = require('react-dom/client'),
			{ flushSync } = require('react-dom');
		const { ApolloClient, ApolloProvider, InMemoryCache, HttpLink } = require('@apollo/client');
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const requests = [],
			uploads = [];
		let holdSave = false,
			releaseSave,
			holdUpload = false,
			releaseUpload,
			failSave = false,
			lastReceipt;
		client = new ApolloClient({
			cache: new InMemoryCache(),
			link: new HttpLink({
				uri,
				fetch: async (url, options) => {
					const body = JSON.parse(options.body);
					requests.push(body);
					if (failSave && body.operationName === 'UpdateMember')
						throw new Error('Private connection details must not be displayed');
					const response = await fetch(url, {
						...options,
						headers: { ...options.headers, Authorization: 'Bearer ' + window.localStorage.getItem('accessToken') },
					});
					if (body.operationName === 'UpdateMember') {
						lastReceipt = (await response.clone().json()).data?.updateMember;
						if (holdSave)
							await new Promise((resolve) => {
								releaseSave = resolve;
							});
					}
					return response;
				},
			}),
		});
		// JSDOM cannot navigate; observe the real helper's full-page navigation through a window facade.
		const auth = loadTs(
			path.join(__dirname, '../libs/auth/index.ts'),
			{
				'../../apollo/client': { initializeApollo: () => client },
				'../../apollo/store': store,
			},
			new Map(),
			{
				location: {
					reload: () => dom.window.location.reload(),
					replace: (href) => {
						assert.equal(window.localStorage.getItem('accessToken'), null);
						assert.equal(store.userVar()._id, '');
						assert.equal(store.authReadyVar(), true);
						assert.equal(Object.keys(client.cache.extract()).length, 0);
						destinations.push(href);
						router.pathname = href;
						router.asPath = href;
						router.query = {};
						dom.reconfigure({ url: 'http://localhost' + href });
						render();
					},
				},
			},
		);
		let confirmedLogout = false,
			logoutCalls = 0;
		const authExports = {
			...auth,
			logOut: (...args) => {
				logoutCalls++;
				return auth.logOut(...args);
			},
		};
		const sweet = {
			sweetConfirmAlert: async () => confirmedLogout,
			sweetErrorHandling: async () => {},
			sweetMixinSuccessAlert: async () => {},
			sweetMixinErrorAlert: async () => {},
			sweetTopSmallSuccessAlert: async () => {},
		};
		const axios = {
			__esModule: true,
			default: {
				post: async (url, form, options) => {
					assert.equal(url, uri);
					assert.equal(options.headers['apollo-require-preflight'], true);
					assert.equal(options.headers.Authorization, 'Bearer ' + window.localStorage.getItem('accessToken'));
					const body = new NativeFormData();
					for (const [key, value] of form.entries()) {
						if (typeof value === 'string') body.append(key, value);
						else {
							const bytes = await new Promise((resolve, reject) => {
								const reader = new window.FileReader();
								reader.onload = () => resolve(reader.result);
								reader.onerror = reject;
								reader.readAsArrayBuffer(value);
							});
							body.append(key, new NativeBlob([bytes], { type: value.type }), value.name);
						}
					}
					const operations = JSON.parse(form.get('operations'));
					assert.equal(operations.variables.target, 'member');
					assert.deepEqual(JSON.parse(form.get('map')), { 0: ['variables.file'] });
					const response = await fetch(url, {
						method: 'POST',
						headers: { Authorization: options.headers.Authorization, 'apollo-require-preflight': 'true' },
						body,
					});
					const data = await response.json();
					uploads.push(data);
					if (holdUpload)
						await new Promise((resolve) => {
							releaseUpload = resolve;
						});
					return { data };
				},
			},
		};
		const texts = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/en/common.json'), 'utf8'));
		const t = (key) => key.split('.').reduce((value, part) => value?.[part], texts) || key;
		let mobile = false;
		const destinations = [];
		const router = {
			isReady: true,
			pathname: '/mypage',
			query: {},
			asPath: '/mypage',
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
		const noopPage = { __esModule: true, default: () => null };
		const mocks = {
			'@mui/material': {
				...require('@mui/material'),
				useMediaQuery: (query) => (typeof query === 'string' && query.includes('max-width') ? mobile : false),
			},
			'next/router': { useRouter: () => router },
			'next/link': { __esModule: true, default: link },
			'next/head': noopPage,
			'next/image': { __esModule: true, default: (props) => React.createElement('img', props) },
			'next-i18next': { useTranslation: () => ({ t }) },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
			'../../../apollo/store': store,
			'../../apollo/store': store,
			'../../auth': authExports,
			'../../libs/auth': authExports,
			'../../sweetAlert': sweet,
			'./../../sweetAlert': sweet,
			'../../libs/sweetAlert': sweet,
			axios: axios,
			'../Top': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'legacy-top' }) },
			'../Chat': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'legacy-chat' }) },
			'../Footer': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'existing-footer' }) },
		};
		for (const name of [
			'MyPrograms',
			'MyFavorites',
			'RecentlyVisited',
			'AddNewProgram',
			'MyArticles',
			'WriteArticle',
			'TrainerSchedule',
			'TrainerReservations',
			'TrainerDashboard',
		])
			mocks['../../libs/components/mypage/' + name] = noopPage;
		mocks['../../libs/components/mypage/MyBookings'] = {
			__esModule: true,
			default: () => React.createElement('p', { 'data-test': 'my-bookings' }),
		};
		for (const name of ['MemberFollowers', 'MemberFollowings'])
			mocks['../../libs/components/member/' + name] = noopPage;
		mocks['../../libs/components/mypage/MyFavorites'] = {
			__esModule: true,
			default: () => React.createElement('p', { 'data-test': 'my-favorites' }),
		};
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
		const wrap = (element) => React.createElement(ApolloProvider, { client }, element);
		let routeKey = 0;
		const render = () =>
			root.render(
				wrap(
					router.pathname === '/mypage'
						? React.createElement(Page, { key: routeKey })
						: React.createElement(ProgramsHeader),
				),
			);
		const until = async (fn) => {
			const start = Date.now();
			while (!fn()) {
				if (Date.now() - start > 12000) throw new Error('Profile timeout: ' + document.body.textContent);
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
				const field = select(`[name="${name}"]`);
				Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, value);
				field.dispatchEvent(new window.Event('input', { bubbles: true }));
			});
		const upload = (name, type = 'image/png') =>
			flushSync(() => {
				const field = select('#user-profile-image');
				Object.defineProperty(field, 'files', {
					configurable: true,
					value: [new window.File(['owned-profile-image'], name, { type })],
				});
				field.dispatchEvent(new window.Event('change', { bubbles: true }));
			});
		const writes = () => requests.filter((request) => request.operationName === 'UpdateMember');
		const signIn = async (member) => {
			const jwtToken = token(member);
			auth.updateStorage({ jwtToken });
			await auth.updateUserInfo(jwtToken, { ...member.toObject(), _id: String(member._id) });
		};
		store.authReadyVar(false);
		store.authErrorVar('');
		store.userVar({ ...user.toObject(), _id: String(user._id) });
		render();
		await until(() => document.body.textContent.includes(texts.MyBookings.initializing));
		assert.ok(!document.querySelector('#user-profile-page'));
		assert.equal(requests.length, 0);
		store.authErrorVar('private auth details');
		await until(() => document.querySelector('.user-profile-access[role="alert"]'));
		assert.ok(!document.body.textContent.includes('private auth details'));
		store.authErrorVar('');
		const login = await fixture.gql('LOGIN', { memberNick: user.memberNick, memberPassword: fixture.password }, null);
		assert.ok(!login.errors, JSON.stringify(login.errors));
		auth.updateStorage({ jwtToken: login.data.login.accessToken });
		await auth.updateUserInfo(login.data.login.accessToken);
		await until(() => document.querySelector('#user-profile-page'));
		pass('auth restoration gates fields and mutations; real login plus authenticated member restoration');
		for (const viewport of [
			{ width: 1440, agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
			{ width: 390, agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
			{ width: 390, agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' },
		]) {
			mobile = viewport.width <= 767;
			Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width });
			Object.defineProperty(navigator, 'userAgent', { configurable: true, value: viewport.agent });
			for (const query of [{}, { category: 'myProfile' }]) {
				router.query = query;
				routeKey++;
				render();
				await until(() => document.querySelector('#user-profile-page'));
				await new Promise((resolve) => setTimeout(resolve, 40));
				assert.ok(document.querySelector('#pc-wrap.user-profile-layout .programs-header'));
				assert.ok(!document.querySelector('#my-page .left-config'));
				assert.ok(!document.querySelector('.trainer-profile-layout'));
				assert.ok(!document.querySelector('[data-test="legacy-top"]'));
				assert.ok(!document.querySelector('[data-test="legacy-chat"]'));
				assert.equal(select('#user-profile-nick').value, user.memberNick);
				assert.equal(select('#user-profile-name').value, user.memberFullName);
				assert.equal(select('#user-profile-phone').value, user.memberPhone);
				assert.equal(select('#user-profile-address').value, user.memberAddress || '');
				assert.equal(select('#user-profile-nick').form.name, 'user-profile');
				assert.equal(select('#user-profile-nick').form.getAttribute('autocomplete'), 'on');
				assert.equal(select('#user-profile-nick').autocomplete, 'nickname');
				assert.equal(select('#user-profile-name').autocomplete, 'name');
				assert.equal(select('#user-profile-phone').autocomplete, 'tel');
				assert.equal(select('#user-profile-address').autocomplete, 'street-address');
				select('#user-profile-nick').focus();
				assert.equal(document.activeElement.id, 'user-profile-nick');
				assert.equal(select('#user-profile-nick').readOnly, false);
				assert.equal(select('#user-profile-nick').disabled, false);
				assert.ok(
					!document.querySelector(
						'#user-profile-page [autocomplete="username"], #user-profile-page input[type="password"]',
					),
				);
				assert.equal(document.querySelectorAll('.user-account-navigation a').length, 3);
				assert.ok(select('.user-account-navigation a[aria-current="page"]').href.includes('myProfile'));
				assert.equal(document.querySelectorAll('.programs-bottom-navigation a').length, 5);
				assert.ok(select('.programs-bottom-navigation a[aria-current="page"]').href.endsWith('/mypage'));
				assert.ok(document.querySelector('[data-test="existing-footer"]'));
				assert.ok(!document.body.textContent.includes('MY PROFILE PAGE MOBILE'));
			}
		}
		pass(
			'default/explicit USER Profile on desktop, narrow desktop and real iPhone UA; existing consumer header and five-item navigation',
		);
		pass('profile autocomplete semantics and normal accessible Nickname focus/editing at every viewport');
		input('memberNick', 'user-updated');
		input('memberFullName', 'Updated Real User');
		input('memberPhone', '010-owned-user');
		input('memberAddress', 'Owned test address');
		holdSave = true;
		const beforeSave = writes().length;
		flushSync(() => {
			select('.user-profile-save-button').click();
			select('.user-profile-save-button').click();
		});
		await until(() => releaseSave);
		assert.equal(writes().length, beforeSave + 1);
		assert.ok(select('.user-profile-save-button').disabled);
		assert.ok(!document.body.textContent.includes(texts['User profile'].Saved));
		holdSave = false;
		releaseSave();
		releaseSave = undefined;
		await until(() => document.body.textContent.includes(texts['User profile'].Saved));
		const saved = await members.findById(user._id);
		assert.equal(saved.memberNick, 'user-updated');
		assert.equal(saved.memberFullName, 'Updated Real User');
		assert.equal(saved.memberPhone, '010-owned-user');
		assert.equal(saved.memberAddress, 'Owned test address');
		assert.equal(store.userVar().memberFullName, saved.memberFullName);
		assert.equal(window.localStorage.getItem('accessToken'), lastReceipt.accessToken);
		assert.ok(window.localStorage.getItem('login'));
		assert.deepEqual(
			Object.keys(writes().at(-1).variables.input).sort(),
			['memberImage', 'memberNick', 'memberFullName', 'memberPhone', 'memberAddress'].sort(),
		);
		pass('five-field real update, duplicate lock, authoritative token receipt and reactive account/header refresh');
		input('memberFullName', '');
		input('memberAddress', '');
		click('.user-profile-save-button');
		await until(() => store.userVar().memberFullName === '');
		assert.equal((await members.findById(user._id)).memberFullName, null);
		assert.equal(select('#user-profile-name').value, '');
		assert.equal(select('#user-profile-address').value, '');
		assert.equal(select('#user-profile-name').placeholder, '');
		assert.ok(select('.user-profile-image img').src.endsWith('/img/profile/defaultUser.svg'));
		pass('optional data stays empty and neutral image fallback never invents profile content');
		input('memberFullName', 'Retained unsaved draft');
		failSave = true;
		click('.user-profile-save-button');
		await until(() => document.querySelector('.user-profile-feedback[role="alert"]'));
		assert.equal(select('.user-profile-feedback').textContent, texts['User profile']['Save error']);
		assert.equal(select('#user-profile-name').value, 'Retained unsaved draft');
		assert.ok(!document.body.textContent.includes('Private connection'));
		assert.ok(!document.body.textContent.includes(texts['User profile'].Saved));
		failSave = false;
		pass('failed save preserves draft, sanitizes errors and cannot claim success');
		upload('bad.svg', 'image/svg+xml');
		await until(() => document.body.textContent.includes(texts['User profile']['Upload error']));
		assert.equal(uploads.length, 0);
		upload('owned.png');
		await until(() => uploads.length === 1 && !select('.user-profile-save-button').disabled);
		assert.equal(uploads[0].errors, undefined, JSON.stringify(uploads[0].errors));
		const uploaded = uploads[0].data.imageUploader;
		assert.ok(uploaded.startsWith('uploads/member/'));
		assert.equal(fs.readFileSync(path.join(temporary, uploaded), 'utf8'), 'owned-profile-image');
		assert.ok(select('.user-profile-image img').src.includes(uploaded));
		assert.notEqual(store.userVar().memberImage, uploaded);
		assert.notEqual((await members.findById(user._id)).memberImage, uploaded);
		click('.user-profile-save-button');
		await until(() => store.userVar().memberImage === uploaded);
		assert.equal((await members.findById(user._id)).memberImage, uploaded);
		flushSync(() => select('.user-profile-image img').dispatchEvent(new window.Event('error')));
		assert.ok(select('.user-profile-image img').src.endsWith('/img/profile/defaultUser.svg'));
		pass('real authenticated multipart upload is draft-only until Save; image persistence and fallback');
		const beforeLogout = logoutCalls;
		const beforeLogoutToken = auth.getJwtToken();
		click('.user-profile-logout');
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(logoutCalls, beforeLogout);
		assert.equal(auth.getJwtToken(), beforeLogoutToken);
		assert.deepEqual(destinations, []);
		const clearStore = client.clearStore.bind(client);
		let releaseLogout;
		client.clearStore = () =>
			new Promise((resolve) => {
				releaseLogout = resolve;
			}).then(clearStore);
		confirmedLogout = true;
		click('.user-profile-logout');
		await until(() => releaseLogout && !document.querySelector('#user-profile-page'));
		assert.equal(logoutCalls, beforeLogout + 1);
		assert.equal(window.localStorage.getItem('accessToken'), null);
		assert.equal(store.userVar()._id, '');
		assert.equal(router.pathname, '/mypage');
		assert.deepEqual(destinations, []);
		releaseLogout();
		await until(() => router.pathname === '/' && document.querySelector('.programs-auth-link'));
		client.clearStore = clearStore;
		assert.equal(window.location.pathname, '/');
		assert.deepEqual(destinations, ['/']);
		assert.equal(Object.keys(client.cache.extract()).length, 0);
		assert.ok(select('.programs-auth-link').href.includes('/account/join'));
		assert.ok(select('.programs-auth-link').getAttribute('aria-label').includes('Login'));
		assert.ok(select('.programs-auth-link').getAttribute('aria-label').includes('Register'));
		assert.ok(!document.querySelector('#user-profile-page, .user-profile-access'));
		pass(
			'confirmed USER logout waits for real cache cleanup, navigates the page to Home and renders the guest Login/Register navbar',
		);
		await signIn(await members.findById(user._id));
		router.pathname = '/mypage';
		router.asPath = '/mypage';
		router.query = { category: 'myProfile' };
		render();
		await until(() => document.querySelector('#user-profile-page'));
		client.clearStore = async () => {
			throw new Error('owned cleanup failure');
		};
		click('.user-profile-logout');
		await until(() => !document.querySelector('#user-profile-page'));
		await new Promise((resolve) => setTimeout(resolve, 30));
		assert.equal(auth.getJwtToken(), '');
		assert.equal(store.userVar()._id, '');
		assert.equal(router.pathname, '/mypage');
		assert.deepEqual(destinations, ['/']);
		client.clearStore = clearStore;
		await clearStore();
		pass('failed cleanup cannot navigate to Home or retain an authenticated USER');
		for (const width of [1440, 390]) {
			mobile = width === 390;
			Object.defineProperty(navigator, 'userAgent', {
				configurable: true,
				value: mobile ? 'iPhone Mobile' : 'Desktop',
			});
			Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
			for (const pathname of ['/mypage', '/', '/program']) {
				await signIn(await members.findById(user._id));
				router.pathname = pathname;
				router.asPath = pathname;
				router.query = {};
				dom.reconfigure({ url: 'http://localhost' + pathname });
				routeKey++;
				flushSync(render);
				await until(() => document.querySelector('#programs-account-button'));
				if (pathname === '/mypage') assert.ok(document.querySelector('#user-profile-page'));
				select('#programs-account-button').getBoundingClientRect = () => ({
					x: 300,
					y: 16,
					top: 16,
					left: 300,
					right: 344,
					bottom: 60,
					width: 44,
					height: 44,
				});
				click('#programs-account-button');
				await until(() => document.querySelector('#programs-account-menu [role="menuitem"]'));
				const logoutItem = [...document.querySelectorAll('#programs-account-menu [role="menuitem"]')].find(
					(item) => item.textContent === texts['Program navigation'].Logout,
				);
				assert.ok(logoutItem);
				const beforeHeaderLogout = logoutCalls;
				const beforeDestinations = destinations.length;
				let releaseHeaderCleanup;
				client.clearStore = () =>
					new Promise((resolve) => {
						releaseHeaderCleanup = resolve;
					}).then(clearStore);
				flushSync(() => logoutItem.click());
				await until(() => releaseHeaderCleanup);
				assert.equal(logoutCalls, beforeHeaderLogout + 1);
				assert.equal(auth.getJwtToken(), '');
				assert.equal(store.userVar()._id, '');
				assert.equal(destinations.length, beforeDestinations);
				assert.equal(router.pathname, pathname);
				releaseHeaderCleanup();
				await until(
					() => destinations.length === beforeDestinations + 1 && document.querySelector('.programs-auth-link'),
				);
				client.clearStore = clearStore;
				assert.equal(destinations.at(-1), '/');
				assert.equal(window.location.pathname, '/');
				assert.equal(router.pathname, '/');
				assert.equal(Object.keys(client.cache.extract()).length, 0);
				assert.ok(select('.programs-auth-link').getAttribute('aria-label').includes('Login'));
				assert.ok(select('.programs-auth-link').getAttribute('aria-label').includes('Register'));
				assert.ok(!document.querySelector('#user-profile-page, .user-profile-access'));
				pass(
					`actual public header USER logout from ${pathname} at ${width}px waits for cleanup and reaches guest Home`,
				);
			}
		}
		await signIn(await members.findById(user._id));
		router.pathname = '/mypage';
		router.asPath = '/mypage';
		router.query = { category: 'myBookings', period: 'HISTORY' };
		render();
		await until(() => document.querySelector('[data-test="my-bookings"]'));
		assert.ok(document.querySelector('.my-bookings-layout'));
		assert.ok(!document.querySelector('.user-profile-layout'));
		for (const [width, ua] of [[1440, 'Desktop'], [390, 'Desktop'], [390, 'iPhone Mobile']]) {
			Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
			mobile = width === 390;
			router.query = { category: 'myFavorites' };
			routeKey++;
			render();
			await until(() => document.querySelector('[data-test="my-favorites"]'));
			assert.ok(document.querySelector('.user-favorites-layout'));
			assert.ok(!document.querySelector('#my-page .left-config, .user-profile-layout, #user-profile-page'));
			assert.ok(document.querySelector('.programs-header'));
			assert.ok(document.querySelector('.programs-bottom-navigation'));
			assert.ok(document.querySelector('[data-test="existing-footer"]'));
			pass(`Favorites uses the dedicated consumer layout without legacy sidebar at ${width}px / ${ua}`);
		}
		router.query = { category: 'myProfile' };
		render();
		await until(() => document.querySelector('#user-profile-page'));
		holdSave = true;
		input('memberFullName', 'Late User Save');
		click('.user-profile-save-button');
		await until(() => releaseSave);
		await signIn(trainer);
		render();
		await until(() => document.querySelector('#trainer-profile-page'));
		assert.ok(document.querySelector('.trainer-profile-layout'));
		const trainerToken = window.localStorage.getItem('accessToken');
		holdSave = false;
		releaseSave();
		releaseSave = undefined;
		await new Promise((resolve) => setTimeout(resolve, 80));
		assert.equal(store.userVar()._id, String(trainer._id));
		assert.equal(window.localStorage.getItem('accessToken'), trainerToken);
		pass('late USER save cannot replace current TRAINER identity/token or workspace presentation');
		await signIn(await members.findById(user._id));
		render();
		await until(() => document.querySelector('#user-profile-image'));
		holdUpload = true;
		upload('late.png');
		await until(() => releaseUpload);
		await signIn(trainer);
		render();
		await until(() => !document.querySelector('#user-profile-page'));
		holdUpload = false;
		releaseUpload();
		releaseUpload = undefined;
		await new Promise((resolve) => setTimeout(resolve, 80));
		assert.equal(store.userVar()._id, String(trainer._id));
		assert.notEqual(store.userVar().memberImage, uploads.at(-1).data.imageUploader);
		await signIn(user);
		store.userVar({ ...store.userVar(), memberStatus: 'BLOCK' });
		render();
		await until(() => document.querySelector('.user-profile-access'));
		assert.ok(!document.querySelector('#user-profile-page'));
		pass('late USER upload and blocked account cannot retain private profile state');
	} finally {
		console.log = previousLog;
		root?.unmount();
		client?.stop();
		dom?.window.close();
		if (fixture) await fixture.stop();
		global.FormData = NativeFormData;
		if (previousGraphql === undefined) delete process.env.REACT_APP_API_GRAPHQL_URL;
		else process.env.REACT_APP_API_GRAPHQL_URL = previousGraphql;
		process.chdir(previousCwd);
		// This exact directory was created by this test under the OS temp directory.
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
(async () => {
	await locales();
	await integration();
	output(checks + ' USER Profile checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
