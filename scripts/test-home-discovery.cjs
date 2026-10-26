// Isolated DOM coverage: real React/MUI/i18next; no API requests or application data writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const base = path.resolve(__dirname, '..');
let checks = 0;
const pass = (name) => { checks++; console.log('PASS ' + name); };
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(base, file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file,
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('swiper/css')) return {};
		if (name.startsWith('.')) {
			const resolved = path.resolve(path.dirname(file), name);
			return loadTs(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '.tsx', mocks, cache);
		}
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}
async function main() {
	const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', { url: 'http://localhost/' });
	for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'Event', 'MouseEvent', 'KeyboardEvent', 'localStorage'])
		global[name] = dom.window[name];
	Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
	global.getComputedStyle = dom.window.getComputedStyle;
	global.IS_REACT_ACT_ENVIRONMENT = true;
	let measuredLayerHeight = 104;
	const resizeObservers = new Map();
	global.ResizeObserver = class {
		constructor(callback) { this.callback = callback; }
		observe(element) { resizeObservers.set(this, { element, callback: this.callback }); }
		disconnect() { resizeObservers.delete(this); }
	};
	// JSDOM has no layout. Supply only anchor geometry, not visual/layout assertions.
	dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
		const height = this.classList.contains('global-program-search-layer') ? measuredLayerHeight : 80;
		return { x: 0, y: 0, top: 0, left: 0, right: 1440, bottom: height, width: 1440, height, toJSON() {} };
	};
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { act, Simulate } = require('react-dom/test-utils');
	const root = createRoot(document.getElementById('root'));
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(['en', 'kr', 'ru'].map((locale) => [locale, {
		common: JSON.parse(fs.readFileSync(path.join(base, 'public/locales', locale, 'common.json'), 'utf8')),
	}]));
	await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	let mobile = false;
	let reducedMotion = false;
	dom.window.matchMedia = (query) => ({ matches: query.includes('reduced-motion') ? reducedMotion : mobile, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
	let user = { _id: '', memberType: 'USER' };
	const pushes = [];
	const events = new Map();
	const router = {
		pathname: '/', query: {}, locale: 'en', asPath: '/',
		events: { on: (name, fn) => events.set(name, fn), off: (name) => events.delete(name) },
		push: async (...args) => { pushes.push(args); return true; },
	};
	const link = React.forwardRef(({ href, children, passHref, scroll, ...props }, ref) => React.createElement('a', {
		...props, ref, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
	}, children));
	const image = ({ fill, priority, ...props }) => React.createElement('img', props);
	const mocks = {
		'@mui/material': { ...require('@mui/material'), useMediaQuery: (query) => query.includes('reduced-motion') ? reducedMotion : mobile },
		'@mui/icons-material': { Logout: require('@mui/icons-material/Logout').default },
		'phosphor-react': { CaretDown: () => React.createElement('svg', { 'aria-hidden': true }) },
		'next/router': { useRouter: () => router, withRouter: (component) => component },
		'next/link': { __esModule: true, default: link },
		'next/image': { __esModule: true, default: image },
		'next-i18next': { useTranslation: () => ({ t: i18n.getFixedT(router.locale), i18n }) },
		'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
		'framer-motion': { motion: { create: (component) => component }, useReducedMotion: () => reducedMotion },
		'@apollo/client': { useReactiveVar: (variable) => variable() },
		'../../../apollo/store': { userVar: () => user },
		'../../apollo/store': { userVar: () => user },
		'../../auth': { logOut() {} },
		'../auth': { logOut() {} },
		'../../hooks/useDeviceDetect': { __esModule: true, default: () => mobile ? 'mobile' : 'desktop' },
		'../libs/hooks/useDeviceDetect': { __esModule: true, default: () => mobile ? 'mobile' : 'desktop' },
		'../hooks/useDeviceDetect': { __esModule: true, default: () => mobile ? 'mobile' : 'desktop' },
	};
	const cache = new Map();
	const load = (file, extra = {}) => loadTs(file, { ...mocks, ...extra }, cache);
	const { ProgramsHeader } = load('libs/components/program/ProgramsNavigation.tsx');
	const Search = load('libs/components/GlobalProgramSearch.tsx').default;
	const Hero = load('libs/components/homepage/HomeHero.tsx').default;
	const Categories = load('libs/components/homepage/ExploreCategories.tsx').default;
	const { DiscoveryFilter } = load('libs/components/program/Filter.tsx');
	const { ProgramCategory, ProgramLocation } = load('libs/enums/program.enum.ts');
	const { readProgramsInquiry, initialProgramsInquiry } = load('libs/program.ts');
	const featuredCategories = ['MUSCLE_GAIN', 'YOGA', 'PILATES', 'CARDIO'];
	const featuredAssets = {
		MUSCLE_GAIN: '/img/fiber/strength-dumbbell-curl.webp',
		YOGA: '/img/fiber/yoga-outdoor-flow.webp',
		PILATES: '/img/fiber/pilates-training.webp',
		CARDIO: '/img/fiber/cardio-skipping.webp',
	};
	assert.deepEqual(Object.values(ProgramCategory), ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'YOGA', 'PILATES', 'CROSSFIT', 'CARDIO', 'REHAB']);
	const render = async (element) => { await act(async () => { root.render(element); }); };
	const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, mobile && !reducedMotion ? 180 : 0)); }); };
	const click = async (element) => {
		assert(element, 'click target exists');
		await act(async () => { element.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
		await settle();
	};
	const trigger = () => document.querySelector('.global-program-search-trigger');
	const form = () => document.querySelector('form[role="search"]');
	const input = () => form().querySelector('input[type="search"]');
	const escape = async (element) => { await act(async () => { Simulate.keyDown(element, { key: 'Escape' }); }); await settle(); };
	const select = async (index, value) => {
		const fields = form().querySelectorAll('[aria-haspopup="listbox"]');
		await act(async () => { Simulate.mouseDown(fields[index], { button: 0 }); });
		const listbox = [...document.querySelectorAll('[role="listbox"]')].at(-1);
		assert(listbox);
		assert.deepEqual([...listbox.querySelectorAll('[role="option"]')].map((option) => option.dataset.value), ['', ...Object.values(index === 0 ? ProgramLocation : ProgramCategory)]);
		await click(listbox.querySelector(`[role="option"][data-value="${value}"]`));
		assert(form(), 'dropdown selection does not dismiss search');
	};
	try {
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			const t = i18n.getFixedT(locale);
			for (const key of ['Search', 'Program Search', 'Program name', 'Program discovery.Search placeholder', 'Location', 'Category', 'Home hero.Any', 'Program discovery.Close filters', 'Home categories.Title'])
				assert(i18n.exists(key, { lng: locale, fallbackLng: false }), locale + ' has ' + key);
			await render(React.createElement(Hero));
			assert(!document.querySelector('form, input, .home-hero-search, .gymflow-search'));
			assert(document.querySelector('.home-hero-photo img').src.endsWith('/img/fiber/strength-barbell.webp'));
			assert.deepEqual([...document.querySelectorAll('.home-hero-actions a')].map((a) => a.getAttribute('href')), ['/program', '/trainer']);
			pass(locale + ' existing locale keys, clean Hero, preserved photo and discovery links');
			await render(React.createElement(Categories));
			const links = [...document.querySelectorAll('.explore-category-tile')];
			assert.equal(links.length, 4);
			assert.deepEqual(links.map((a) => {
				const url = new URL(a.href);
				assert.equal(url.pathname, '/program');
				const inquiry = readProgramsInquiry(url.searchParams.get('input'));
				assert.equal(inquiry.page, 1);
				return inquiry.search.categoryList[0];
			}), featuredCategories);
			pass(locale + ' exactly four approved featured categories use existing Programs inquiry');
			for (const link of links) {
				const inquiry = readProgramsInquiry(new URL(link.href).searchParams.get('input'));
				const category = inquiry.search.categoryList[0];
				const label = t('Program discovery card.' + category);
				assert.equal(link.querySelector('.explore-category-content > span').textContent, label);
				assert.equal(link.getAttribute('aria-label'), t('Home categories.Browse category', { category: label }));
				link.focus();
				assert.equal(document.activeElement, link);
				const image = link.querySelector('img');
				assert(image);
				assert.equal(image.alt, '');
				assert.equal(image.getAttribute('src'), featuredAssets[category]);
				assert(fs.existsSync(path.join(base, 'public', image.getAttribute('src'))));
				assert(image.sizes.includes('max-width: 767px'));
				assert(image.sizes.includes('max-width: 1344px'));
			}
			pass(locale + ' featured labels, accessible full-card links and exact audited responsive images');
			mobile = false;
			let programDraft;
			function ProgramsFilterHarness() {
				const [draft, setDraft] = React.useState({ ...initialProgramsInquiry, search: {} });
				programDraft = draft;
				return React.createElement(DiscoveryFilter, {
					draft, setDraft, onApply() {}, onReset() {}, error: '', idPrefix: 'canonical-category-check',
				});
			}
			await render(React.createElement(ProgramsFilterHarness));
			const categoryGroup = [...document.querySelectorAll('fieldset')].find((group) => group.querySelector('legend')?.textContent === t('Category'));
			const categoryLabels = [...categoryGroup.querySelectorAll('label')];
			assert.deepEqual(categoryLabels.map((label) => label.textContent), Object.values(ProgramCategory).map((category) => t('Program discovery card.' + category)));
			await click(categoryGroup.querySelector('.discovery-filter-toggle'));
			for (const category of ['WEIGHT_LOSS', 'CROSSFIT', 'REHAB']) {
				const label = categoryLabels.find((item) => item.textContent === t('Program discovery card.' + category));
				await click(label.querySelector('input[type="checkbox"]'));
				assert(label.querySelector('input').checked);
				assert(readProgramsInquiry(programDraft).search.categoryList.includes(category));
			}
			pass(locale + ' canonical enum and real Programs filters retain all seven categories; nonfeatured categories remain selectable');
			for (const scenario of [[false, false], [true, false], [true, true]]) {
				[mobile, reducedMotion] = scenario;
				await render(React.createElement(ProgramsHeader));
				assert(!form());
				assert.equal(trigger().getAttribute('aria-expanded'), 'false');
				await act(async () => { trigger().focus(); });
				await click(trigger());
				assert.equal(trigger().getAttribute('aria-expanded'), 'true');
				assert.equal(input().placeholder, t('Program discovery.Search placeholder'));
				assert.equal(form().querySelector('label').textContent, t('Search'));
				assert.equal(input().maxLength, 100);
				assert.equal(document.activeElement, input());
				assert.equal(form().querySelectorAll('[aria-haspopup="listbox"]').length, 2);
				assert.equal(form().querySelectorAll('.MuiFormControl-root').length, 3);
				assert(!form().textContent.includes(t('Home hero.Format')));
				const visibleClose = [...document.querySelectorAll(`button[aria-label="${t('Program discovery.Close filters')}"]`)].filter((button) => !button.closest('[aria-hidden="true"]'));
				assert.equal(visibleClose.length, 1);
				if (mobile) {
					assert.equal(document.querySelector('.global-program-search-space').style.height, '0px');
					assert(document.querySelector('[role="dialog"][aria-modal="true"]'));
					assert(document.querySelector('#root').getAttribute('aria-hidden') === 'true');
					await act(async () => { document.getElementById('outside').focus(); });
					assert(document.querySelector('[role="dialog"]').contains(document.activeElement), 'MUI contains mobile focus');
				} else {
					assert(document.querySelector('.global-program-search-layer'));
					assert.equal(document.querySelector('.global-program-search-space').style.height, measuredLayerHeight + 'px');
					assert(!document.querySelector('.MuiBackdrop-root, [aria-modal="true"]'));
				}
				pass(locale + (mobile ? ' mobile' : ' desktop') + ' closed/open state, focus, exactly three fields and one visible close');
				await select(0, 'SEOUL');
				await select(0, 'BUSAN');
				await select(1, 'YOGA');
				await act(async () => { Simulate.change(input(), { target: { value: '  yoga.*  ' } }); });
				await act(async () => { Simulate.submit(form()); });
				await settle();
				const [destination] = pushes.at(-1);
				assert.equal(destination.pathname, '/program');
				assert.deepEqual(JSON.parse(destination.query.input), {
					page: 1, limit: 9, sort: 'createdAt', direction: 'DESC',
					search: { categoryList: ['YOGA'], locationList: ['SEOUL', 'BUSAN'], text: 'yoga.*' },
				});
				assert(!form());
				pass(locale + (mobile ? ' mobile' : ' desktop') + ' real dropdowns preserve multi-select and submit normalized supported Programs URL');
				await click(trigger());
				await select(0, '');
				await select(1, '');
				assert(form().textContent.includes(t('Home hero.Any')));
				await escape(input());
				assert(!form());
				assert.equal(document.activeElement, trigger());
				await click(trigger());
				await click(mobile ? document.querySelector('.global-search-sheet-heading button') : trigger());
				assert(!form());
				pass(locale + (mobile ? ' mobile' : ' desktop') + ' Any reset, Escape and visible close restore trigger focus');
				await render(null);
			}
		}
		mobile = false;
		router.locale = 'en';
		await render(React.createElement('header', null, React.createElement(Search)));
		await click(trigger());
		await click(document.getElementById('outside'));
		assert(!form());
		pass('desktop outside click closes without an overlay');
		await click(trigger());
		const locationSelect = form().querySelector('[aria-haspopup="listbox"]');
		await act(async () => { Simulate.keyDown(locationSelect, { key: 'ArrowDown' }); });
		const keyboardListbox = [...document.querySelectorAll('[role="listbox"]')].at(-1);
		assert(keyboardListbox);
		await escape(keyboardListbox);
		assert(form(), 'first Escape dismisses only the dropdown');
		assert.equal(locationSelect.getAttribute('aria-expanded'), 'false');
		await escape(input());
		assert(!form());
		pass('selector opens from the keyboard; Escape closes the selector before the search layer');
		await render(React.createElement(ProgramsHeader));
		await click(trigger());
		const reservedSpace = document.querySelector('.global-program-search-space');
		assert.equal(document.querySelector('header').nextElementSibling, reservedSpace);
		assert.equal(reservedSpace.style.height, '104px');
		measuredLayerHeight = 128;
		await act(async () => { for (const { callback } of resizeObservers.values()) callback(); });
		assert.equal(reservedSpace.style.height, '128px');
		await escape(input());
		assert.equal(reservedSpace.style.height, '0px');
		assert.equal(resizeObservers.size, 0);
		await click(trigger());
		mobile = true;
		await render(React.createElement(ProgramsHeader));
		assert.equal(reservedSpace.style.height, '0px');
		assert(document.querySelector('[role="dialog"]'));
		await escape(input());
		mobile = false;
		measuredLayerHeight = 104;
		pass('desktop flow reserves the measured layer height, tracks resizing, and clears on close/mobile transition');
		router.pathname = '/program';
		router.query.input = JSON.stringify({ page: 4, search: { text: 'restore', locationList: ['ONLINE'], categoryList: ['REHAB'], typeList: ['ONLINE'], pricesRange: { start: 1, end: 50 } } });
		await click(trigger());
		assert.equal(input().value, 'restore');
		assert(form().textContent.includes(i18n.getFixedT('en')('ONLINE')));
		await act(async () => { Simulate.submit(form()); });
		assert.deepEqual(JSON.parse(pushes.at(-1)[0].query.input).search, { categoryList: ['REHAB'], locationList: ['ONLINE'], text: 'restore' });
		pass('Programs URL hydration retains discovery values and excludes advanced filters');
		await click(trigger());
		await act(async () => { events.get('routeChangeComplete')?.(); });
		assert(!form());
		router.query.input = JSON.stringify({ search: { text: 'back', locationList: ['DAEGU'] } });
		await click(trigger());
		assert.equal(input().value, 'back');
		await escape(input());
		pass('route completion closes search and reopening reads current URL after history navigation');
		for (user of [{ _id: '' }, { _id: 'user', memberType: 'USER' }, { _id: 'trainer', memberType: 'TRAINER' }]) {
			await render(React.createElement(ProgramsHeader));
			const header = document.querySelector('header');
			for (const href of ['/', '/program', '/trainer', '/community?articleCategory=FREE', '/help']) assert(header.querySelector(`a[href="${href}"]`));
			assert.equal(Boolean(header.querySelector('a[href="/mypage"]')), Boolean(user._id));
			assert.equal(Boolean(header.querySelector('#programs-account-button')), Boolean(user._id));
			assert.equal(Boolean(header.querySelector('a[href="/account/join"]')), !user._id);
			if (user._id) {
				await click(document.querySelector('#programs-account-button'));
				assert(document.querySelector('[role="menuitem"][href="/mypage"]'));
				assert([...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent === i18n.getFixedT('en')('Program navigation.Logout')));
				await escape(document.querySelector('[role="menu"]'));
			}
			await click(document.querySelector('#programs-language-button'));
			await click(document.querySelector('[role="menuitem"][id="ru"]'));
			assert.deepEqual(pushes.at(-1), [router.asPath, router.asPath, { locale: 'ru' }]);
			assert.equal(localStorage.getItem('locale'), 'ru');
			pass((user._id || 'guest') + ' navigation/auth destinations and actual language switching remain intact');
		}
		const Top = load('libs/components/Top.tsx').default;
		for (mobile of [false, true]) {
			router.pathname = '/trainer';
			await render(React.createElement(Top));
			assert.equal(document.querySelectorAll('.global-program-search-trigger').length, 1);
			for (const href of ['/', '/program', '/trainer', '/community?articleCategory=FREE']) assert(document.querySelector(`a[href="${href}"]`));
			await click(trigger());
			assert(form());
			if (!mobile) assert.equal(document.querySelector('.global-program-search-space').style.height, measuredLayerHeight + 'px');
			await escape(input());
			assert(!form());
			pass((mobile ? 'mobile' : 'desktop') + ' legacy customer navbar retains destinations and opens shared search');
		}
		const stub = (name) => ({ __esModule: true, default: () => React.createElement('section', { 'data-section': name }) });
		const Home = loadTs('pages/index.tsx', { ...mocks,
			'../libs/components/layout/LayoutHome': { __esModule: true, default: (component) => component },
			'../libs/components/homepage/ExploreCategories': stub('categories'),
			'../libs/components/homepage/TrendPrograms': stub('programs'),
			'../libs/components/homepage/TopTrainers': stub('trainers'),
			'../libs/components/homepage/CommunityBoards': stub('community'),
			'../libs/components/homepage/FinalCta': stub('cta'),
		}).default;
		for (mobile of [false, true]) {
			await render(React.createElement(Home));
			assert.deepEqual([...document.querySelectorAll('[data-section]')].map((el) => el.dataset.section), ['categories', 'programs', 'trainers', 'community', 'cta']);
			pass((mobile ? 'mobile' : 'desktop') + ' renders each discovery section exactly once in the approved order');
		}
		assert.equal(Object.values(ProgramLocation).length, 9);
		console.log(checks + ' homepage discovery checks passed.');
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
	}
}
const watchdog = setTimeout(() => { console.error('Homepage discovery tests did not settle'); process.exit(1); }, 90000);
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
