// Real Home section and Program cards with isolated Apollo responses; no API/database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const sass = require('sass');
const postcss = require('postcss');
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
function mediaRegression(section) {
	const compile = (file) => sass.renderSync({
		file: path.join(base, 'scss', file),
		importer: (url) => url.startsWith('/scss/') ? { file: path.join(base, url.slice(1)) } : null,
	}).css.toString();
	const css = ['app.scss', 'pc/main.scss', 'mobile/main.scss'].map(compile).join('\n');
	const parsed = postcss.parse(css), styles = document.createElement('style');
	const home = document.createElement('div'), list = document.createElement('main');
	home.className = 'home-page'; home.innerHTML = section.outerHTML;
	list.id = 'pc-wrap'; list.className = 'program-discovery-layout';
	list.innerHTML = '<div id="program-list-page">' + section.querySelector('article').outerHTML + '</div>';
	document.head.appendChild(styles); document.body.append(home, list);
	try {
		for (const width of [1440, 768, 390]) {
			const active = postcss.root();
			parsed.walkRules((rule) => {
				if (!/discovery-program-card|home-discover-grid/.test(rule.selector)) return;
				for (let parent = rule.parent; parent; parent = parent.parent) {
					if (parent.type === 'atrule' && parent.name === 'media' && !parent.params.split(',').some((query) =>
						!/print/.test(query) && [...query.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)].every(([, bound, value]) => bound === 'min' ? width >= Number(value) : width <= Number(value)))) return;
				}
				active.append(rule.clone());
			});
			styles.textContent = active.toString();
			const media = home.querySelector('.discovery-card-media'), link = media.querySelector('a');
			assert.equal(window.getComputedStyle(media).overflow, 'hidden');
			assert.equal(window.getComputedStyle(media).flexShrink, '0');
			assert.equal(window.getComputedStyle(link).position, 'absolute');
			assert.equal(window.getComputedStyle(link).width, '100%');
			assert.equal(window.getComputedStyle(link).height, '100%');
			assert.equal(window.getComputedStyle(link.querySelector('img')).objectFit, 'cover');
			const listMedia = list.querySelector('.discovery-card-media');
			assert.equal(window.getComputedStyle(listMedia).overflow, 'hidden');
			assert.equal(window.getComputedStyle(listMedia).flexShrink, '0');
			assert.equal(window.getComputedStyle(listMedia.querySelector('a')).position, 'absolute');
			assert.equal(window.getComputedStyle(list.querySelector('.discovery-program-card')).height, 'auto');
			assert.equal(window.getComputedStyle(list.querySelector('.discovery-card-body')).flexGrow, '0');
			assert.equal(window.getComputedStyle(list.querySelector('.discovery-card-footer')).marginTop, '0px');
			pass(width + 'px compiled Home and list media containment; list card/body use natural height and footer spacing');
		}
	} finally { styles.remove(); home.remove(); list.remove(); }
	if (process.argv.includes('--browser')) {
		browserMedia(css, section);
		browserList(css, section);
	}
}
function browserList(css, section) {
	const browser = process.env.GYMFLOW_QA_BROWSER;
	assert(browser && fs.existsSync(browser), '--browser requires GYMFLOW_QA_BROWSER pointing to Chromium/Edge');
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-list-cards-'));
	try {
		const names = ['First row short title', 'First row online program', 'First row with a longer title that wraps', 'Small Group Pilates Practice', 'Personal Strength Coaching', 'Evening Mobility Online', 'Mobility and Movement Practice', 'Small Group Strength Circuit', 'Controlled Movement Pilates'];
		const images = ['strength-dumbbells.webp', 'pilates-studio.webp'].map((name) => 'data:image/webp;base64,' + fs.readFileSync(path.join(base, 'public/img/fiber', name)).toString('base64'));
		const cards = names.map((name, index) => {
			const card = section.querySelector('article').cloneNode(true);
			card.querySelector('h3 a').textContent = name;
			card.querySelector('.discovery-location span').textContent = index === 3 ? 'A deliberately long studio address with extra location details '.repeat(5) : 'Seoul · Studio';
			const image = card.querySelector('.discovery-card-image img');
			image.src = images[[3, 6, 8].includes(index) ? 1 : 0]; image.removeAttribute('loading');
			return card.outerHTML;
		}).join('');
		const mui = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)).join('\n');
		const wrap = (content) => '<!doctype html><html><head><meta charset="utf-8"><style>html{box-sizing:border-box}*,::before,::after{box-sizing:inherit}body{margin:0}' + css + mui + '</style></head><body>' + content + '</body></html>';
		const list = wrap('<main id="pc-wrap" class="program-discovery-layout"><div id="program-list-page"><div class="container"><div class="program-page"><aside class="filter-config"></aside><div class="main-config"><div class="discovery-results"><div class="list-config">' + cards + '</div></div></div></div></div></div></main>');
		// Compare actual compiled styles with this route's overrides removed on every shared-card consumer.
		const withoutList = postcss.parse(css);
		withoutList.walkRules((rule) => { if (rule.selector.split(',').every((selector) => selector.trim().startsWith('#pc-wrap.program-discovery-layout #program-list-page .discovery-program-card'))) rule.remove(); });
		const consumers = [
			['<main id="pc-wrap"><div class="home-page"><section class="home-discover-programs"><div class="home-discover-grid">', '</div></section></div></main>'],
			['<main id="pc-wrap" class="gym-detail-layout"><div id="gym-detail-page"><section class="gym-detail-programs"><div class="gym-child-grid">', '</div></section></div></main>'],
			['<main id="pc-wrap" class="trainer-detail-layout"><div class="trainer-detail-page"><div class="container"><section class="trainer-detail-programs"><div class="trainer-detail-program-grid">', '</div></section></div></div></main>'],
			['<main id="pc-wrap" class="program-detail-layout"><section id="program-detail-page"><div class="detail-related-programs">', '</div></section></main>'],
		];
		const variants = [list, ...consumers.flatMap(([prefix, suffix]) => {
			const html = wrap(prefix + cards + suffix);
			return [html, html.replace(css, withoutList.toString())];
		})];
		const measure = () => [...document.querySelectorAll('iframe')].map((frame) => {
			const doc = frame.contentDocument, win = frame.contentWindow, rect = (element) => element.getBoundingClientRect();
			const properties = ['display', 'position', 'width', 'height', 'flex', 'aspectRatio', 'marginTop', 'padding', 'gap', 'overflow', 'objectFit'];
			return { variant: Number(frame.dataset.variant), width: win.innerWidth, clientWidth: doc.documentElement.clientWidth, scrollWidth: doc.documentElement.scrollWidth,
				cards: [...doc.querySelectorAll('article')].map((card) => {
					const media = card.querySelector('.discovery-card-media'), image = media.querySelector('img'), link = media.querySelector('a'), body = card.querySelector('.discovery-card-body'), footer = card.querySelector('.discovery-card-footer'), metadata = card.querySelector('.discovery-session-details');
					link.focus({ preventScroll: true });
					return { x: rect(card).x, y: rect(card).y, height: rect(card).height, mediaWidth: rect(media).width, mediaHeight: rect(media).height, imageHeight: rect(image).height, natural: [image.naturalWidth, image.naturalHeight], fit: win.getComputedStyle(image).objectFit,
						gap: rect(footer).top - rect(metadata).bottom, bodyGrow: win.getComputedStyle(body).flexGrow, footerMargin: win.getComputedStyle(footer).marginTop,
						fits: card.scrollWidth <= card.clientWidth + 1 && rect(footer).bottom <= rect(card).bottom && rect(body).top >= rect(media).bottom - 1,
						focusable: doc.activeElement === link && win.getComputedStyle(link).outlineStyle !== 'none',
						styles: [card, media, link, image, body, footer].map((element) => Object.fromEntries(properties.map((key) => [key, win.getComputedStyle(element)[key]]))) };
				}) };
		});
		const file = path.join(temporary, 'cards.html');
		fs.writeFileSync(file, '<!doctype html><html><body>' + variants.flatMap((_, index) => [1440, 768, 390].map((width) => '<iframe data-variant="' + index + '" style="border:0;width:' + width + 'px;height:6000px"></iframe>')).join('') + '<pre id="result"></pre><script>const variants=' + JSON.stringify(variants).replace(/</g, '\\u003c') + ';document.querySelectorAll("iframe").forEach(frame=>frame.srcdoc=variants[Number(frame.dataset.variant)]);window.onload=()=>{document.getElementById("result").textContent=JSON.stringify((' + measure.toString() + ')());document.querySelectorAll("iframe,script").forEach(element=>element.remove());};</script></body></html>');
		const result = spawnSync(browser, ['--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + path.join(temporary, 'profile'), '--virtual-time-budget=2000', '--dump-dom', require('node:url').pathToFileURL(file).href], { encoding: 'utf8', timeout: 45000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
		assert.equal(result.status, 0, result.error?.message);
		const match = result.stdout.match(/<pre id="result">([^<]+)<\/pre>/); assert(match, 'List browser geometry results missing');
		const rows = JSON.parse(match[1]); assert.equal(rows.length, 27);
		for (const row of rows.filter((row) => row.variant === 0)) {
			assert(row.scrollWidth <= row.clientWidth + 1); assert.equal(row.cards.length, 9);
			const columns = row.width === 1440 ? 3 : row.width === 768 ? 2 : 1;
			assert.equal(new Set(row.cards.map((card) => Math.round(card.x))).size, columns);
			for (const card of row.cards) {
				assert(Math.abs(card.mediaWidth / card.mediaHeight - (row.width < 768 ? 16 / 9 : 16 / 10)) < 0.01);
				assert(Math.abs(card.imageHeight - card.mediaHeight) < 1); assert.equal(card.fit, 'cover');
				assert(card.natural[0] > 0 && card.natural[1] > 0); assert(card.fits && card.focusable);
				assert.equal(card.bodyGrow, '0'); assert.equal(card.footerMargin, '0px'); assert(Math.abs(card.gap - 12) < 1, 'Footer follows metadata naturally');
			}
			assert(row.cards[3].height > row.cards[4].height + 50, 'Long content grows its own card');
			if (columns > 1) assert(Math.abs(row.cards[3].y - row.cards[columns === 3 ? 4 : 2].y) < 1 && row.cards[3].height > row.cards[columns === 3 ? 4 : 2].height + 50, 'A taller grid peer must not stretch its neighbor');
			assert(Math.max(...row.cards.map((card) => card.mediaHeight)) - Math.min(...row.cards.map((card) => card.mediaHeight)) < 1);
			pass(row.width + 'px list: nine real cards, 3/2/1 columns, mixed portrait/landscape crops, natural peer heights, 12px footer gap and focus');
		}
		for (let variant = 1; variant < variants.length; variant += 2) for (const width of [1440, 768, 390]) {
			const current = rows.find((row) => row.variant === variant && row.width === width), previous = rows.find((row) => row.variant === variant + 1 && row.width === width);
			assert.deepEqual(current.cards, previous.cards, 'List overrides cannot change another card consumer');
		}
		pass('Home, Gym Detail/G6J, Trainer Detail and Program Detail compiled geometry/styles unchanged at all three widths');
	} finally {
		assert.equal(path.dirname(temporary), os.tmpdir()); assert(path.basename(temporary).startsWith('gymflow-list-cards-'));
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
function browserMedia(css, section) {
	const browser = process.env.GYMFLOW_QA_BROWSER;
	assert(browser && fs.existsSync(browser), '--browser requires GYMFLOW_QA_BROWSER pointing to Chromium/Edge');
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-home-media-'));
	try {
		const sample = section.cloneNode(true);
		const images = ['strength-dumbbells.webp', 'pilates-studio.webp'].map((name) =>
			'data:image/webp;base64,' + fs.readFileSync(path.join(base, 'public/img/fiber', name)).toString('base64'));
		[...sample.querySelectorAll('.discovery-card-image img')].forEach((image, index) => {
			image.src = images[index % 2]; image.removeAttribute('loading');
		});
		const markup = '<!doctype html><html><head><meta charset="utf-8"><style>html{box-sizing:border-box}*,::before,::after{box-sizing:inherit}body{margin:0}' + css + '</style></head><body><main id="pc-wrap"><div class="home-page">' + sample.outerHTML + '</div></main></body></html>';
		const measure = () => [...document.querySelectorAll('iframe')].map((frame) => {
			const win = frame.contentWindow, doc = frame.contentDocument, rect = (element) => element.getBoundingClientRect();
			return { width: win.innerWidth, scrollWidth: doc.documentElement.scrollWidth, cards: [...doc.querySelectorAll('article')].map((card) => {
				const media = card.querySelector('.discovery-card-media'), image = media.querySelector('img'), link = media.querySelector('a');
				const body = card.querySelector('.discovery-card-body'), footer = card.querySelector('.discovery-card-footer');
				const price = card.querySelector('.discovery-price'), favorite = card.querySelector('.discovery-like-button');
				link.focus();
				return { x: rect(card).x, width: rect(media).width, height: rect(media).height, imageHeight: rect(image).height,
					natural: [image.naturalWidth, image.naturalHeight], fit: win.getComputedStyle(image).objectFit,
					linkFillsFrame: Math.abs(rect(link).x - rect(media).x) < 1 && Math.abs(rect(link).y - rect(media).y) < 1 && Math.abs(rect(link).width - rect(media).width) < 1 && Math.abs(rect(link).height - rect(media).height) < 1,
					bodyVisible: rect(body).top >= rect(media).bottom - 1 && rect(footer).bottom <= rect(card).bottom + 1 && rect(price).left >= rect(card).left && rect(price).right <= rect(card).right,
					contentFits: card.scrollWidth <= card.clientWidth + 1,
					favoriteReachable: doc.elementFromPoint(rect(favorite).x + rect(favorite).width / 2, rect(favorite).y + rect(favorite).height / 2)?.closest('.discovery-like-button') === favorite,
					focusable: doc.activeElement === link, focusOutline: win.getComputedStyle(link).outlineStyle };
			}) };
		});
		const file = path.join(temporary, 'media.html');
		fs.writeFileSync(file, '<!doctype html><html><body>' + [1440, 768, 390].map((width) => '<iframe style="border:0;width:' + width + 'px;height:3000px"></iframe>').join('') + '<pre id="result"></pre><script>const markup=' + JSON.stringify(markup).replace(/</g, '\\u003c') + ';document.querySelectorAll("iframe").forEach(frame=>frame.srcdoc=markup);window.onload=()=>document.getElementById("result").textContent=JSON.stringify((' + measure.toString() + ')());</script></body></html>');
		const result = spawnSync(browser, ['--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + path.join(temporary, 'profile'), '--virtual-time-budget=2000', '--dump-dom', require('node:url').pathToFileURL(file).href], { encoding: 'utf8', timeout: 45000, maxBuffer: 20 * 1024 * 1024, windowsHide: true });
		assert.equal(result.status, 0, result.error?.message);
		const match = result.stdout.match(/<pre id="result">([^<]+)<\/pre>/); assert(match, 'Browser geometry results missing');
		for (const row of JSON.parse(match[1])) {
			assert(row.scrollWidth <= row.width + 1, 'Horizontal overflow at ' + row.width);
			assert.equal(row.cards.length, 4);
			assert.equal(new Set(row.cards.map((card) => Math.round(card.x))).size, row.width === 1440 ? 4 : row.width === 768 ? 2 : 1);
			assert(Math.max(...row.cards.map((card) => card.height)) - Math.min(...row.cards.map((card) => card.height)) < 1);
			for (const card of row.cards) {
				assert(card.natural[0] > 0 && card.natural[1] > 0);
				assert(Math.abs(card.width / card.height - (row.width < 768 ? 16 / 9 : 16 / 10)) < 0.01);
				assert(Math.abs(card.imageHeight - card.height) < 1);
				assert.equal(card.fit, 'cover'); assert(card.linkFillsFrame && card.bodyVisible && card.contentFits && card.favoriteReachable && card.focusable); assert.notEqual(card.focusOutline, 'none');
			}
			assert(row.cards.some((card) => card.natural[0] > card.natural[1]) && row.cards.some((card) => card.natural[0] < card.natural[1]));
			pass(row.width + 'px browser: 4/2/1 columns, equal landscape/portrait crop, no overflow, visible footer and keyboard focus');
			console.log(JSON.stringify(row));
		}
	} finally {
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true });
	}
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
	link.displayName = 'HomepageTestLink';
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
		loaded(fixtures.slice(0, 4).map((program) => ({ ...program,
			programName: '긴프로그램이름 ДлинноеНазвание '.repeat(4), programAddress: '서울특별시 ДлинныйАдрес '.repeat(8),
		}))); await render();
		mediaRegression(document.querySelector('.home-discover-programs'));
		console.log(checks + ' homepage Programs checks passed.');
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
	}
}
const watchdog = setTimeout(() => { console.error('Homepage Programs tests did not settle'); process.exit(1); }, 90000);
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
