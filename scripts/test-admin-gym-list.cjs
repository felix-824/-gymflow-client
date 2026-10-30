// Real React/MUI/Apollo DOM checks with an in-memory read-only transport. No Gym mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rootPath = path.resolve(__dirname, '..');
function load(file, mocks, cache = new Map()) {
	file = path.resolve(rootPath, file);
	if (cache.has(file)) return cache.get(file);
	if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
		module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.React, esModuleInterop: true,
	} }).outputText;
	const module = { exports: {} }; cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (!name.startsWith('.')) return require(name);
		const target = path.resolve(path.dirname(file), name);
		return load(name.endsWith('.json') ? target : fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}

module.exports = async function gymListTests() {
	let checks = 0;
	const pass = (name) => { checks++; console.log('PASS G3C ' + name); };
	const { JSDOM } = require('jsdom');
	const keys = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'Image'];
	const previous = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/gyms' });
	let root, client;
	try {
		for (const key of keys) Object.defineProperty(global, key, { value: dom.window[key], configurable: true, writable: true });
		const imageProbes = [];
		global.Image = class { constructor() { imageProbes.push(this); } };
		const React = require('react');
		const { createRoot } = require('react-dom/client');
		const { flushSync } = require('react-dom');
		const apollo = require('@apollo/client');
		const mui = require('@mui/material');
		const store = { userVar: apollo.makeVar({}), authReadyVar: apollo.makeVar(false), authErrorVar: apollo.makeVar('') };
		const admin = { _id: 'admin', memberType: 'ADMIN', memberStatus: 'ACTIVE', memberNick: 'Administrator' };
		const events = new (require('node:events').EventEmitter)();
		let desktop = true, session = 'session1', fault = false, empty = false, hold = false;
		const router = { isReady: true, locale: 'en', pathname: '/_admin/gyms', events, push: async () => true };
		const i18n = require('i18next').createInstance();
		const resources = Object.fromEntries(['en', 'kr', 'ru'].map((lng) => [lng, Object.fromEntries(['common', 'admin-gyms'].map((ns) => [ns, JSON.parse(fs.readFileSync(path.join(rootPath, 'public/locales', lng, ns + '.json'), 'utf8'))]))]));
		await i18n.init({ resources, lng: 'en', initImmediate: false, fallbackLng: false });
		const messages = resources.en['admin-gyms'];
		const mocks = {
			'../../../../apollo/store': store, '../../../apollo/store': store,
			'../../../auth': { getAuthSessionId: () => session }, '../../auth': { logOut: () => {} },
			'../../../config': { REACT_APP_API_URL: 'http://localhost:3007' }, '../../config': { REACT_APP_API_URL: 'http://localhost:3007' },
			'next/router': { useRouter: () => router, withRouter: (Component) => (props) => React.createElement(Component, { ...props, router }) },
			'next/link': { __esModule: true, default: ({ href, children, legacyBehavior }) => legacyBehavior ? React.cloneElement(children, { href }) : React.createElement('a', { href }, children) },
			'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(router.locale, ns), i18n }) },
			'@mui/material': { ...mui, useMediaQuery: () => desktop },
		};
		const requests = [];
		const fixtures = Array.from({ length: 25 }, (_, index) => ({
			_id: String(index), gymName: 'Gym ' + index, gymLocation: 'SEOUL', gymAddress: '123 Seoul Test Street',
			gymImages: ['uploads/gym/123e4567-e89b-42d3-a456-426614174000.jpg', 'uploads/gym/123e4567-e89b-42d3-a456-426614174001.png'],
			gymStatus: 'ACTIVE', gymRevision: 0, gymDesc: null, gymPhone: null, amenities: [], openingHours: null,
			createdAt: '2026-10-30T10:00:00.000Z', updatedAt: '2026-10-31T10:00:00.000Z', deletedAt: null,
		}));
		fixtures[1].gymImages = ['https://untrusted.example/photo.jpg'];
		client = new apollo.ApolloClient({ cache: new apollo.InMemoryCache(), link: new apollo.ApolloLink((operation) => new apollo.Observable((observer) => {
			assert.equal(operation.operationName, 'GetAllGymsByAdmin', 'Only read-only Gym list queries are allowed');
			const input = JSON.parse(JSON.stringify(operation.variables.input)); requests.push(input);
			if (hold) return () => {};
			const timer = setTimeout(() => {
				if (fault) return observer.error(new Error('private stack must not appear'));
				const list = empty || input.search.text === 'missing' ? [] : fixtures;
				observer.next({ data: { getAllGymsByAdmin: { list: list.slice((input.page - 1) * input.limit, input.page * input.limit), metaCounter: list.length ? [{ total: list.length }] : [] } } }); observer.complete();
			}, 10);
			return () => clearTimeout(timer);
		})) });
		root = createRoot(document.getElementById('root'));
		const theme = mui.createTheme();
		const render = (Component, props = {}) => flushSync(() => root.render(React.createElement(mui.ThemeProvider, { theme }, React.createElement(apollo.ApolloProvider, { client }, React.createElement(Component, props)))));
		const tick = () => new Promise((resolve) => setTimeout(resolve, 35));
		const wait = async (condition) => { for (let n = 0; n < 100; n++) { if (condition()) return; await tick(); } assert.fail('Timed out waiting for DOM/query state'); };
		const click = (node) => { assert(node, 'Clickable element exists'); flushSync(() => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); };
		const button = (label) => Array.from(document.querySelectorAll('button')).find((node) => node.textContent === label || node.getAttribute('aria-label') === label);
		const last = () => requests[requests.length - 1];
		const queryChange = async (action) => { const before = requests.length; await action(); await tick(); await wait(() => requests.length > before && !document.querySelector('table[aria-busy="true"]')); };
		const changeText = (value) => { const node = document.querySelector('input[maxlength="100"]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value); flushSync(() => node.dispatchEvent(new window.Event('input', { bubbles: true }))); };
		const select = async (node, label) => {
			assert(node);
			// JSDOM has no layout; provide a synthetic anchor only for MUI Popover positioning.
			node.parentElement.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 44, width: 200, height: 44 });
			flushSync(() => node.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 })));
			await wait(() => document.querySelector('[role="listbox"]'));
			click(Array.from(document.querySelectorAll('[role="option"]')).find((option) => option.textContent === label));
		};
		const Gyms = load('libs/components/admin/gyms/Gyms.tsx', mocks).default;
		render(Gyms); await tick(); assert.equal(document.querySelector('[role="status"]').textContent, messages.auth.loading); assert.equal(requests.length, 0); pass('auth loading never mounts query');
		for (const actor of [{}, { ...admin, memberType: 'USER' }, { ...admin, memberType: 'TRAINER' }, { ...admin, memberStatus: 'BLOCK' }, { ...admin, memberStatus: 'DELETE' }]) {
			flushSync(() => { store.authReadyVar(true); store.userVar(actor); }); await tick(); assert.equal(document.querySelector('[role="alert"]').textContent, messages.auth.forbidden); assert.equal(requests.length, 0);
		} pass('guest, USER, TRAINER, blocked/deleted ADMIN denied');
		flushSync(() => { store.userVar(admin); store.authErrorVar('private error'); }); await tick(); assert.equal(document.querySelector('[role="alert"]').textContent, messages.auth.session); pass('session failure localized');
		router.isReady = false; flushSync(() => store.authErrorVar('')); render(Gyms); await tick(); assert(document.querySelector('[role="status"]')); assert.equal(requests.length, 0); router.isReady = true;
		render(Gyms); await wait(() => document.querySelector('tbody time'));
		assert.deepEqual(last(), { page: 1, limit: 10, sort: 'createdAt', direction: 'DESC', search: {} }); pass('ACTIVE ADMIN allowed; router readiness; exact initial inquiry');
		assert.equal(document.querySelectorAll('thead th').length, 5); assert.equal(document.querySelectorAll('tbody tr').length, 10);
		assert(document.querySelector('tbody').textContent.includes('123 Seoul Test Street')); assert.equal(document.querySelector('time').dateTime, fixtures[0].updatedAt);
		assert(document.querySelector('tbody').textContent.includes(messages.lifecycle.active)); assert(document.querySelector('tbody').textContent.includes(resources.en.common.SEOUL));
		assert(document.body.textContent.includes('25')); assert(!document.querySelector('a[href*="gyms/detail"]')); pass('five read-only columns, address/status/location/date and backend total');
		await wait(() => document.querySelector('tbody img')); assert.equal(document.querySelector('tbody img').src, 'http://localhost:3007/' + fixtures[0].gymImages[0]); assert.equal(document.querySelector('tbody img').alt, 'Cover photo of Gym 0');
		assert(!document.querySelector('img[src*="untrusted"]')); flushSync(() => imageProbes.find((probe) => probe.src === 'http://localhost:3007/' + fixtures[0].gymImages[0]).onerror()); await tick(); assert(document.querySelector('tbody svg[aria-label="Cover photo of Gym 0"]')); pass('canonical first cover, external URL rejected, image-error fallback');
		await queryChange(() => click(button(messages.list.nextPage))); assert.equal(last().page, 2); pass('MUI next page maps to backend page 2');
		await queryChange(() => click(button(messages.lifecycle.paused))); assert.deepEqual(last().search, { gymStatus: 'PAUSED' }); assert.equal(last().page, 1);
		await queryChange(() => click(button(messages.lifecycle.deleted))); assert.equal(last().search.gymStatus, 'DELETE');
		await queryChange(() => click(button(messages.lifecycle.active))); assert.equal(last().search.gymStatus, 'ACTIVE'); pass('exact status mapping and page reset');
		const beforeTyping = requests.length; changeText('  Gym  '); await tick(); assert.equal(requests.length, beforeTyping);
		await queryChange(() => flushSync(() => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))); assert.deepEqual(last().search, { gymStatus: 'ACTIVE', text: 'Gym' }); pass('local typing; form Enter submission trims text and preserves status');
		await queryChange(() => select(document.querySelector('.gym-location .MuiSelect-select'), resources.en.common.BUSAN)); assert.deepEqual(last().search, { gymStatus: 'ACTIVE', text: 'Gym', locationList: ['BUSAN'] }); pass('GymLocation selection preserves search/status');
		await queryChange(() => click(button(messages.list.all))); assert.deepEqual(last().search, { text: 'Gym', locationList: ['BUSAN'] }); pass('All removes status without invented value');
		changeText('   '); await queryChange(() => click(button(messages.list.search))); assert.deepEqual(last().search, { locationList: ['BUSAN'] }); pass('blank search removes text and preserves location');
		await queryChange(() => select(document.querySelector('.gym-location .MuiSelect-select'), messages.list.allLocations)); assert.deepEqual(last().search, {}); pass('All Locations removes locationList');
		await queryChange(() => click(button(messages.list.nextPage)));
		await queryChange(() => select(document.querySelector('.MuiTablePagination-root .MuiSelect-select'), '20')); assert.equal(last().page, 1); assert.equal(last().limit, 20); pass('rows-per-page resets backend page to 1');
		changeText('missing'); await queryChange(() => click(button(messages.list.search))); assert(document.body.textContent.includes(messages.list.filteredEmpty)); assert.equal(last().page, 1); pass('filtered empty and empty metaCounter safe');
		empty = true; await queryChange(() => click(button(messages.list.clearFilters))); assert(document.body.textContent.includes(messages.list.empty)); pass('catalog empty differs from filtered empty');
		fault = true; changeText('error'); await queryChange(() => click(button(messages.list.search))); assert.equal(document.querySelector('[role="alert"] p').textContent, messages.list.error); assert(!document.body.textContent.includes('private stack')); const failedCount = requests.length; await tick(); assert.equal(requests.length, failedCount); pass('localized query failure without retry loop');
		fault = false; empty = false; await queryChange(() => click(button(messages.list.retry))); assert.equal(last().search.text, 'error'); assert(document.querySelector('tbody time')); pass('Retry refetches current inquiry');
		await queryChange(() => click(button(messages.list.nextPage))); assert.equal(last().page, 2);
		await queryChange(() => select(document.querySelector('.gym-location .MuiSelect-select'), resources.en.common.BUSAN)); assert.equal(last().page, 1); assert.equal(last().search.text, 'error');
		await queryChange(() => click(button(messages.list.nextPage))); changeText('page-reset');
		await queryChange(() => click(button(messages.list.search))); assert.equal(last().page, 1); assert.deepEqual(last().search.locationList, ['BUSAN']);
		await queryChange(() => click(button(messages.list.nextPage)));
		await queryChange(() => select(document.querySelector('.MuiTablePagination-root .MuiSelect-select'), '40')); assert.equal(last().page, 1); assert.equal(last().limit, 40); assert.deepEqual(last().search, { text: 'page-reset', locationList: ['BUSAN'] }); pass('location/search/rows changes reset page 2 while preserving unrelated filters');
		hold = true; changeText('hold'); const beforeHold = requests.length; click(button(messages.list.search)); await wait(() => requests.length > beforeHold); assert.equal(document.querySelector('[role="status"]').textContent, messages.list.loading); pass('localized loading replaces old rows');
		hold = false; session = 'session2'; render(Gyms); await wait(() => document.querySelector('tbody time')); assert.deepEqual(last().search, {}); pass('session change remounts private filters and query');
		for (const locale of ['kr', 'ru']) { router.locale = locale; render(Gyms); await tick(); assert.equal(document.querySelector('h1').textContent, resources[locale]['admin-gyms'].list.title); assert(document.querySelector('tbody').textContent.includes(resources[locale]['admin-gyms'].lifecycle.active)); assert(document.querySelector('tbody').textContent.includes(resources[locale].common.SEOUL)); } router.locale = 'en'; pass('KR/RU list, location and lifecycle translations render');
		const Menu = load('libs/components/admin/AdminMenuList.tsx', mocks).default;
		for (const pathname of ['/_admin/gyms', '/_admin/gyms/detail', '/_admin/programs']) {
			router.pathname = pathname; render(Menu); await tick(); const link = document.querySelector('a[href="/_admin/gyms"]'); assert(link); assert.equal(link.getAttribute('aria-current'), pathname.startsWith('/_admin/gyms') ? 'page' : null);
			const text = document.body.textContent; assert(text.indexOf('Programs') < text.indexOf(messages.navigation.title)); assert(text.indexOf(messages.navigation.title) < text.indexOf('Community'));
		} pass('direct Gyms link, order, list/detail active and inactive aria-current');
		const withAdminLayout = load('libs/components/layout/LayoutAdmin.tsx', mocks).default;
		const ProtectedPage = withAdminLayout(Gyms);
		router.pathname = '/_admin/gyms'; flushSync(() => store.userVar({})); const deniedRequests = requests.length; render(ProtectedPage); await tick(); assert.equal(document.querySelector('[role="alert"]').textContent, messages.auth.forbidden); assert.equal(requests.length, deniedRequests);
		flushSync(() => { store.userVar(admin); store.authErrorVar('private session detail'); }); render(ProtectedPage); await tick(); assert.equal(document.querySelector('[role="alert"]').textContent, messages.auth.session); assert.equal(requests.length, deniedRequests);
		flushSync(() => store.authErrorVar('')); pass('actual page shell delegates denied/session states to localized Gym wrapper');
		const Page = withAdminLayout(() => React.createElement('p', { id: 'existing-page' }, 'Existing admin content'));
		render(Page); await tick(); assert(document.querySelector('.MuiDrawer-docked')); assert(!button(messages.navigation.openMenu)); assert(document.querySelector('#existing-page')); pass('desktop permanent Drawer and existing content retained');
		desktop = false; render(Page); await tick(); const menuButton = button(messages.navigation.openMenu); assert(menuButton); assert.equal(menuButton.tagName, 'BUTTON'); assert.equal(menuButton.getAttribute('aria-expanded'), 'false');
		menuButton.focus(); click(menuButton); await wait(() => menuButton.getAttribute('aria-expanded') === 'true'); assert(document.querySelector('.MuiDrawer-modal')); assert(document.querySelector('#admin-navigation[role="navigation"]')); assert(document.querySelector('a[href="/_admin/gyms"]')); await wait(() => document.querySelector('#admin-navigation').contains(document.activeElement)); pass('narrow accessible menu button, same MenuList and normal MUI focus in temporary Drawer');
		flushSync(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))); await wait(() => menuButton.getAttribute('aria-expanded') === 'false'); await wait(() => document.activeElement === menuButton); pass('temporary Drawer Escape closes and restores menu-button focus');
		click(menuButton); click(document.querySelector('.MuiBackdrop-root')); await wait(() => menuButton.getAttribute('aria-expanded') === 'false'); pass('temporary Drawer backdrop closes');
		click(menuButton); click(document.querySelector('a[href="/_admin/gyms"]')); await wait(() => menuButton.getAttribute('aria-expanded') === 'false'); pass('navigation closes temporary Drawer');
		click(menuButton); flushSync(() => events.emit('routeChangeComplete')); await wait(() => menuButton.getAttribute('aria-expanded') === 'false'); pass('route completion closes temporary Drawer');
		for (const pathname of ['/_admin/users', '/_admin/programs', '/_admin/community', '/_admin/trainer-applications']) {
			router.pathname = pathname; render(Page); await tick(); assert(document.querySelector('#existing-page')); assert(document.querySelector('a[href="' + pathname + '"]')); const routeFile = fs.readFileSync(path.join(rootPath, 'pages', pathname, 'index.tsx'), 'utf8'); assert.match(routeFile, /withAdminLayout/);
		} pass('Users/Programs/Community/Trainer Applications shared-shell route structure');
		desktop = true; render(Page); await tick(); assert(document.querySelector('.MuiDrawer-docked')); assert(!button(messages.navigation.openMenu)); pass('resize returns to permanent desktop Drawer');
		const shellSource = fs.readFileSync(path.join(rootPath, 'libs/components/layout/LayoutAdmin.tsx'), 'utf8');
		assert.match(shellSource, /min-width:1200px/); assert.match(shellSource, /minWidth: 44, minHeight: 44/); assert.match(shellSource, /xs: 0, lg:/); assert.doesNotMatch(shellSource, /disableEnforceFocus|disableAutoFocus/);
		const sass = require('sass'); const shellCss = sass.compileString('$font: sans-serif; @import "scss/pc/admin/admin.scss";', { loadPaths: [rootPath], logger: sass.Logger.silent }).css;
		assert.match(shellCss, /@media \(max-width: 1199px\)/); assert.match(shellCss, /#pc-wrap.admin #bunker \{\s*width: 100%;\s*margin-left: 0;/);
		const css = sass.compile(path.join(rootPath, 'scss/pc/admin/gyms.scss'), { logger: sass.Logger.silent }).css;
		assert.match(css, /overflow-x: auto/); assert.match(css, /min-width: 740px/); assert.match(css, /flex-wrap: wrap/); assert.match(css, /max-width: 599px/); assert.match(css, /min-height: 44px/); assert.match(css, /overflow-wrap: anywhere/); pass('compiled SCSS contracts: narrow offset removed, internal table scroll, wrapping and touch sizes');
		assert(!fs.existsSync(path.join(rootPath, 'pages/_admin/gyms/detail.tsx')));
		assert.doesNotMatch(fs.readFileSync(path.join(rootPath, 'libs/components/admin/gyms/Gyms.tsx'), 'utf8'), /useMutation|CREATE_GYM|UPDATE_GYM_BY_ADMIN|gym\/detail/); pass('read-only scope; no detail page or mutation execution');
		console.log(`${checks} G3C DOM/query/responsive contract groups passed. Browser viewport QA not performed.`);
		return checks;
	} finally {
		if (root) root.unmount(); if (client) client.stop(); await new Promise((resolve) => setTimeout(resolve, 50)); dom.window.close();
		for (const key of keys) { if (previous[key]) Object.defineProperty(global, key, previous[key]); else delete global[key]; }
	}
};
if (require.main === module) module.exports().catch((error) => { console.error(error); process.exitCode = 1; });
