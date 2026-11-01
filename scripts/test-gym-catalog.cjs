// Real React/MUI/Apollo catalog checks with deterministic, read-only fixture transport.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rootPath = path.resolve(__dirname, '..');
function load(file, mocks, cache = new Map()) {
	file = path.resolve(rootPath, file);
	if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
	if (cache.has(file)) return cache.get(file);
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

async function main() {
	let checks = 0;
	const pass = (name) => { checks++; console.log('PASS G4C ' + name); };
	const { JSDOM } = require('jsdom');
	const keys = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'Image'];
	const previous = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/gym' });
	let root, client;
	try {
		for (const key of keys) Object.defineProperty(global, key, { value: dom.window[key], configurable: true, writable: true });
		const React = require('react');
		const { createRoot } = require('react-dom/client');
		const { flushSync } = require('react-dom');
		const apollo = require('@apollo/client');
		const mui = require('@mui/material');
		const resources = Object.fromEntries(['en', 'kr', 'ru'].map((lng) => [lng, { gyms: JSON.parse(fs.readFileSync(path.join(rootPath, 'public/locales', lng, 'gyms.json'), 'utf8')) }]));
		const i18n = require('i18next').createInstance();
		await i18n.init({ resources, lng: 'en', initImmediate: false, fallbackLng: false });
		const messages = resources.en.gyms;
		let mobile = false, fault = false, empty = false, hold = false, Catalog;
		const requests = [], navigations = [], namespaces = [];
		const router = { isReady: false, locale: 'en', pathname: '/gym', query: {},
			push: async (url, unused, options) => { navigations.push({ url, options }); router.query = url.query; render(Catalog); return true; },
		};
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/head': { __esModule: true, default: () => null },
			'next/link': { __esModule: true, default: ({ href, children, passHref, legacyBehavior, ...props }) => React.createElement('a', { ...props, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) }, children) },
			'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(router.locale, ns), i18n }) },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async (locale, names) => { namespaces.push({ locale, names }); return {}; } },
			'../../libs/components/layout/LayoutBasic': { __esModule: true, default: (Component) => Component },
			'../../config': { REACT_APP_API_URL: 'http://localhost:3007' },
			'@mui/material': { ...mui, useMediaQuery: (query) => query.includes('prefers-reduced-motion') ? true : mobile },
		};
		const images = ['uploads/gym/123e4567-e89b-42d3-a456-426614174000.jpg', 'uploads/gym/123e4567-e89b-42d3-a456-426614174001.png'];
		const fixtures = Array.from({ length: 22 }, (_, index) => ({
			_id: index.toString(16).padStart(24, 'a'), gymName: 'Gym ' + index, gymLocation: index % 2 ? 'BUSAN' : 'SEOUL',
			gymAddress: '123 Seoul Street', gymImages: images, gymDesc: index === 2 ? null : 'A calm place to train.',
			amenities: ['PARKING', 'SHOWER', 'LOCKER', 'SAUNA', 'WIFI', 'TOWEL'],
			createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:00:00.000Z',
			gymStatus: 'PRIVATE_STATUS', gymRevision: 999, deletedAt: 'PRIVATE_DELETE', __v: 99,
		}));
		fixtures[1].gymImages = ['https://untrusted.example/image.jpg'];
		fixtures[2].gymImages = [];
		client = new apollo.ApolloClient({ cache: new apollo.InMemoryCache(), link: new apollo.ApolloLink((operation) => new apollo.Observable((observer) => {
			assert.equal(operation.operationName, 'GetGyms', 'Only the public catalog read is allowed');
			const input = JSON.parse(JSON.stringify(operation.variables.input)); requests.push(input);
			if (hold) return () => {};
			const timer = setTimeout(() => {
				if (fault) return observer.error(new Error('private GraphQL/network details'));
				const list = empty ? [] : fixtures.filter((gym) =>
					(!input.search.text || gym.gymName.toLowerCase().includes(input.search.text.toLowerCase())) &&
					(!input.search.locationList?.length || input.search.locationList.includes(gym.gymLocation)) &&
					(input.search.amenities ?? []).every((amenity) => gym.amenities.includes(amenity)));
				observer.next({ data: { getGyms: { list: list.slice((input.page - 1) * input.limit, input.page * input.limit), metaCounter: [{ total: list.length }] } } }); observer.complete();
			}, 10);
			return () => clearTimeout(timer);
		})) });
		root = createRoot(document.getElementById('root'));
		const theme = mui.createTheme();
		const render = (Component, props = {}) => flushSync(() => root.render(React.createElement(mui.ThemeProvider, { theme }, React.createElement(apollo.ApolloProvider, { client }, React.createElement(Component, props)))));
		const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
		const wait = async (condition) => { for (let n = 0; n < 100; n++) { if (condition()) return; await tick(); } assert.fail('Timed out waiting for catalog state'); };
		const click = (node) => { assert(node, 'Clickable element exists'); flushSync(() => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); };
		const button = (label, scope = document) => Array.from(scope.querySelectorAll('button')).find((node) => node.textContent === label || node.getAttribute('aria-label') === label || (node.classList.contains('gym-filter-trigger') && node.textContent.startsWith(label)));
		const last = () => requests[requests.length - 1];
		const settled = () => document.querySelector('.gym-catalog-results')?.getAttribute('aria-busy') === 'false';
		const queryChange = async (action) => { const before = requests.length; await action(); await wait(() => requests.length > before && settled()); };
		const route = (input) => { router.query = input === undefined ? {} : { input: typeof input === 'string' ? input : JSON.stringify(input) }; render(Catalog); };
		const typeSearch = (value) => {
			const input = document.querySelector('input[type="search"]');
			Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
			flushSync(() => input.dispatchEvent(new window.Event('input', { bubbles: true })));
		};
		const submit = () => flushSync(() => document.querySelector('form[role="search"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
		const changeSort = (value) => { const select = document.querySelector('.gym-sort select'); select.value = value; flushSync(() => select.dispatchEvent(new window.Event('change', { bubbles: true }))); };
		const pageModule = load('pages/gym/index.tsx', mocks);
		Catalog = pageModule.default;
		await pageModule.getStaticProps({ locale: 'kr' }); assert.deepEqual(namespaces, [{ locale: 'kr', names: ['common', 'gyms'] }]); pass('public Pages route loads common and gyms namespaces');
		render(Catalog); await tick(); assert.equal(requests.length, 0); assert(document.querySelector('.gym-skeleton-grid')); pass('router readiness prevents premature default query; geometry-shaped skeletons render');
		router.isReady = true; route('{broken'); await wait(settled);
		assert.deepEqual(last(), { page: 1, limit: 9, sort: 'createdAt', direction: 'DESC', search: {} }); pass('malformed URL is safe; normalized public GET_GYMS uses deterministic nine-item default');
		assert.equal(document.querySelectorAll('article.gym-card').length, 9); assert.equal(document.querySelector('.gym-results-total').textContent, '22 gyms'); pass('real total comes from metaCounter, with server pagination rather than client slicing');
		const firstCard = document.querySelector('article.gym-card');
		assert.equal(firstCard.querySelector('img').src, 'http://localhost:3007/' + images[0]);
		assert.equal(firstCard.querySelector('a').getAttribute('href'), '/gym/detail?id=' + fixtures[0]._id);
		assert.equal(firstCard.querySelectorAll('.gym-card-amenities > span').length, 4); assert.equal(firstCard.querySelector('.gym-card-more').textContent, '+3');
		assert.equal(firstCard.querySelector('.gym-card-action').textContent, messages.catalog.viewGym); pass('dedicated GymCard uses first cover, real fields, three amenities + calculated remainder, and detail destination');
		assert(!document.querySelector('img[src*="untrusted"]')); assert.equal(document.querySelectorAll('.gym-cover-fallback').length, 2);
		flushSync(() => firstCard.querySelector('img').dispatchEvent(new window.Event('error'))); assert(firstCard.querySelector('.gym-cover-fallback')); assert(!firstCard.querySelector('img')); pass('missing, external and failed covers use neutral fallback without stock photos or switching to another cover');
		assert(!document.body.textContent.includes('PRIVATE_')); assert(!document.querySelector('.gym-catalog-results button'));
		assert(!/rating|review|price|distance|open now|favorite|bookmark|programCount|trainerCount/i.test(document.querySelector('.gym-catalog-results').textContent)); pass('cards expose no admin metadata, fabricated metrics, or conflicting nested actions');
		const restored = { page: 2, limit: 9, sort: 'updatedAt', direction: 'DESC', search: { text: 'Gym', locationList: ['SEOUL', 'BUSAN'], amenities: ['SHOWER', 'LOCKER'] } };
		await queryChange(() => route(restored)); assert.deepEqual(last(), restored);
		assert.equal(document.querySelectorAll('.gym-location-options [aria-pressed="true"]').length, 2); assert.equal(document.querySelectorAll('.gym-amenity-options input:checked').length, 2);
		assert.equal(document.querySelector('input[type="search"]').value, 'Gym'); assert.equal(document.querySelector('.gym-sort select').value, 'updatedAt'); pass('shareable/back-forward URL restores search, multi-location OR, all-amenity arrays, sort and page');
		const beforeTyping = requests.length; typeSearch('  Gym 1  '); await tick(); assert.equal(requests.length, beforeTyping);
		await queryChange(submit); assert.equal(last().page, 1); assert.equal(last().search.text, 'Gym 1'); assert.deepEqual(last().search.amenities, restored.search.amenities); pass('search submits trimmed Gym-name text, keeps filters, resets page, and does not query on keystrokes');
		await queryChange(() => route(restored)); await queryChange(() => click(button('Seoul'))); assert.equal(last().page, 1); assert.deepEqual(last().search.locationList, ['BUSAN']);
		await queryChange(() => click(button('Seoul'))); assert.deepEqual(last().search.locationList, ['BUSAN', 'SEOUL']); pass('locations are independent multi-select toggles and reset pagination');
		await queryChange(() => route(restored)); await queryChange(() => click(document.querySelector('.gym-amenity-options input')));
		assert.equal(last().page, 1); assert.deepEqual(last().search.amenities, ['SHOWER', 'LOCKER', 'PARKING']); assert.deepEqual(last().search.locationList, restored.search.locationList); pass('amenities preserve all-selected arrays and reset page without losing locations');
		await queryChange(() => route(restored)); await queryChange(() => changeSort('createdAt'));
		assert.equal(last().page, 1); assert.equal(last().sort, 'createdAt'); assert.equal(last().direction, 'DESC'); assert.deepEqual(last().search, restored.search); pass('only real createdAt/updatedAt sort options map to descending order and reset page');
		await queryChange(() => click(button('Go to page 2'))); assert.equal(last().page, 2); assert.deepEqual(last().search, restored.search); assert.equal(navigations.at(-1).options.scroll, false); pass('desktop numbered pagination preserves all filters and existing scroll:false convention');
		await queryChange(() => click(button('Remove Seoul filter'))); assert.equal(last().page, 1); assert.deepEqual(last().search.locationList, ['BUSAN']);
		await queryChange(() => click(button(`Remove ${messages.amenities.SHOWER} filter`))); assert.deepEqual(last().search.amenities, ['LOCKER']); pass('compact applied chips remove the precise value and reset pagination');
		await queryChange(() => click(button(messages.filters.clearAll))); assert.deepEqual(last(), { page: 1, limit: 9, sort: 'createdAt', direction: 'DESC', search: {} }); pass('Clear all removes search and filters, restores legitimate defaults, and updates serialized URL');
		await queryChange(() => route({ ...restored, page: 1, search: { text: 'missing' } })); assert(document.body.textContent.includes(messages.catalog.filteredEmpty)); assert(button(messages.filters.clearFilters));
		empty = true; await queryChange(() => click(button(messages.filters.clearFilters))); assert(document.body.textContent.includes(messages.catalog.empty)); assert(!button(messages.filters.clearFilters)); pass('filtered empty and true catalog empty have distinct localized recovery');
		empty = false; fault = true; await queryChange(() => route(restored)); assert(document.querySelector('[role="alert"]').textContent.includes(messages.catalog.error)); assert(!document.body.textContent.includes('private GraphQL'));
		const failedInquiry = last(); fault = false; await queryChange(() => click(button(messages.retry))); assert.deepEqual(last(), failedInquiry); pass('recoverable error hides transport details; Retry refetches the exact current inquiry');
		await queryChange(() => route({ ...restored, page: 50 })); assert(document.body.textContent.includes(messages.catalog.pageEmpty)); await queryChange(() => click(button(messages.pagination.first))); assert.equal(last().page, 1); assert.deepEqual(last().search, restored.search); pass('out-of-range shared pages recover to first page without claiming an empty catalog');
		mobile = true; render(Catalog); await tick(); const trigger = button(messages.filters.title); assert(trigger); assert(!document.querySelector('.gym-desktop-filters')); assert(document.querySelector('.gym-filter-count')); pass('mobile retains search, replaces desktop controls with counted Filters action, and has compact pagination');
		await queryChange(() => click(button(messages.pagination.next))); assert.equal(last().page, 2); assert.deepEqual(last().search, restored.search);
		await queryChange(() => click(button(messages.pagination.previous))); assert.equal(last().page, 1); pass('mobile Previous/Page X of Y/Next use real total and preserve query state');
		trigger.focus(); click(trigger); await wait(() => document.querySelector('[role="dialog"]'));
		let dialog = document.querySelector('[role="dialog"]'); assert.equal(dialog.getAttribute('aria-labelledby'), 'gym-filter-title'); await wait(() => dialog.contains(document.activeElement));
		const beforeDraft = requests.length, beforeUrl = router.query.input; click(button('Seoul', dialog)); click(dialog.querySelector('.gym-amenity-options input')); await tick();
		assert.equal(requests.length, beforeDraft); assert.equal(router.query.input, beforeUrl); pass('accessible modal owns focus; drawer location/amenity changes remain local draft until Apply');
		flushSync(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })));
		await wait(() => !document.querySelector('[role="dialog"]')); await wait(() => document.activeElement === trigger); assert.equal(router.query.input, beforeUrl); pass('Escape discards unfinished draft and restores focus to Filters trigger');
		click(trigger); await wait(() => document.querySelector('[role="dialog"]')); dialog = document.querySelector('[role="dialog"]'); assert(button('Seoul', dialog).getAttribute('aria-pressed') === 'true');
		click(button(messages.filters.clear, dialog)); assert.equal(dialog.querySelectorAll('[aria-pressed="true"], input:checked').length, 0); assert.equal(router.query.input, beforeUrl);
		click(button(messages.filters.close, dialog)); await wait(() => !document.querySelector('[role="dialog"]')); assert.equal(router.query.input, beforeUrl); pass('Clear only clears drawer draft; explicit close discards it; reopening restores committed selections');
		await queryChange(() => route(restored)); click(button(messages.filters.title)); await wait(() => document.querySelector('[role="dialog"]')); dialog = document.querySelector('[role="dialog"]');
		click(button(messages.filters.clearAll, dialog)); click(button('Seoul', dialog)); click(button('Busan', dialog)); click(dialog.querySelectorAll('.gym-amenity-options input')[1]); click(dialog.querySelectorAll('.gym-amenity-options input')[2]);
		const beforeUnchangedApply = requests.length; click(button(messages.filters.apply, dialog)); await wait(() => !document.querySelector('[role="dialog"]')); assert.equal(requests.length, beforeUnchangedApply); assert.equal(last().page, 2); pass('unchanged Apply closes without resetting page or dispatching another query');
		click(button(messages.filters.title)); await wait(() => document.querySelector('[role="dialog"]')); dialog = document.querySelector('[role="dialog"]'); click(button('Seoul', dialog));
		await queryChange(() => click(button(messages.filters.apply, dialog))); assert.equal(last().page, 1); assert.deepEqual(last().search.locationList, ['BUSAN']); assert.deepEqual(last().search.amenities, ['SHOWER', 'LOCKER']); assert(!document.querySelector('[role="dialog"]')); pass('Apply commits draft multi-filters, preserves search, resets changed page, updates URL and closes');
		click(button(messages.filters.title)); await wait(() => document.querySelector('[role="dialog"]')); click(document.querySelector('.MuiBackdrop-root')); await wait(() => !document.querySelector('[role="dialog"]')); pass('backdrop cancels draft without committing');
		hold = true; route({ ...restored, search: { text: 'loading' } }); await wait(() => document.querySelector('.gym-skeleton-grid')); assert.equal(document.querySelectorAll('.gym-card-skeleton').length, 9); assert(document.querySelector('input[type="search"]')); hold = false; await queryChange(() => route(undefined)); pass('loading replaces old results with card-shaped skeletons and keeps discovery shell stable');
		for (const locale of ['kr', 'ru']) {
			router.locale = locale; render(Catalog); await tick(); assert.equal(document.querySelector('h1').textContent, resources[locale].gyms.catalog.intro); assert(document.querySelector('.gym-results-total').textContent.includes('22'));
			click(button(resources[locale].gyms.filters.title)); await wait(() => document.querySelector('[role="dialog"]')); assert(document.querySelector('[role="dialog"]').textContent.includes(resources[locale].gyms.filters.amenitiesHint)); click(button(resources[locale].gyms.filters.close)); await wait(() => !document.querySelector('[role="dialog"]'));
		} pass('KR/RU catalog, card labels, counts and real mobile drawer resolve localized copy');
		router.locale = 'en';
		const layoutMocks = { ...mocks,
			'../../hooks/useDeviceDetect': { __esModule: true, default: () => 'mobile' },
			'../Top': { __esModule: true, default: () => React.createElement('header', { id: 'existing-public-header' }) },
			'../Footer': { __esModule: true, default: () => React.createElement('footer', { id: 'existing-public-footer' }) },
			'../../../apollo/store': { userVar: apollo.makeVar({}) }, '../../auth': { logOut: () => {} },
			'next/image': { __esModule: true, default: () => null }, '../GlobalProgramSearch': { __esModule: true, default: () => null },
			'swiper/css': {}, 'swiper/css/pagination': {}, 'swiper/css/navigation': {},
		};
		const withLayout = load('libs/components/layout/LayoutBasic.tsx', layoutMocks).default;
		const Wrapped = withLayout(() => React.createElement('div', { id: 'public-gym-content' })); render(Wrapped); await tick();
		assert(document.querySelector('#pc-wrap.gym-catalog-layout.program-discovery-layout #public-gym-content')); assert(document.querySelector('#existing-public-header')); assert(document.querySelector('#existing-public-footer'));
		assert.equal(document.querySelectorAll('.programs-bottom-navigation a').length, 5); assert(!document.querySelector('.header-basic')); pass('guest route uses existing public layout and actual five-item bottom navigation without legacy banner or new shell');
		const sass = require('sass');
		const css = sass.compile(path.join(rootPath, 'scss/pc/gym/catalog.scss'), { logger: sass.Logger.silent }).css;
		assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/); assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/); assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
		assert.match(css, /max-width: 1023px/); assert.match(css, /max-width: 767px/); assert.match(css, /aspect-ratio: 16\/10/);
		assert.match(css, /min-height: 44px/); assert.match(css, /overflow-wrap: anywhere/); assert.match(css, /overflow-y: auto/); assert.match(css, /100dvh/); assert.match(css, /safe-area-inset-bottom/); pass('SCSS compiles with 3/2/1 grid, 16:10 covers, wrapping, touch targets and scrollable safe-area-aware drawer');
		assert.match(css, /\.gym-name-search:focus-within\s*\{[^}]*outline: 2px solid #a53425;[^}]*outline-offset: 3px;/);
		assert.match(css, /\.gym-name-search input:focus,[^}]*\.gym-name-search input:focus-visible,[^}]*\.gym-name-search \.MuiIconButton-root:focus-visible\s*\{\s*outline: none;/);
		pass('Gym search retains one shared focus boundary without nested input/button outlines');
		assert.match(fs.readFileSync(path.join(rootPath, 'scss/pc/program/program.scss'), 'utf8'), /padding-bottom: calc\(88px \+ env\(safe-area-inset-bottom/);
		assert.match(fs.readFileSync(path.join(rootPath, 'scss/pc/main.scss'), 'utf8'), /@import '\/scss\/pc\/gym\/catalog'/); pass('catalog SCSS is wired into existing pipeline and inherits fixed bottom-nav clearance');
		const { isGymImagePath } = load('libs/gym.ts', mocks);
		for (const invalid of [undefined, '', 'https://external.example/a.jpg', '../uploads/gym/a.jpg', images[0] + '?x=1', images[0].replace('gym/', 'program/')]) assert.equal(isGymImagePath(invalid), false);
		assert.equal(isGymImagePath(images[0]), true); pass('shared canonical Gym image validator reuses unchanged upload rules');
		console.log(`${checks} G4C catalog DOM/query/layout/SCSS groups passed. Fixture transport only; no backend writes. Browser viewport QA unavailable.`);
	} finally {
		if (root) root.unmount(); if (client) client.stop(); await new Promise((resolve) => setTimeout(resolve, 50)); dom.window.close();
		for (const key of keys) { if (previous[key]) Object.defineProperty(global, key, previous[key]); else delete global[key]; }
	}
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
