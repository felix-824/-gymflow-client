// Real Home section and Program cards with isolated Apollo responses; no API/database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const base = path.resolve(__dirname, '..');
let checks = 0;
const pass = (name) => { checks++; console.log('PASS ' + name); };
function loadTs(file, mocks, cache = new Map()) {
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
		if (name.endsWith('.css')) return {};
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
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
	for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'DocumentFragment']) global[key] = dom.window[key];
	Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
	global.IS_REACT_ACT_ENVIRONMENT = true;
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { act, Simulate } = require('react-dom/test-utils');
	const { NetworkStatus } = require('@apollo/client');
	const root = createRoot(document.getElementById('root'));
	const i18n = require('i18next').createInstance();
	await i18n.init({
		resources: Object.fromEntries(['en', 'kr', 'ru'].map((locale) => [locale, {
			common: JSON.parse(fs.readFileSync(path.join(base, 'public/locales', locale, 'common.json'), 'utf8')),
		}])),
		lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false,
	});
	let locale = 'en', mobile = false, user = { _id: '' }, queryOptions;
	let queryState = {}, refetchAction = async () => ({});
	const refetches = [], mutations = [], alerts = [];
	const refetch = async (input) => { refetches.push(input); return refetchAction(); };
	const link = React.forwardRef(({ href, children, passHref, ...props }, ref) => React.createElement('a', {
		...props, ref, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
	}, children));
	const mocks = {
		'next/link': { __esModule: true, default: link },
		'next-i18next': { useTranslation: () => ({ t: i18n.getFixedT(locale), i18n }) },
		'@apollo/client': {
			NetworkStatus,
			gql: require('@apollo/client').gql,
			useReactiveVar: (variable) => variable(),
			useQuery: (_, options) => { queryOptions = options; return { ...queryState, refetch }; },
			useMutation: () => [async (input) => { mutations.push(input); return {}; }],
		},
		'../../../apollo/store': { userVar: () => user },
		'./sweetAlert': { sweetMixinErrorAlert: async () => undefined },
		'../../hooks/useDeviceDetect': { __esModule: true, default: () => mobile ? 'mobile' : 'desktop' },
		'../../sweetAlert': {
			sweetMixinErrorAlert: async (message) => { alerts.push({ error: message }); },
			sweetTopSmallSuccessAlert: async () => { alerts.push({ success: true }); },
		},
	};
	const Discover = loadTs('libs/components/homepage/TrendPrograms.tsx', mocks).default;
	const fixtures = Array.from({ length: 5 }, (_, index) => ({
		_id: (index + 1).toString(16).padStart(24, '0'),
		programName: 'Program test fixture ' + (index + 1),
		programType: index === 1 ? 'ONLINE' : 'GROUP_CLASS',
		programCategory: ['MUSCLE_GAIN', 'YOGA', 'PILATES', 'CARDIO', 'REHAB'][index],
		programStatus: 'ACTIVE', programLocation: index === 1 ? 'ONLINE' : 'SEOUL',
		programAddress: index === 1 ? undefined : 'Test studio address',
		programPrice: index * 25000, programDuration: 60, programCapacity: 8,
		programImages: ['uploads/program/test-fixture-' + index + '.jpg'],
		programViews: 12, programLikes: 3, programRank: 0, meLiked: [],
		memberData: { _id: 'trainer', memberFullName: 'Test Trainer', memberNick: 'trainer', memberImage: '' },
	}));
	const loaded = (list) => { queryState = { loading: false, networkStatus: NetworkStatus.ready, data: { getPrograms: { list, metaCounter: [{ total: list.length }] } } }; };
	const render = async () => { await act(async () => { root.render(React.createElement(Discover)); }); };
	const click = async (element) => { assert(element); await act(async () => { element.click(); }); };
	const cards = () => [...document.querySelectorAll('.home-discover-grid > article')];
	try {
		assert.equal(Discover.defaultProps.initialInput.limit, 4);
		for (locale of ['en', 'kr', 'ru']) {
			const t = i18n.getFixedT(locale);
			for (mobile of [false, true]) {
				for (const count of [1, 2, 3, 4]) {
					loaded(fixtures.slice(0, count));
					await render();
					assert.equal(queryOptions.variables.input.limit, 4);
					assert.equal(queryOptions.variables.input.sort, 'programLikes');
					assert.equal(queryOptions.variables.input.direction, 'DESC');
					assert.deepEqual(queryOptions.variables.input.search, {});
					assert.equal(queryOptions.fetchPolicy, 'cache-and-network');
					assert.equal(cards().length, count);
					assert(!document.querySelector('.swiper, .home-discover-navigation, .home-discover-slide'));
					assert.equal(document.querySelector('.home-discover-view-all').getAttribute('href'), '/program');
					assert.equal(document.querySelector('.home-discover-view-all').textContent, t('Home discover.View all'));
					const renderedIds = cards().map((card, index) => {
						const program = fixtures[index];
						const href = new URL(card.querySelector('.discovery-card-title a').href);
						assert.equal(href.pathname, '/program/detail');
						assert.equal(card.querySelector('.discovery-card-title').textContent, program.programName);
						assert.equal(card.querySelector('.discovery-category').textContent, t('Program discovery card.' + program.programCategory));
						assert.equal(card.querySelector('.discovery-type').textContent, t('Program discovery card.' + program.programType));
						assert.equal(card.querySelector('.discovery-trainer').textContent, 'TTTest Trainer');
						assert(card.querySelector('.discovery-location').textContent.includes(t(program.programLocation)));
						assert(card.querySelector('.discovery-session-details').textContent.includes(t('Session duration', { duration: 60 })));
						assert(card.querySelector('.discovery-session-details').textContent.includes(t('Session capacity', { capacity: 8 })));
						assert(card.querySelector('.discovery-card-image img').src.endsWith('/' + program.programImages[0]));
						assert.equal(card.querySelector('.discovery-like-button').getAttribute('aria-pressed'), 'false');
						return href.searchParams.get('id');
					});
					assert.deepEqual(renderedIds, fixtures.slice(0, count).map((item) => item._id));
					assert.equal(new Set(renderedIds).size, count);
					assert(cards()[0].querySelector('.discovery-price strong').textContent.includes('0'));
					pass(locale + (mobile ? ' mobile ' : ' desktop ') + count + ' real response items, unique cards, localized metadata and exact links');
				}
				loaded(fixtures);
				await render();
				assert.equal(cards().length, 4);
				assert(!document.body.textContent.includes(fixtures[4].programName));
				loaded([]);
				await render();
				assert.equal(cards().length, 0);
				assert(document.querySelector('[role="status"]').textContent.includes(t('Home discover.Empty title')));
				assert(!document.querySelector('.home-discover-grid, .swiper, .MuiSkeleton-root'));
				pass(locale + (mobile ? ' mobile' : ' desktop') + ' maximum-four presentation and localized completed empty state');
			}
		}
		locale = 'en'; mobile = false;
		queryState = { loading: true, networkStatus: NetworkStatus.loading };
		await render();
		assert(document.querySelector('[role="status"]').textContent.includes(i18n.getFixedT('en')('Home discover.Loading')));
		assert.equal(cards().length, 0);
		queryState = { loading: false, networkStatus: NetworkStatus.error, error: new Error('Isolated test error') };
		await render();
		assert(document.querySelector('[role="alert"]'));
		refetchAction = async () => { throw new Error('Isolated retry failure'); };
		await click(document.querySelector('[role="alert"] button'));
		assert.equal(refetches.at(-1).input.limit, 4);
		assert(document.querySelector('[role="alert"] button'));
		refetchAction = async () => ({});
		queryState = { loading: true, networkStatus: NetworkStatus.refetch, previousData: { getPrograms: { list: fixtures.slice(0, 2) } } };
		await render();
		assert.equal(cards().length, 2);
		assert(!document.querySelector('[role="alert"], [role="status"]'));
		pass('initial loading, actionable failed Retry and previous real data during refetch remain intact');
		loaded([{ ...fixtures[0], programImages: ['uploads/program/camera-test-fixture.jpg'] }]);
		await render();
		assert(cards()[0].querySelector('.discovery-card-image img').src.endsWith('/uploads/program/camera-test-fixture.jpg'));
		await act(async () => { Simulate.error(cards()[0].querySelector('.discovery-card-image img')); });
		assert(cards()[0].querySelector('.discovery-image-fallback'));
		assert(!cards()[0].querySelector('.discovery-card-image img'));
		loaded([{ ...fixtures[0], programImages: ['uploads/program/replacement-test-fixture.jpg'] }]);
		await render();
		assert(cards()[0].querySelector('.discovery-card-image img').src.endsWith('/uploads/program/replacement-test-fixture.jpg'));
		loaded([{ ...fixtures[0], programImages: [] }]);
		await render();
		assert(cards()[0].querySelector('.discovery-image-fallback'));
		pass('stored image paths are preserved; missing/broken images use the existing neutral fallback and URL changes recover');
		loaded(fixtures.slice(0, 1));
		await render();
		await click(cards()[0].querySelector('.discovery-like-button'));
		assert.equal(mutations.length, 0);
		assert(alerts.some((item) => item.error));
		user = { _id: 'isolated-member' };
		await render();
		refetchAction = async () => {
			loaded([{ ...fixtures[0], programLikes: 4, meLiked: [{ myFavorite: true }] }]);
			return {};
		};
		await click(cards()[0].querySelector('.discovery-like-button'));
		assert.deepEqual(mutations.at(-1), { variables: { input: fixtures[0]._id } });
		assert.deepEqual(refetches.at(-1), { input: Discover.defaultProps.initialInput });
		await render();
		assert.equal(cards()[0].querySelector('.discovery-like-button').getAttribute('aria-pressed'), 'true');
		assert.equal(cards()[0].querySelector('.discovery-likes').textContent, '4');
		assert(alerts.some((item) => item.success));
		pass('guest guard and authenticated Like keep the mutation, same-inquiry refetch and updated favorite state');
		console.log(checks + ' homepage Programs checks passed.');
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
	}
}
const watchdog = setTimeout(() => { console.error('Homepage Programs tests did not settle'); process.exit(1); }, 90000);
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
