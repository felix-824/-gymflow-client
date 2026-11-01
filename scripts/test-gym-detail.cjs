// Real React/MUI/Apollo detail checks. Read-only fixture transport; no backend writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const rootPath = path.resolve(__dirname, '..');
function load(file, mocks, cache = new Map()) {
	file = path.resolve(rootPath, file);
	if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
		module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
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
	const pass = (name) => { checks++; console.log('PASS G4D ' + name); };
	const { JSDOM } = require('jsdom');
	const keys = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'Image'];
	const previous = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/gym/detail' });
	let root, client;
	try {
		for (const key of keys) Object.defineProperty(global, key, { value: dom.window[key], configurable: true, writable: true });
		const React = require('react');
		const { createRoot } = require('react-dom/client');
		const { flushSync } = require('react-dom');
		const apollo = require('@apollo/client');
		const mui = require('@mui/material');
		const resources = Object.fromEntries(['en', 'kr', 'ru'].map((lng) => [lng, Object.fromEntries(['common', 'gyms'].map((ns) => [ns, JSON.parse(fs.readFileSync(path.join(rootPath, 'public/locales', lng, ns + '.json'), 'utf8'))]))]));
		const i18n = require('i18next').createInstance();
		await i18n.init({ resources, lng: 'en', initImmediate: false, fallbackLng: false });
		const messages = resources.en.gyms;
		let mobile = false, programFault = false, trainerFault = false, programEmpty = false, trainerEmpty = false, primaryFault = false, holdPrimary = false;
		const id = (n) => n.toString(16).padStart(24, '0');
		const requests = [], namespaceLoads = [], definitions = new Map();
		const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
		const images = Array.from({ length: 5 }, (_, index) => `uploads/gym/123e4567-e89b-42d3-a456-42661417400${index}.jpg`);
		const gym = (gymId) => ({ _id: gymId.toLowerCase(), gymName: 'Gym ' + gymId.slice(-2), gymLocation: 'SEOUL', gymAddress: '123 Actual Street',
			gymDesc: 'Actual description only.', gymImages: images, gymPhone: '+82 (2) 555-0148', amenities: ['PARKING', 'SHOWER', 'LOCKER', 'SAUNA', 'WIFI', 'TOWEL'],
			openingHours: weekdays.map((dayOfWeek) => ({ dayOfWeek, isClosed: dayOfWeek === 'SUN', openTime: dayOfWeek === 'SUN' ? null : '07:00', closeTime: dayOfWeek === 'SUN' ? null : '22:00' })).reverse(),
			createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:00:00.000Z',
			gymStatus: 'PRIVATE_PAUSED', gymRevision: 999, deletedAt: 'PRIVATE_DELETE', __v: 99, ...definitions.get(gymId.toLowerCase()),
		});
		const trainer = (gymId, index) => ({ _id: id(500 + index), memberType: 'TRAINER', memberNick: 'trainer' + index, memberFullName: 'Trainer ' + gymId.slice(-2) + '-' + index,
			memberImage: '', memberDesc: 'Real profile description.', memberPrograms: 888, memberRank: 0, memberLikes: 0, memberViews: 0, memberFollowers: 333, memberArticles: 0, memberComments: 0, meLiked: [], meFollowed: [],
		});
		const program = (gymId, index) => ({ _id: id(100 + index), programName: 'Program ' + gymId.slice(-2) + '-' + index, programType: 'GROUP_CLASS', programCategory: 'YOGA', programStatus: 'ACTIVE', programLocation: 'SEOUL', programAddress: 'Actual Program Address', programDesc: null,
			programPrice: 15000, programDuration: 60, programCapacity: 8, programImages: ['uploads/program/example.jpg'], programRank: 0, programViews: 0, programLikes: 0, memberId: id(500 + index), memberData: trainer(gymId, index),
			deletedAt: null, createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:00:00.000Z', meLiked: [],
		});
		const router = { isReady: false, locale: 'en', pathname: '/gym/detail', query: {}, push: async () => { throw new Error('Child state must stay local'); } };
		const store = { userVar: apollo.makeVar({}) };
		const mocks = {
			'next/router': { useRouter: () => router }, 'next/head': { __esModule: true, default: () => null },
			'next/link': { __esModule: true, default: React.forwardRef(function MockLink({ href, children, passHref, legacyBehavior, ...props }, ref) { return React.createElement('a', { ...props, ref, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) }, children); }) },
			'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(router.locale, ns), i18n }) },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async (locale, names) => { namespaceLoads.push({ locale, names }); return {}; } },
			'../../libs/components/layout/LayoutBasic': { __esModule: true, default: (Component) => Component },
			'../../config': { REACT_APP_API_URL: 'http://localhost:3007', topProgramRank: 2 },
			'../../hooks/useDeviceDetect': { __esModule: true, default: () => mobile ? 'mobile' : 'desktop' },
			'../../../apollo/store': store,
			'./sweetAlert': { sweetMixinErrorAlert: async () => { throw new Error('No engagement writes in detail tests'); } },
			'@mui/material': { ...mui, useMediaQuery: (query) => query.includes('prefers-reduced-motion') ? true : mobile },
		};
		client = new apollo.ApolloClient({ cache: new apollo.InMemoryCache(), link: new apollo.ApolloLink((operation) => new apollo.Observable((observer) => {
			assert(['GetGym', 'GetPrograms', 'GetTrainers'].includes(operation.operationName), 'Only existing public reads are allowed');
			const variables = JSON.parse(JSON.stringify(operation.variables)); requests.push({ name: operation.operationName, variables });
			if (operation.operationName === 'GetGym' && holdPrimary) return () => {};
			const isSlow = variables.gymId === id(80) || variables.input?.search.gymId === id(81);
			const timer = setTimeout(() => {
				if (operation.operationName === 'GetGym') {
					if (variables.gymId === id(93)) { observer.next({ errors: [{ code: 'INTERNAL_SERVER_ERROR', message: 'Gym not found', extensions: { code: 'INTERNAL_SERVER_ERROR' } }], data: null }); observer.complete(); return; }
					if (variables.gymId === id(90)) { observer.next({ errors: [{ message: 'Gym not found PRIVATE_PAUSED', extensions: { code: 'NOT_FOUND', originalError: { statusCode: 404 } } }] }); observer.complete(); return; }
					if (primaryFault) { observer.error(new Error('private network stack')); return; }
					observer.next({ data: { getGym: variables.gymId === id(91) ? null : gym(variables.gymId) } });
				} else {
					const programs = operation.operationName === 'GetPrograms';
					if (programs ? programFault : trainerFault) { observer.error(new Error('private child stack')); return; }
					const input = variables.input, count = (programs ? programEmpty : trainerEmpty) ? 0 : 7;
					const list = Array.from({ length: count }, (_, index) => (programs ? program : trainer)(input.search.gymId, index)).slice((input.page - 1) * input.limit, input.page * input.limit);
					observer.next({ data: { [programs ? 'getPrograms' : 'getTrainers']: { list, metaCounter: [{ total: count }] } } });
				}
				observer.complete();
			}, isSlow ? 180 : 8);
			return () => { if (!isSlow) clearTimeout(timer); };
		})) });
		root = createRoot(document.getElementById('root'));
		const theme = mui.createTheme();
		const render = (Component, props = {}) => flushSync(() => root.render(React.createElement(mui.ThemeProvider, { theme }, React.createElement(apollo.ApolloProvider, { client }, React.createElement(Component, props)))));
		const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
		const wait = async (condition) => { for (let n = 0; n < 120; n++) { if (condition()) return; await tick(); } assert.fail('Timed out waiting for Gym detail state'); };
		const click = (node) => { assert(node, 'Clickable element exists'); flushSync(() => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))); };
		const button = (label, scope = document) => Array.from(scope.querySelectorAll('button')).find((node) => node.textContent === label || node.getAttribute('aria-label') === label);
		const count = (name) => requests.filter((request) => request.name === name).length;
		const last = (name) => requests.filter((request) => request.name === name).at(-1)?.variables;
		const pageModule = load('pages/gym/detail.tsx', mocks), Page = pageModule.default;
		const route = (value) => { router.query = value === undefined ? {} : { id: value }; render(Page); };
		const settled = () => document.querySelector('#gym-programs[aria-busy="false"]') && document.querySelector('#gym-trainers[aria-busy="false"]');
		const primaryReady = () => document.querySelector('.gym-detail-identity');
		const loadGym = async (value) => { route(value); await wait(settled); };
		await pageModule.getStaticProps({ locale: 'ru' }); assert.deepEqual(namespaceLoads, [{ locale: 'ru', names: ['common', 'gyms'] }]); pass('Pages detail route loads existing common and gyms namespaces');
		render(Page); await tick(); assert.equal(requests.length, 0); assert(document.querySelector('.gym-detail-skeleton .gym-gallery-skeleton')); pass('router readiness gates all requests and shows gallery/info/section skeleton geometry');
		router.isReady = true;
		for (const value of [undefined, '', 'bad', ' '.repeat(24), 'g'.repeat(24), id(1) + ' ', [id(1)]]) { route(value); await tick(); assert(document.body.textContent.includes(messages.detail.unavailable)); }
		assert.equal(requests.length, 0); assert(document.querySelector('a[href="/gym"]')); assert(document.querySelector('a[href="/program"]')); pass('missing, array and malformed IDs never query; neutral unavailable offers existing public routes');
		holdPrimary = true; route(id(1)); await tick(); assert.equal(count('GetGym'), 1); assert.equal(count('GetPrograms') + count('GetTrainers'), 0); holdPrimary = false; pass('children cannot query before public Gym is confirmed');
		await loadGym(id(2)); assert.deepEqual(last('GetGym'), { gymId: id(2) }); assert.deepEqual(last('GetPrograms').input, { page: 1, limit: 3, sort: 'createdAt', direction: 'DESC', search: { gymId: id(2) } }); assert.deepEqual(last('GetTrainers').input, last('GetPrograms').input); pass('existing Gym/Program/Trainer queries use exact arguments and authoritative Gym ID with independent three-item defaults');
		assert.equal(document.querySelector('h1').textContent, 'Gym 02'); assert(document.querySelector('.gym-detail-identity').textContent.includes('123 Actual Street')); assert(!document.body.textContent.includes('PRIVATE_')); pass('identity is real localized Gym data without lifecycle or invented geographic metadata');
		const programsSection = document.querySelector('#gym-programs'); let scrolled;
		programsSection.scrollIntoView = (options) => { scrolled = options; }; click(document.querySelector('a[href="#gym-programs"]')); assert.equal(scrolled.behavior, 'auto'); assert.equal(document.activeElement, programsSection); pass('Browse programs targets and focuses the same-page section with reduced-motion-safe scrolling');
		assert.equal(document.querySelector('.gym-detail-about p').textContent, 'Actual description only.'); assert.equal(document.querySelectorAll('.gym-detail-amenities li').length, 6); assert.equal(document.querySelectorAll('.gym-detail-amenities li svg').length, 6); pass('About is description only; amenities are actual enum names with existing icons and no feature descriptions');
		const hours = document.querySelector('.gym-detail-hours'); assert.deepEqual(Array.from(hours.querySelectorAll('dt')).map((node) => node.textContent), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']); assert.equal(hours.querySelectorAll('dd')[6].textContent, messages.detail.closed); assert(!hours.textContent.includes('00:00')); assert(hours.textContent.includes('07:00') && hours.textContent.includes('Asia/Seoul')); pass('reversed complete hours render MON–SUN with actual times; closed day has no fabricated midnight range');
		assert.equal(document.querySelector('a[href^="tel:"]').getAttribute('href'), 'tel:+8225550148'); assert(document.querySelector('.gym-detail-contact').textContent.includes('+82 (2) 555-0148')); pass('only real phone contact is rendered with a semantic normalized tel action');
		for (let n = 1; n <= 5; n++) { definitions.set(id(10 + n), { gymImages: images.slice(0, n) }); await loadGym(id(10 + n)); assert.equal(document.querySelectorAll('.gym-gallery-grid img').length, n); assert(document.querySelector('.gym-gallery.is-count-' + n)); }
		pass('desktop editorial gallery adapts to each actual image count from one through five');
		definitions.set(id(20), { gymImages: [images[0], 'https://external.example/image.jpg'] }); await loadGym(id(20));
		assert.equal(document.querySelectorAll('.gym-gallery-fallback').length, 1); assert(!document.querySelector('.gym-gallery img[src*="external"]')); flushSync(() => document.querySelector('.gym-gallery img').dispatchEvent(new window.Event('error'))); assert.equal(document.querySelectorAll('.gym-gallery-fallback').length, 2); pass('canonical image validation and active/first-image failures produce neutral fallbacks without stock images');
		definitions.set(id(21), { gymImages: [], gymDesc: null, amenities: [], openingHours: null, gymPhone: null }); await loadGym(id(21));
		assert(!document.querySelector('.gym-detail-about')); assert(!document.querySelector('.gym-detail-amenities')); assert(!document.querySelector('.gym-detail-contact')); assert(!document.querySelector('a[href^="tel:"]')); assert(document.querySelector('.gym-detail-hours').textContent.includes(messages.detail.hoursNotProvided)); assert(document.querySelector('.gym-gallery-fallback')); pass('absent description, amenities, phone and hours collapse gracefully without invented data or images');
		await loadGym(id(3)); const programs = document.querySelector('#gym-programs'), trainers = document.querySelector('#gym-trainers');
		assert.equal(programs.querySelectorAll('.discovery-program-card').length, 3); assert(programs.querySelector('a[href="/program/detail?id=' + id(100) + '"]')); assert.equal(trainers.querySelectorAll('.trainer-discovery-card').length, 3); assert(trainers.querySelector('a[href="/trainer/detail?trainerId=' + id(500) + '"]')); pass('actual existing ProgramCard and TrainerCard render their existing detail/profile destinations');
		assert.equal(trainers.querySelector('.trainer-card-stats'), null); assert.equal(trainers.querySelector('.trainer-discovery-card button'), null); assert(!trainers.textContent.includes('888')); assert(trainers.textContent.includes(messages.detail.trainersIntro)); pass('derived Trainer presentation has no venue counts, employment language or unhandled social actions');
		const shellReads = count('GetGym'), trainerReads = count('GetTrainers'); click(button('Go to page 2', programs)); await wait(() => last('GetPrograms').input.page === 2 && programs.getAttribute('aria-busy') === 'false'); assert.equal(count('GetGym'), shellReads); assert.equal(count('GetTrainers'), trainerReads); assert.equal(last('GetTrainers').input.page, 1); pass('Program pagination uses real total and does not refetch Gym or change Trainer pagination');
		const programReads = count('GetPrograms'); click(button('Go to page 2', trainers)); await wait(() => last('GetTrainers').input.page === 2 && trainers.getAttribute('aria-busy') === 'false'); assert.equal(count('GetPrograms'), programReads); assert.equal(count('GetGym'), shellReads); assert.equal(last('GetPrograms').input.page, 2); pass('Trainer pagination is local and does not mutate Program state or reload identity');
		programFault = true; click(button('Go to page 3', programs)); await wait(() => programs.querySelector('[role="alert"]')); const trainerPage = last('GetTrainers').input.page, primaryCount = count('GetGym'); assert(primaryReady()); assert(trainers.querySelector('.trainer-discovery-card')); assert(!document.body.textContent.includes('private child'));
		programFault = false; const beforeTrainer = count('GetTrainers'); click(button(messages.retry, programs)); await wait(() => programs.querySelector('.discovery-program-card')); assert.equal(last('GetPrograms').input.page, 3); assert.equal(count('GetTrainers'), beforeTrainer); assert.equal(count('GetGym'), primaryCount); assert.equal(last('GetTrainers').input.page, trainerPage); pass('Program error and Retry are local, preserve exact inquiry and keep Gym/Trainers intact');
		trainerFault = true; click(button('Go to page 3', trainers)); await wait(() => trainers.querySelector('[role="alert"]')); assert(programs.querySelector('.discovery-program-card')); trainerFault = false; const beforeProgram = count('GetPrograms'); click(button(messages.retry, trainers)); await wait(() => trainers.querySelector('.trainer-discovery-card')); assert.equal(last('GetTrainers').input.page, 3); assert.equal(count('GetPrograms'), beforeProgram); assert.equal(count('GetGym'), primaryCount); pass('Trainer error and Retry are local and leave Program state unchanged');
		programEmpty = true; await loadGym(id(4)); assert(primaryReady()); assert(document.querySelector('#gym-programs').textContent.includes(messages.detail.programsEmpty)); assert(document.querySelector('#gym-trainers .trainer-discovery-card')); pass('zero eligible Programs is a local empty state, not an unavailable Gym');
		programEmpty = false; trainerEmpty = true; await loadGym(id(5)); assert(primaryReady()); assert(document.querySelector('#gym-trainers').textContent.includes(messages.detail.trainersEmpty)); assert(document.querySelector('#gym-programs .discovery-program-card')); trainerEmpty = false; pass('zero derived Trainers keeps Gym and Programs visible');
		mobile = true; await loadGym(id(6)); let track = document.querySelector('.gym-gallery-track'); Object.defineProperty(track, 'clientWidth', { value: 358 }); let moved;
		track.scrollTo = (options) => { moved = options; track.scrollLeft = options.left; track.dispatchEvent(new window.Event('scroll')); };
		assert.equal(document.querySelector('.gym-gallery-controls [aria-live]').textContent, '1 / 5'); click(button(messages.detail.nextPhoto)); assert.equal(moved.left, 358); assert.equal(moved.behavior, 'auto'); assert.equal(document.querySelector('.gym-gallery-controls [aria-live]').textContent, '2 / 5'); pass('mobile native swipe/scroll gallery has real counter and practical reduced-motion-safe controls');
		flushSync(() => track.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))); assert.equal(document.querySelector('.gym-gallery-controls [aria-live]').textContent, '3 / 5');
		flushSync(() => { track.scrollLeft = 4 * 358; track.dispatchEvent(new window.Event('scroll', { bubbles: true })); }); await wait(() => document.querySelector('.gym-gallery-controls [aria-live]').textContent === '5 / 5'); assert(button(messages.detail.nextPhoto).disabled); pass('gallery keyboard navigation and swipe position update active image and boundary controls');
		mobile = false; render(Page); await tick(); mobile = true; render(Page); await tick(); assert.equal(document.querySelector('.gym-gallery-controls [aria-live]').textContent, '1 / 5'); pass('gallery counter resets when a new mobile track mounts after viewport change');
		await loadGym(id(21)); assert(!document.querySelector('.gym-gallery-controls')); pass('zero real images has a fallback but no invented photo counter');
		await loadGym(id(7)); const mobilePrograms = document.querySelector('#gym-programs'), mobileTrainers = document.querySelector('#gym-trainers'); const initialTrainerCount = count('GetTrainers');
		click(button(messages.pagination.next, mobilePrograms)); await wait(() => last('GetPrograms').input.page === 2 && mobilePrograms.getAttribute('aria-busy') === 'false'); assert.equal(count('GetTrainers'), initialTrainerCount);
		click(button(messages.pagination.next, mobileTrainers)); await wait(() => last('GetTrainers').input.page === 2 && mobileTrainers.getAttribute('aria-busy') === 'false'); assert.equal(last('GetPrograms').input.page, 2); assert(mobilePrograms.textContent.includes('Page 2 of 3')); pass('compact mobile child paginations use real totals and remain independent');
		const beforeChange = requests.length; route(id(80)); assert(!document.querySelector('.gym-detail-identity')); assert(!document.querySelector('#gym-programs')); await tick(); assert.equal(requests.slice(beforeChange).filter((request) => request.name !== 'GetGym').length, 0);
		await loadGym(id(8)); await new Promise((resolve) => setTimeout(resolve, 220)); assert.equal(document.querySelector('h1').textContent, 'Gym 08'); assert.equal(last('GetPrograms').input.search.gymId, id(8)); assert.equal(last('GetPrograms').input.page, 1); assert.equal(last('GetTrainers').input.page, 1); pass('route change hides old content, waits for new Gym, resets both pages and rejects obsolete primary response');
		route(id(81)); await wait(primaryReady); await tick(); assert(document.querySelector('#gym-programs [role="status"]')); await loadGym(id(9)); await new Promise((resolve) => setTimeout(resolve, 220)); assert(document.querySelector('#gym-programs').textContent.includes('Program 09-0')); assert(!document.querySelector('#gym-programs').textContent.includes('Program 51-0')); assert(document.querySelector('#gym-trainers').textContent.includes('Trainer 09-0')); pass('obsolete Program and Trainer responses cannot mix results across Gym routes');
		const beforeMissing = count('GetPrograms') + count('GetTrainers'); route(id(90)); await wait(() => document.body.textContent.includes(messages.detail.unavailable)); assert(!document.body.textContent.includes('PRIVATE_')); assert.equal(count('GetPrograms') + count('GetTrainers'), beforeMissing); pass('backend not-found/inactive response is a neutral unavailable state without lifecycle leakage or child reads');
		route(id(93)); await wait(() => document.body.textContent.includes(messages.detail.unavailable)); assert.equal(count('GetPrograms') + count('GetTrainers'), beforeMissing); pass('actual flattened backend INTERNAL_SERVER_ERROR/Gym not found envelope becomes neutral unavailability');
		route(id(91)); await wait(() => document.body.textContent.includes(messages.detail.unavailable)); pass('null public Gym receipt is unavailable rather than fabricated');
		primaryFault = true; route(id(92)); await wait(() => document.querySelector('[role="alert"]')); assert(!document.body.textContent.includes('private network')); primaryFault = false; click(button(messages.retry)); await wait(settled); pass('primary network failure has localized Retry and only confirmed recovery mounts child queries');
		for (const locale of ['kr', 'ru']) { router.locale = locale; render(Page); await tick(); assert(document.body.textContent.includes(resources[locale].gyms.detail.programsIntro)); assert(document.body.textContent.includes(resources[locale].gyms.detail.trainersIntro)); assert(document.body.textContent.includes(resources[locale].gyms.weekdays.MON)); } router.locale = 'en'; pass('real KR/RU venue, hours and offering states resolve the Gym namespace');
		assert(!/FLAGSHIP|Acoustic Balance|Natural Materials|Air Purification|Valet|Private Showers|RFID|Finnish|Wi-Fi 6|Concierge|Our Team|Gym Staff|Resident|Programs Available|Book Gym|Reserve Gym|Open Now|membership|rating|review count|distance/i.test(document.body.textContent)); assert(!document.querySelector('.gym-gallery figcaption')); assert(!document.querySelector('.gym-detail-identity button')); pass('no removed feature copy, gallery captions, Gym booking/social controls or unsupported business fields');
		const TrainerCard = load('libs/components/common/TrainerCard.tsx', mocks).default; let likes = 0, follows = 0; render(TrainerCard, { trainer: trainer(id(1), 0), likeMemberHandler: async () => { likes++; }, followMemberHandler: async () => { follows++; }, followPending: false });
		assert(document.querySelector('.trainer-card-stats')); click(document.querySelector('.trainer-card-like')); click(document.querySelector('.trainer-card-follow')); assert.equal(likes, 1); assert.equal(follows, 1); pass('existing Trainer discovery defaults retain real stats and working supplied engagement handlers');
		const sass = require('sass');
		const detailCss = sass.compile(path.join(rootPath, 'scss/pc/gym/detail.scss'), { logger: sass.Logger.silent }).css;
		for (const text of ['max-width: 1023px', 'max-width: 767px', 'repeat(3, minmax(0, 1fr))', 'repeat(2, minmax(0, 1fr))', 'scroll-snap-type: x mandatory', 'scroll-margin-top:', 'min-height: 44px', 'overflow-wrap: anywhere', 'is-count-1', 'is-count-5']) {
			if (text === 'is-count-5') assert(detailCss.includes('.gym-gallery-grid')); else assert(detailCss.includes(text), text);
		} pass('detail SCSS compiles with editorial gallery variants, intentional tablet/mobile grids, wrapping, focus and scroll clearance');
		const trainerSource = fs.readFileSync(path.join(rootPath, 'scss/pc/trainer/trainer.scss'), 'utf8');
		const trainerCss = sass.compileString(trainerSource, { logger: sass.Logger.silent }).css;
		const previousSource = execFileSync('git', ['show', '32d51392cf03b455a3a2f29411f982c24869da2a:scss/pc/trainer/trainer.scss'], { cwd: rootPath, encoding: 'utf8' });
		const previousCss = sass.compileString(previousSource, { logger: sass.Logger.silent }).css;
		// Compare the final declaration cascade for every original Trainer selector/media combination.
		const postcss = require('postcss');
		const cascade = (css) => { const result = {}; postcss.parse(css).walkRules((rule) => {
			const media = []; let parent = rule.parent; while (parent?.type === 'atrule') { media.unshift(parent.name + ' ' + parent.params); parent = parent.parent; }
			for (const selector of rule.selector.split(',').map((value) => value.trim())) if (!selector.includes('gym-detail')) { const key = media.join('|') + '|' + selector; result[key] ??= {}; rule.nodes.filter((node) => node.type === 'decl').forEach((node) => { result[key][node.prop] = node.value; }); }
		}); return result; };
		assert.deepEqual(cascade(trainerCss), cascade(previousCss)); assert(trainerCss.includes('#pc-wrap.gym-detail-layout .trainer-discovery-card')); pass('shared Trainer card stylesheet preserves all original Trainer selector/media declarations without a style fork');
		const originalDetailCss = sass.compileString(execFileSync('git', ['show', 'c6dc028ceb179a47dbb15b87674b0074bd11dcd2:scss/pc/gym/detail.scss'], { cwd: rootPath, encoding: 'utf8' }), { logger: sass.Logger.silent }).css;
		const detailRules = (css) => {
			const rules = new Map();
			postcss.parse(css).walkRules(rule => {
				const media = []; for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule') media.unshift(parent.params);
				rules.set(media.join('|') + '|' + rule.selector, { selector: rule.selector, media, declarations: Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value])) });
			});
			return rules;
		};
		const originalRules = detailRules(originalDetailCss), currentRules = detailRules(detailCss);
		for (const [key, rule] of originalRules) assert.deepEqual(currentRules.get(key), rule, 'Existing Gym gallery/Program/layout rule changed: ' + key);
		const approvedDetailCss = sass.compileString(execFileSync('git', ['show', 'c622a2dca3dd1fd2347d86402808b438436b6404:scss/pc/gym/detail.scss'], { cwd: rootPath, encoding: 'utf8' }), { logger: sass.Logger.silent }).css;
		const approvedRules = detailRules(approvedDetailCss);
		for (const [key, rule] of approvedRules) assert.deepEqual(currentRules.get(key), rule, 'Approved G6I/Gym rule changed: ' + key);
		const programRules = [...currentRules].filter(([key]) => !approvedRules.has(key)).map(([, rule]) => rule);
		assert(programRules.length > 0);
		for (const rule of programRules) assert(rule.selector.startsWith('#pc-wrap.gym-detail-layout #gym-detail-page .gym-detail-programs '), 'G6J styles escaped Gym Detail Programs: ' + rule.selector);
		const compactRules = [...currentRules].filter(([key]) => !originalRules.has(key) && approvedRules.has(key)).map(([, rule]) => rule);
		assert(compactRules.length > 0);
		for (const rule of compactRules) assert(rule.selector.startsWith('#pc-wrap.gym-detail-layout #gym-detail-page .gym-detail-trainers '), 'Compact styles escaped Gym Detail trainers: ' + rule.selector);
		pass('G6I additions are confined to Gym Detail trainers; all original Gym/Program/gallery declarations remain identical');
		for (const width of [1440, 768, 390]) {
			const compact = (selector) => Object.assign({}, ...compactRules.filter(rule => rule.selector.endsWith(selector) && rule.media.every(query => [...query.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)].every(([, bound, value]) => bound === 'min' ? width >= Number(value) : width <= Number(value)))).map(rule => rule.declarations));
			const columns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
			const grid = compact(' .gym-child-grid');
			assert.equal(grid['grid-template-columns'], width < 768 ? 'minmax(0, 1fr)' : `repeat(${columns}, minmax(0, 260px))`);
			assert.equal(grid.gap, '20px');
			assert.equal(compact(' .trainer-card-photo')['aspect-ratio'], '3/2');
			assert.equal(compact(' .trainer-card-photo').position, 'relative');
			assert.equal(compact(' .trainer-card-photo img').position, 'absolute');
			assert.equal(compact(' .trainer-card-photo img').inset, '0');
			assert.equal(compact(' .trainer-card-photo img')['object-position'], 'center 30%');
			assert.equal(compact(' .trainer-card-body').padding, '16px');
			assert.equal(compact(' .trainer-card-body').gap, '12px');
			const container = Math.min(1232, width - (width < 768 ? 32 : 48));
			const cardWidth = width < 768 ? container : 260;
			assert(cardWidth * columns + 20 * (columns - 1) <= container, 'Trainer tracks overflow the content width');
			pass(`G6I ${width}px compiled cascade: ${cardWidth}px cards, 3:2 cropped portraits, comfortable spacing and no track overflow`);
		}
		const programCss = sass.compileString('$font: sans-serif; ' + fs.readFileSync(path.join(rootPath, 'scss/pc/program/program.scss'), 'utf8'), { logger: sass.Logger.silent }).css;
		assert(programCss.includes('#pc-wrap.gym-detail-layout .gym-detail-programs .discovery-program-card')); pass('existing Program card styles include detail context through the same shared selector group');
		for (const width of [1440, 768, 390]) {
			const scoped = (selector) => Object.assign({}, ...programRules.filter(rule => rule.selector.endsWith(selector) && rule.media.every(query => [...query.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)].every(([, bound, value]) => bound === 'min' ? width >= Number(value) : width <= Number(value)))).map(rule => rule.declarations));
			const columns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
			assert.equal(scoped(' .gym-child-grid')['grid-template-columns'], width < 768 ? 'minmax(0, 1fr)' : `repeat(${columns}, minmax(0, 340px))`);
			assert.equal(scoped(' .gym-child-grid')['align-items'], 'start');
			assert.equal(scoped(' .discovery-program-card').height, 'auto');
			assert.equal(scoped(' .discovery-card-media')['flex-shrink'], '0');
			assert.equal(scoped(' .discovery-card-media').overflow, 'hidden');
			assert.equal(scoped(' .discovery-card-image').position, 'absolute');
			assert.equal(scoped(' .discovery-card-image').inset, '0');
			assert.equal(scoped(' .discovery-card-body').flex, '0 1 auto');
			assert.equal(scoped(' .discovery-card-footer')['margin-top'], '0');
			const container = Math.min(1232, width - (width < 768 ? 32 : 48));
			assert((width < 768 ? container : 340) * columns + 24 * (columns - 1) <= container);
			pass(`G6J ${width}px compact Program tracks, contained media and natural body/footer flow without horizontal overflow`);
		}
		pass('G6J preserves every approved G6I trainer rule and confines all additions to Gym Detail Programs');
		const Venue = load('libs/components/program/ProgramGymVenue.tsx', mocks).default;
		const linked = { ...program(id(1), 0), gymId: id(1), gymData: gym(id(1)) };
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			render(Venue, { program: linked });
			assert.equal(document.querySelector('.detail-gym-venue a').getAttribute('href'), '/gym/detail?id=' + id(1));
			assert.equal(document.querySelector('.detail-gym-name').textContent, linked.gymData.gymName);
			assert.equal(document.querySelector('.detail-gym-label').textContent, resources[locale].gyms.venue.atGym);
			assert(document.querySelector('.detail-gym-action').textContent.includes(resources[locale].gyms.venue.viewGym));
			document.querySelector('.detail-gym-link').focus();
			assert.equal(document.activeElement, document.querySelector('.detail-gym-link'));
		}
		for (const change of [
			{ programType: 'ONLINE' }, { gymId: null }, { gymId: 'invalid' }, { gymData: null },
			{ gymData: { ...linked.gymData, _id: id(2) } }, { gymData: { ...linked.gymData, gymName: ' ' } },
		]) {
			render(Venue, { program: { ...linked, ...change } });
			assert.equal(document.querySelector('.detail-gym-venue'), null);
		}
		router.locale = 'en';
		pass('G5 authoritative venue links localize in EN/KR/RU; ONLINE/independent/missing/mismatched data render safely');
		const detailSource = ts.createSourceFile('detail.tsx', fs.readFileSync(path.join(rootPath, 'pages/program/detail.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		const venueUses = [];
		const visitVenue = (node) => {
			if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(detailSource) === 'ProgramGymVenue') venueUses.push(node);
			ts.forEachChild(node, visitVenue);
		};
		visitVenue(detailSource);
		assert.equal(venueUses.length, 1);
		let section = venueUses[0].parent;
		while (section && !(ts.isJsxElement(section) && section.openingElement.tagName.getText(detailSource) === 'section')) section = section.parent;
		assert(section?.openingElement.attributes.properties.some(attribute => attribute.name?.getText(detailSource) === 'aria-labelledby' && attribute.initializer?.text === 'detail-address-title'));
		pass('Program venue is rendered once inside the existing Physical address content section');
		const layoutMocks = { ...mocks,
			'../Top': { __esModule: true, default: () => React.createElement('header', { id: 'existing-public-header' }) },
			'../Footer': { __esModule: true, default: () => React.createElement('footer', { id: 'existing-public-footer' }) },
			'../../auth': { logOut: () => {} }, 'next/image': { __esModule: true, default: () => null },
			'../hooks/useDeviceDetect': { __esModule: true, default: () => mobile ? 'mobile' : 'desktop' },
			'../GlobalProgramSearch': { __esModule: true, default: () => null },
			'swiper/css': {}, 'swiper/css/pagination': {}, 'swiper/css/navigation': {},
		};
		const { ProgramsHeader, ProgramsBottomNavigation } = load('libs/components/program/ProgramsNavigation.tsx', layoutMocks);
		const destinations = ['/', '/program', '/gym', '/trainer', '/community?articleCategory=FREE', '/help'];
		mobile = false;
		render(ProgramsHeader);
		assert.deepEqual([...document.querySelectorAll('.programs-desktop-links a')].map(link => link.getAttribute('href')), destinations);
		assert.equal(document.querySelector('.programs-desktop-links a[href="/gym"]').getAttribute('aria-current'), 'page');
		store.userVar({ _id: id(500), memberNick: 'Owner' });
		await tick();
		assert(document.querySelector('.programs-desktop-links a[href="/mypage"]'));
		store.userVar({});
		mobile = true;
		render(ProgramsHeader);
		const menuButton = document.querySelector('#programs-navigation-button');
		menuButton.getBoundingClientRect = () => ({ top: 0, left: 0, right: 44, bottom: 44, width: 44, height: 44 });
		click(menuButton);
		await wait(() => document.querySelector('#programs-navigation-menu [role="menuitem"]'));
		assert.equal(menuButton.getAttribute('aria-expanded'), 'true');
		assert(document.querySelector('#programs-navigation-menu').contains(document.activeElement));
		const gymLink = document.querySelector('#programs-navigation-menu a[href="/gym"]');
		assert(gymLink);
		assert.equal(gymLink.getAttribute('aria-current'), 'page');
		gymLink.addEventListener('click', event => event.preventDefault(), { once: true });
		click(gymLink);
		await wait(() => !document.querySelector('#programs-navigation-menu'));
		render(ProgramsBottomNavigation);
		assert.deepEqual([...document.querySelectorAll('.programs-bottom-navigation a')].map(link => link.getAttribute('href')), ['/', '/program', '/trainer', '/community?articleCategory=FREE', '/mypage']);
		pass('G5 desktop/compact Gym destination works while mobile navigation retains exactly five original destinations');
		const Footer = load('libs/components/Footer.tsx', layoutMocks).default;
		for (const variant of ['default', 'programs', 'home']) {
			render(Footer, { variant });
			assert.equal(document.querySelectorAll('a[href="/gym"]').length, 1);
			assert.equal(document.querySelector('a[href="/gym"]').textContent, messages.navigation);
		}
		pass('G5 Gym footer link stays within each existing footer variant');
		// Static cascade checks at the requested widths; JSDOM does not establish layout geometry.
		const allCss = ['app.scss', 'pc/main.scss', 'mobile/main.scss'].map(file => sass.renderSync({
			file: path.join(rootPath, 'scss', file), logger: sass.Logger.silent,
			importer: url => url.startsWith('/scss/') ? { file: path.join(rootPath, url.slice(1)) } : null,
		}).css.toString()).join('\n');
		const parsedCss = postcss.parse(allCss);
		const cssAtWidth = (width) => {
			const active = postcss.root();
			parsedCss.walkRules(rule => {
				if (!/footer|detail-gym|program-detail-content/.test(rule.selector) && rule.selector !== 'a') return;
				for (let parent = rule.parent; parent; parent = parent.parent) {
					if (parent.type !== 'atrule' || parent.name !== 'media') continue;
					const matches = parent.params.split(',').some(query => !/print/.test(query) && [...query.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)].every(([, bound, value]) => bound === 'min' ? width >= Number(value) : width <= Number(value)));
					if (!matches) return;
				}
				active.append(rule.clone());
			});
			return active.toString();
		};
		const contrast = (foreground, background) => {
			const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
			const a = luminance(foreground), b = luminance(background);
			return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
		};
		const styles = document.createElement('style');
		document.head.appendChild(styles);
		const mount = document.getElementById('root');
		for (const width of [1440, 768, 390]) {
			styles.textContent = cssAtWidth(width);
			for (const wrapper of ['pc-wrap', 'mobile-wrap']) {
				const shell = document.createElement('div'), footerHost = document.createElement('div');
				shell.id = wrapper; footerHost.id = 'footer'; mount.before(shell); shell.appendChild(footerHost); footerHost.appendChild(mount);
				for (const locale of ['en', 'kr', 'ru']) {
					router.locale = locale; render(Footer);
					const computed = element => window.getComputedStyle(element);
					const columns = document.querySelector('.footer-container .right .bottom');
					assert.equal(computed(columns).display, 'grid');
					assert.equal(computed(columns).gridTemplateColumns, 'repeat(' + (wrapper === 'mobile-wrap' || width < 600 ? 2 : 3) + ', minmax(0, 1fr))');
					assert(parseFloat(computed(columns).gap) >= 20);
					assert.equal(computed(document.querySelector('.footer-container .main')).flexDirection, wrapper === 'mobile-wrap' || width < 1024 ? 'column' : 'row');
					assert.notEqual(computed(document.querySelector('.footer-container')).width, '1300px');
					for (const link of columns.querySelectorAll('a')) {
						const style = computed(link);
						assert.equal(style.whiteSpace, 'normal'); assert.equal(style.overflowWrap, 'anywhere');
						assert.equal(style.display, 'flex'); assert.equal(style.minHeight, '44px');
						assert(contrast(style.color, computed(footerHost).backgroundColor) >= 4.5);
					}
					assert.equal(columns.querySelectorAll('a[href="/gym"]').length, 1);
				}
				shell.before(mount); shell.remove();
			}
			const shell = document.createElement('div'); shell.id = 'pc-wrap';
			const content = document.createElement('div'); content.id = 'program-detail-page';
			content.innerHTML = '<div class="program-detail-content"><section class="detail-content-section"></section></div>';
			mount.before(shell); shell.appendChild(content); content.querySelector('section').appendChild(mount);
			render(Venue, { program: { ...linked, gymData: { ...linked.gymData, gymName: 'AerinMovementSeongsu'.repeat(12) } } });
			const venueLink = document.querySelector('.detail-gym-link');
			assert.equal(window.getComputedStyle(venueLink).flexWrap, 'wrap');
			assert.equal(window.getComputedStyle(venueLink).whiteSpace, 'normal');
			assert.equal(window.getComputedStyle(venueLink).minHeight, '44px');
			assert.equal(window.getComputedStyle(venueLink).textDecoration, 'underline');
			venueLink.focus();
			assert.equal(document.activeElement, venueLink);
			// Inspect compiled keyboard-focus rules directly; JSDOM has incomplete :focus-visible styling.
			let focusOutline;
			postcss.parse(cssAtWidth(width)).walkRules(rule => {
				if (rule.selectors.some(selector => selector.includes(':focus-visible') && venueLink.matches(selector.replace(/:focus-visible/g, '')))) {
					rule.walkDecls('outline', declaration => { focusOutline = declaration.value; });
				}
			});
			assert.equal(focusOutline, '3px solid #a53425');
			shell.before(mount); shell.remove();
			pass(width + 'px static footer/venue cascade: wrapping, column gaps, contrast and accessible link styling');
		}
		styles.remove(); router.locale = 'en';
		const withLayout = load('libs/components/layout/LayoutBasic.tsx', layoutMocks).default;
		render(withLayout(() => React.createElement('div', { id: 'public-detail-content' }))); await tick();
		assert(document.querySelector('#pc-wrap.gym-detail-layout.program-discovery-layout #public-detail-content')); assert(document.querySelector('#existing-public-header')); assert(document.querySelector('#existing-public-footer'));
		assert.equal(document.querySelectorAll('.programs-bottom-navigation a').length, 5); assert(!document.querySelector('.header-basic')); pass('guest detail uses existing public shell and actual five-item mobile navigation without a legacy banner');
		console.log(`${checks} G4D detail DOM/query/race/gallery/card/SCSS groups passed. No backend writes; live browser QA unavailable.`);
	} finally {
		if (root) root.unmount(); if (client) client.stop(); await new Promise((resolve) => setTimeout(resolve, 50)); dom.window.close();
		for (const key of keys) { if (previous[key]) Object.defineProperty(global, key, previous[key]); else delete global[key]; }
	}
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
