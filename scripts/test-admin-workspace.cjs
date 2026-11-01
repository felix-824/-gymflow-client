// Real React/Apollo form and navigation checks. All writes use an in-memory transport.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
function load(file, mocks = {}, cache = new Map()) {
	file = path.resolve(base, file);
	if (cache.has(file)) return cache.get(file);
	if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
		module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
	} }).outputText;
	const module = { exports: {} }; cache.set(file, module.exports);
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })((name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.endsWith('.css')) return {};
		if (!name.startsWith('.')) return require(name);
		const target = path.resolve(path.dirname(file), name);
		return load(name.endsWith('.json') ? target : fs.existsSync(target + '.ts') ? target + '.ts' : fs.existsSync(target + '.tsx') ? target + '.tsx' : path.join(target, 'index.ts'), mocks, cache);
	}, module, module.exports);
	return module.exports;
}
let checks = 0;
const pass = (name) => { checks++; console.log('PASS ' + name); };
async function main() {
	const { adminMyPageRedirect, adminWorkspaceAccess } = load('libs/admin-workspace.ts');
	const admin = { _id: 'fixture-admin', memberType: 'ADMIN', memberStatus: 'ACTIVE', memberNick: 'Admin', memberPhone: '01012345678', memberAddress: 'Seoul', memberImage: '' };
	for (const category of [undefined, 'myProfile']) assert.equal(adminMyPageRedirect(category, admin), true);
	for (const category of ['myArticles', 'writeArticle', 'editArticle']) assert.equal(adminMyPageRedirect(category, admin), false);
	for (const account of [{}, { ...admin, memberType: 'USER' }, { ...admin, memberType: 'TRAINER' }, { ...admin, memberStatus: 'BLOCK' }]) {
		assert.equal(adminMyPageRedirect('myProfile', account), false);
		assert.equal(adminWorkspaceAccess(true, '', account), 'forbidden');
	}
	assert.equal(adminWorkspaceAccess(false, '', admin), 'loading');
	assert.equal(adminWorkspaceAccess(true, 'offline', admin), 'session');
	pass('restoration, role/status, Admin My Page defaults and intentional shared article routes');
	const { adminWorkspaceLabels } = load('libs/admin-workspace-labels.ts');
	for (const locale of ['en', 'kr', 'ru']) {
		const labels = adminWorkspaceLabels(locale);
		assert.deepEqual(Object.keys(labels).sort(), Object.keys(adminWorkspaceLabels('en')).sort());
		for (const value of Object.values(labels)) assert(value && !/\ufffd|\?{2,}/.test(value));
	}
	pass('EN/KR/RU workspace keys are complete and nonempty');
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/profile' });
	const globals = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'localStorage'];
	const previous = Object.fromEntries(globals.map((name) => [name, Object.getOwnPropertyDescriptor(global, name)]));
	for (const name of globals) Object.defineProperty(global, name, { value: dom.window[name], configurable: true });
	let root, client;
	try {
		const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
		const apollo = require('@apollo/client'), mui = require('@mui/material');
		const store = { userVar: apollo.makeVar(admin), authReadyVar: apollo.makeVar(true), authErrorVar: apollo.makeVar('') };
		let mobile = false, session = 'owned-session', uploads = 0, logoutOptions, receiptRole = 'ADMIN', hold;
		const saves = [], destinations = [];
		const router = { isReady: true, pathname: '/_admin/profile', asPath: '/_admin/profile', query: {}, locale: 'en', events: new (require('node:events').EventEmitter)(), replace: async (href) => destinations.push(href), push: async () => true };
		const noop = { __esModule: true, default: () => null };
		const resources = JSON.parse(fs.readFileSync(path.join(base, 'public/locales/en/common.json'), 'utf8'));
		const t = (key) => key.split('.').reduce((value, part) => value?.[part], resources) || key;
		const auth = { getAuthSessionId: () => session, ensureAccessToken: async () => 'fixture-access', isAuthenticationError: () => false, invalidateSession: async () => {}, updateUserInfo: async (_, member) => store.userVar(member), logOut: async (options) => { logoutOptions = options; return true; } };
		const mocks = {
			'next/router': { useRouter: () => router }, 'next/head': noop,
			'next/link': { __esModule: true, default: React.forwardRef(({ href, children, legacyBehavior, passHref, ...props }, ref) => legacyBehavior ? React.cloneElement(children, { href, ref, ...props }) : React.createElement('a', { ...props, ref, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) }, children)) },
			'next-i18next': { useTranslation: () => ({ t, i18n: { language: router.locale } }) },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
			'@mui/material': { ...mui, useMediaQuery: () => !mobile },
			'../../../apollo/store': store, '../../apollo/store': store,
			'../../auth': auth, '../../libs/auth': auth,
			'../../hooks/useDeviceDetect': { __esModule: true, default: () => mobile ? 'mobile' : 'desktop' },
			'../../sweetAlert': { sweetConfirmAlert: async () => true, sweetErrorHandling: async () => {} },
			'../../libs/sweetAlert': {},
			axios: { __esModule: true, default: { post: async (_, form, options) => {
				assert.equal(JSON.parse(form.get('operations')).variables.target, 'member');
				assert.equal(options.headers.Authorization, 'Bearer fixture-access'); uploads++;
				return { data: { data: { imageUploader: 'uploads/member/owned.png' } } };
			} } },
		};
		client = new apollo.ApolloClient({ cache: new apollo.InMemoryCache(), link: new apollo.ApolloLink((operation) => new apollo.Observable((observer) => {
			assert.equal(operation.operationName, 'UpdateMember'); saves.push(operation.variables.input);
			const complete = () => { observer.next({ data: { updateMember: { ...store.userVar(), ...operation.variables.input, memberType: receiptRole } } }); observer.complete(); };
			if (hold) hold.complete = complete; else setTimeout(complete, 0);
		})) });
		root = createRoot(document.getElementById('root'));
		const render = (Component, props = {}) => flushSync(() => root.render(React.createElement(mui.ThemeProvider, { theme: mui.createTheme() }, React.createElement(apollo.ApolloProvider, { client }, React.createElement(Component, props)))));
		const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
		const wait = async (condition) => { for (let n = 0; n < 80; n++) { if (condition()) return; await tick(); } assert.fail('DOM state timed out'); };
		const input = (name, value) => { const node = document.querySelector('[name="' + name + '"]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value); flushSync(() => node.dispatchEvent(new window.Event('input', { bubbles: true }))); };
		const submit = () => flushSync(() => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
		const Profile = load('libs/components/mypage/MyProfile.tsx', mocks).default;
		for (mobile of [false, true]) {
			render(Profile, { adminProfile: true });
			assert.equal(document.querySelector('h1').textContent, 'Your account');
			assert(!document.querySelector('[name="memberFullName"], .trainer-application-entry, .user-account-navigation'));
			assert.equal(document.querySelectorAll('.user-profile-field input').length, 3);
		}
		pass('Admin profile uses the shared form on desktop/mobile with nickname, phone, address and image');
		input('memberNick', 'Admin edited'); submit();
		await wait(() => document.querySelector('[role="status"]'));
		assert.equal(store.userVar().memberNick, 'Admin edited');
		assert.deepEqual(Object.keys(saves[0]).sort(), ['memberAddress', 'memberImage', 'memberNick', 'memberPhone']);
		const upload = document.querySelector('input[type="file"]');
		Object.defineProperty(upload, 'files', { value: [new window.File(['owned image'], 'owned.png', { type: 'image/png' })] });
		flushSync(() => upload.dispatchEvent(new window.Event('change', { bubbles: true })));
		await wait(() => uploads === 1 && !document.querySelector('.user-profile-save-button').disabled);
		submit(); await wait(() => store.userVar().memberImage === 'uploads/member/owned.png');
		pass('Admin self-update is allowlisted and member upload uses authenticated existing transport');
		receiptRole = 'USER'; input('memberNick', 'Wrong receipt'); submit();
		await wait(() => document.querySelector('[role="alert"]'));
		assert.equal(store.userVar().memberType, 'ADMIN');
		pass('wrong-role profile receipt cannot replace the authenticated Admin');
		receiptRole = 'ADMIN'; hold = {}; input('memberNick', 'Late receipt'); submit();
		await wait(() => hold.complete); session = 'replacement-session'; store.userVar({ ...admin, memberType: 'TRAINER' });
		hold.complete(); await tick(); assert.equal(store.userVar().memberType, 'TRAINER');
		pass('late profile receipt cannot replace a different role/session');
		for (const account of [{}, { ...admin, memberType: 'USER' }, { ...admin, memberType: 'TRAINER' }, { ...admin, memberStatus: 'BLOCK' }]) {
			flushSync(() => store.userVar(account)); render(Profile, { adminProfile: true }); assert(!document.querySelector('form'));
		}
		pass('guest, USER, TRAINER and inactive ADMIN cannot mount the Admin profile form');
		hold = undefined; store.userVar(admin); render(Profile, { adminProfile: true });
		flushSync(() => document.querySelector('.user-profile-logout').click()); await wait(() => logoutOptions);
		assert.deepEqual(logoutOptions, { redirectToPublic: true });
		pass('Admin profile account control invokes centralized public-site logout');
		const { ProgramsHeader, ProgramsBottomNavigation } = load('libs/components/program/ProgramsNavigation.tsx', mocks);
		const Footer = load('libs/components/Footer.tsx', mocks).default;
		for (const account of [admin, { ...admin, memberType: 'USER' }, { ...admin, memberType: 'TRAINER' }, { ...admin, memberStatus: 'BLOCK' }, {}]) {
			store.userVar(account);
			for (const component of [ProgramsHeader, ProgramsBottomNavigation, Footer]) {
				render(component); assert.equal(Boolean(document.querySelector('a[href="/_admin"]')), account === admin);
			}
		}
		pass('shared public header, bottom navigation and footer expose workspace only for ACTIVE ADMIN');
		const pageMocks = { ...mocks, '../../libs/components/layout/LayoutBasic': { __esModule: true, default: (Component) => Component } };
		for (const name of ['MyPrograms', 'MyFavorites', 'RecentlyVisited', 'AddNewProgram', 'MyProfile', 'TrainerApplication', 'MyArticles', 'WriteArticle', 'EditArticle', 'TrainerSchedule', 'MyBookings', 'TrainerReservations', 'TrainerDashboard', 'MyMenu'])
			pageMocks['../../libs/components/mypage/' + name] = { __esModule: true, default: () => React.createElement('p', { 'data-page': name }, name) };
		pageMocks['../../libs/components/mypage/TrainerWorkspaceNavigation'] = { TrainerWorkspaceHeader: () => null, TrainerWorkspaceNavigation: () => null };
		for (const name of ['MemberFollowers', 'MemberFollowings']) pageMocks['../../libs/components/member/' + name] = noop;
		const MyPage = load('pages/mypage/index.tsx', pageMocks).default;
		router.pathname = '/mypage'; router.query = {}; store.userVar(admin); store.authReadyVar(false);
		render(MyPage); await tick(); assert(!destinations.length); assert(!document.querySelector('[data-page]'));
		flushSync(() => store.authReadyVar(true)); await wait(() => destinations.length);
		assert.equal(destinations.at(-1), '/_admin'); assert(!document.querySelector('[data-page="MyProfile"]'));
		for (const [category, marker] of [['myArticles', 'MyArticles'], ['writeArticle', 'WriteArticle'], ['editArticle', 'EditArticle']]) {
			router.query = { category }; render(MyPage); assert(document.querySelector('[data-page="' + marker + '"]'));
		}
		pass('actual My Page waits for restoration, replaces Admin default and preserves shared article components without legacy flash');
	} finally {
		root?.unmount(); client?.stop(); dom.window.close();
		for (const [name, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(global, name, descriptor); else delete global[name]; }
	}
	console.log(checks + ' Admin Workspace checks passed. No database writes.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
