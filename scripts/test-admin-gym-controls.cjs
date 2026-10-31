// Controlled React/MUI DOM tests; upload transport is intercepted. No Gym create/update calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const project = path.resolve(__dirname, '..');
function load(file, mocks = {}, cache = new Map()) {
	file = path.resolve(project, file);
	if (cache.has(file)) return cache.get(file);
	const module = { exports: {} }; cache.set(file, module.exports);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
		module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.React, esModuleInterop: true,
	} }).outputText;
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (!name.startsWith('.')) return require(name);
		const target = path.resolve(path.dirname(file), name);
		if (target.endsWith('.json')) return JSON.parse(fs.readFileSync(target, 'utf8'));
		return load(fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}

module.exports = async function gymControlTests() {
	let checks = 0;
	const pass = (name) => { checks++; console.log('PASS G3D ' + name); };
	const helper = load('libs/admin-gyms.ts');
	const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
	const closedWeek = () => weekdays.map((dayOfWeek) => ({ dayOfWeek, isClosed: true, openTime: null, closeTime: null }));
	const openDay = { dayOfWeek: 'MON', isClosed: false, openTime: '08:30', closeTime: '21:00' };
	for (const [patch, expected] of [
		[{ openTime: '' }, 'hours.requiredTimes'], [{ closeTime: null }, 'hours.requiredTimes'],
		[{ openTime: '8:30' }, 'hours.timeFormat'], [{ closeTime: '24:00' }, 'hours.timeFormat'],
		[{ openTime: ' 08:30' }, 'hours.timeFormat'], [{ openTime: '08:30:00' }, 'hours.timeFormat'],
		[{ closeTime: '08:30' }, 'hours.timeOrder'], [{ closeTime: '08:00' }, 'hours.timeOrder'],
		[{}, null], [{ isClosed: true, openTime: 'bad' }, null],
	]) assert.equal(helper.gymOpeningHoursDayError({ ...openDay, ...patch }), expected);
	pass('shared day validator: missing, strict HH:mm, 24:00, equal/overnight, valid and closed');
	const blank = helper.createGymOpeningHoursForm(null);
	assert.deepEqual(blank.map((day) => day.dayOfWeek), weekdays); assert.equal(new Set(blank.map((day) => day.dayOfWeek)).size, 7);
	assert(blank.every((day) => !day.isClosed && day.openTime === '' && day.closeTime === ''));
	assert.throws(() => helper.normalizeGymOpeningHours(blank), /hours.requiredTimes/);
	assert.equal(helper.normalizeGymOpeningHours(null), null); assert.deepEqual(helper.normalizeGymOpeningHours(closedWeek().reverse()), closedWeek());
	assert.throws(() => helper.normalizeGymOpeningHours(closedWeek().slice(1)), /hours.sevenDays/);
	assert.throws(() => helper.normalizeGymOpeningHours([...closedWeek().slice(1), closedWeek()[1]]), /hours.sevenDays/);
	pass('null distinct from closed week; seven unique blank days; incomplete/duplicate drafts cannot serialize');
	const { JSDOM } = require('jsdom');
	const globals = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'Image', 'FormData', 'File', 'Blob'];
	const previous = Object.fromEntries(globals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
	const dom = new JSDOM('<main id="pc-wrap" class="admin"><div id="root"></div></main>', { url: 'http://localhost/_admin/gyms' });
	let root;
	try {
		for (const key of globals) Object.defineProperty(global, key, { configurable: true, writable: true, value: dom.window[key] });
		const React = require('react');
		const { flushSync } = require('react-dom');
		const { createRoot } = require('react-dom/client');
		const { makeVar } = require('@apollo/client');
		const { ThemeProvider, createTheme } = require('@mui/material/styles');
		const { light } = load('scss/MaterialTheme/index.ts');
		const theme = createTheme(light);
		const store = { userVar: makeVar({ _id: 'admin1', memberType: 'ADMIN', memberStatus: 'ACTIVE' }), authReadyVar: makeVar(true), authErrorVar: makeVar('') };
		const events = new (require('node:events').EventEmitter)();
		const router = { asPath: '/_admin/gyms', locale: 'en', events };
		let session = 'session1', invalidations = 0, tokenMode = '', resolveToken;
		const tokenCalls = [], requests = [], busy = [], changes = [], callbackVersions = [];
		let callbackVersion = 1;
		const i18n = require('i18next').createInstance();
		const resources = Object.fromEntries(['en', 'kr', 'ru'].map((lng) => [lng, { 'admin-gyms': JSON.parse(fs.readFileSync(path.join(project, 'public/locales', lng, 'admin-gyms.json'), 'utf8')) }]));
		await i18n.init({ resources, lng: 'en', initImmediate: false, fallbackLng: false });
		const text = resources.en['admin-gyms'];
		const config = load('libs/config.ts');
		const mocks = {
			'next/router': { useRouter: () => router },
			'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(router.locale, ns) }) },
			'../../../../apollo/store': store,
			'../../../auth': {
				getAuthSessionId: () => session,
				ensureAccessToken: async (required) => { tokenCalls.push(required); if (tokenMode === 'hold') return new Promise((resolve) => { resolveToken = resolve; }); if (tokenMode === 'fail') throw { response: { status: 401 } }; return 'fresh-access-token'; },
				isAuthenticationError: (error) => error?.response?.status === 401 || error?.graphQLErrors?.some((item) => item.extensions?.code === 'UNAUTHENTICATED'),
				invalidateSession: async () => { invalidations++; },
			},
			axios: { __esModule: true, default: { post: (url, form, options) => new Promise((resolve, reject) => requests.push({ url, form, options, resolve, reject })) } },
		};
		const Photos = load('libs/components/admin/gyms/GymImages.tsx', mocks).default;
		const Hours = load('libs/components/admin/gyms/GymOpeningHours.tsx', mocks).default;
		root = createRoot(document.getElementById('root'));
		const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
		const wait = async (predicate) => { for (let n = 0; n < 80; n++) { if (predicate()) return; await tick(); } assert.fail('DOM/upload state timed out'); };
		const click = (node) => { assert(node); flushSync(() => node.click()); };
		const byLabel = (label) => Array.from(document.querySelectorAll('[aria-label]')).find((node) => node.getAttribute('aria-label') === label);
		const picture = (index) => `uploads/gym/123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}.jpg`;
		const paths = Array.from({ length: 6 }, (_, index) => picture(index + 1));
		let photoValue = [], hoursValue = null, setPhotos, setHours, photoProps = {}, hoursProps = {}, key = 0;
		const PhotoHarness = () => {
			const [images, setImages] = React.useState(photoValue); setPhotos = setImages; photoValue = images;
			const version = callbackVersion;
			return React.createElement(Photos, { images, scopeKey: 'draft1', ...photoProps, onChange: (next) => { callbackVersions.push(version); changes.push(next); setImages(next); }, onUploadingChange: (value) => busy.push(value) });
		};
		const HoursHarness = () => {
			const [value, setValue] = React.useState(hoursValue); setHours = setValue; hoursValue = value;
			return React.createElement(Hours, { value, ...hoursProps, onChange: setValue });
		};
		let active = PhotoHarness;
		const render = () => flushSync(() => root.render(React.createElement(ThemeProvider, { theme }, React.createElement(active, { key }))));
		const photos = (images, props = {}) => { photoValue = images; photoProps = props; active = PhotoHarness; key++; render(); };
		const hours = (value, props = {}) => { hoursValue = value; hoursProps = props; active = HoursHarness; key++; render(); };
		const file = (name = 'photo.jpg', type = 'image/jpeg', size) => { const result = new File(['fixture'], name, { type }); if (size) Object.defineProperty(result, 'size', { value: size }); return result; };
		const choose = (files) => { const input = document.querySelector('input[type="file"]'); assert(input); Object.defineProperty(input, 'files', { value: files, configurable: true }); flushSync(() => input.dispatchEvent(new window.Event('change', { bubbles: true }))); };
		const start = async (files = [file()]) => { const before = requests.length; choose(files); await wait(() => requests.length === before + 1); return requests[before]; };
		const finish = async (request, uploaded) => { request.resolve({ data: { data: { imagesUploader: uploaded } } }); await wait(() => !document.querySelector('.gym-photos[aria-busy="true"]')); await tick(); };
		const remove = (index) => byLabel(i18n.getFixedT('en', 'admin-gyms')('photos.remove', { index }));
		const cover = (index) => byLabel(i18n.getFixedT('en', 'admin-gyms')('photos.makeCover', { index }));

		photos([]); assert(!document.querySelector('img')); assert(document.querySelector('.gym-photo-empty')); assert(document.body.textContent.includes(text.photos.intro));
		assert.equal(document.querySelector('.gym-photo-upload button').tagName, 'BUTTON'); assert.equal(document.querySelector('input[type="file"]').accept, config.IMAGE_UPLOAD_ACCEPT);
		photoProps = { showValidation: true }; render(); assert.equal(document.querySelector('[role="alert"]').textContent, text.photos.minimum); pass('empty controlled photos, deliberate upload surface, picker label and requested zero-image validation');
		photos([paths[0]]); assert.equal(document.querySelector('.gym-photo-cover').textContent, text.photos.cover); assert.equal(document.querySelector('img').src, config.REACT_APP_API_URL + '/' + paths[0]); assert.equal(document.querySelector('img').alt, 'Gym photo 1');
		flushSync(() => document.querySelector('img').dispatchEvent(new window.Event('error'))); assert(document.querySelector('.gym-photo-fallback[role="img"]')); pass('one photo cover, canonical URL, useful alt and failed-preview fallback');
		photos(paths.slice(0, 5)); assert(document.querySelector('.gym-photo-upload button').disabled); const sixBefore = tokenCalls.length; choose([file()]); await tick(); assert.equal(tokenCalls.length, sixBefore); assert.equal(photoValue.length, 5); assert(document.body.textContent.includes(text.photos.maximum)); pass('five-image limit and sixth selection rejected before token/upload');
		photos(paths.slice(0, 3)); click(remove(2)); assert.deepEqual(photoValue, [paths[0], paths[2]]); click(remove(1)); assert.deepEqual(photoValue, [paths[2]]); assert(document.querySelector('.gym-photo-cover')); pass('non-cover removal and cover removal promote retained next image without a request');
		photos(paths.slice(0, 3)); const reorderRequests = requests.length; click(cover(3)); assert.deepEqual(photoValue, [paths[2], paths[0], paths[1]]); assert.equal(requests.length, reorderRequests); pass('Make cover is deterministic local reordering only');
		for (const badPath of ['https://example.com/photo.jpg', paths[0].replace('/gym/', '/program/')]) { photos([badPath], { showValidation: true }); assert(!document.querySelector('img')); assert.equal(document.querySelector('[role="alert"]').textContent, text.photos.invalidPath); } pass('external and wrong-target paths never render as images');
		for (const [badFile, message] of [[file('photo.svg', 'image/svg+xml'), text.photos.fileType], [file('photo.exe'), text.photos.fileType], [file('photo.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1), text.photos.size]]) {
			photos([paths[0]]); const before = tokenCalls.length; choose([badFile]); await tick(); assert.equal(tokenCalls.length, before); assert.deepEqual(photoValue, [paths[0]]); assert.equal(document.querySelector('[role="alert"]').textContent, message);
		} pass('invalid MIME, filename and >5 MiB rejected locally without disturbing existing photos');
		photos([paths[0]]); const request = await start([file('first.webp', 'image/webp'), file('second.png', 'image/png')]);
		assert.equal(tokenCalls.at(-1), true); assert.equal(request.url, config.getApiGraphqlUrl()); assert.equal(request.options.headers.Authorization, 'Bearer fresh-access-token'); assert.equal(request.options.headers['apollo-require-preflight'], 'true'); assert(!request.options.headers['Content-Type']);
		const operations = JSON.parse(request.form.get('operations')); assert.equal(operations.variables.target, 'gym'); assert.deepEqual(operations.variables.files, [null, null]); assert.match(operations.query, /^mutation ImagesUploader/); assert.doesNotMatch(operations.query, /createGym|updateGym/);
		assert.deepEqual(JSON.parse(request.form.get('map')), { '0': ['variables.files.0'], '1': ['variables.files.1'] }); assert.equal(request.form.get('0').name, 'first.webp'); assert.equal(request.form.get('1').name, 'second.png'); assert.equal(busy.at(-1), true);
		const duplicateCount = requests.length; choose([file()]); await tick(); assert.equal(requests.length, duplicateCount); assert(remove(1).disabled); assert(cover(1) === undefined); assert(document.querySelector('[role="status"]'));
		callbackVersion = 2; render(); assert(!request.options.signal.aborted);
		await finish(request, [paths[1], paths[2]]); assert.deepEqual(photoValue, paths.slice(0, 3)); assert.equal(busy.at(-1), false); assert.equal(callbackVersions.at(-1), 2); pass('secure multipart gym target, fresh token, ordered map/files, upload lock, latest parent callback and append order');
		photos([paths[0]]); const duplicate = await start(); await finish(duplicate, [paths[0]]); assert.deepEqual(photoValue, [paths[0]]); assert.equal(document.querySelector('[role="alert"]').textContent, text.photos.duplicate); pass('duplicate backend path cannot be appended');
		for (const invalid of [undefined, [], ['https://example.com/photo.jpg'], [paths[1].replace('/gym/', '/article/')], [paths[1], paths[1]]]) {
			photos([paths[0]]); const malformed = await start(); await finish(malformed, invalid); assert.deepEqual(photoValue, [paths[0]]); assert.equal(document.querySelector('[role="alert"]').textContent, text.photos.malformed);
		} pass('missing/incorrect-count/external/wrong-target/duplicate upload receipts preserve existing list');
		for (const errors of ['invalid envelope', {}, [null]]) {
			photos([paths[0]]); const malformedErrors = await start(); malformedErrors.resolve({ data: { errors } }); await wait(() => document.querySelector('[role="alert"]')); assert.equal(document.querySelector('[role="alert"]').textContent, text.photos.malformed); assert.deepEqual(photoValue, [paths[0]]);
		} pass('malformed GraphQL error envelopes stay localized and preserve photos');
		photos([paths[0]]); const failed = await start(); failed.reject(new Error('private transport stack')); await wait(() => document.querySelector('[role="alert"]')); assert.deepEqual(photoValue, [paths[0]]); assert.equal(document.querySelector('[role="alert"]').textContent, text.photos.error); assert(!document.body.textContent.includes('private transport')); pass('network failure stays localized and preserves existing list');
		photos([paths[0]]); const unauth = await start(); unauth.resolve({ data: { errors: [{ extensions: { code: 'UNAUTHENTICATED' } }] } }); await wait(() => invalidations === 1); assert.equal(document.querySelector('[role="alert"]').textContent, text.auth.session);
		photos([paths[0]]); tokenMode = 'fail'; const beforeTokenFailure = requests.length; choose([file()]); await wait(() => invalidations === 2); assert.equal(requests.length, beforeTokenFailure); assert.deepEqual(photoValue, [paths[0]]); tokenMode = ''; pass('GraphQL auth and failed token renewal use session feedback and existing invalidation flow');
		for (const reason of ['route', 'scope', 'session', 'disabled', 'images', 'role', 'blocked', 'auth-ready', 'auth-error', 'unmount']) {
			photos([paths[0]]); const old = await start(); const changeCount = changes.length;
			if (reason === 'route') flushSync(() => events.emit('routeChangeStart', '/_admin/users'));
			if (reason === 'scope') { photoProps = { scopeKey: 'draft2' }; render(); }
			if (reason === 'session') { session += '-new'; render(); }
			if (reason === 'disabled') { photoProps = { disabled: true }; render(); }
			if (reason === 'images') flushSync(() => setPhotos([paths[3]]));
			if (reason === 'role') flushSync(() => store.userVar({ ...store.userVar(), memberType: 'USER' }));
			if (reason === 'blocked') flushSync(() => store.userVar({ ...store.userVar(), memberStatus: 'BLOCK' }));
			if (reason === 'auth-ready') flushSync(() => store.authReadyVar(false));
			if (reason === 'auth-error') flushSync(() => store.authErrorVar('session failure'));
			if (reason === 'unmount') { active = () => null; key++; render(); }
			assert(old.options.signal.aborted, reason + ' aborts upload'); old.resolve({ data: { data: { imagesUploader: [paths[1]] } } }); await tick(); assert.equal(changes.length, changeCount, reason + ' ignores obsolete result'); assert.equal(busy.at(-1), false);
			if (reason === 'role') flushSync(() => store.userVar({ ...store.userVar(), memberType: 'ADMIN' }));
			if (reason === 'blocked') flushSync(() => store.userVar({ ...store.userVar(), memberStatus: 'ACTIVE' }));
			if (reason === 'auth-ready') flushSync(() => store.authReadyVar(true));
			if (reason === 'auth-error') flushSync(() => store.authErrorVar(''));
		} pass('route/draft/session/disabled/external-value/role/unmount abort and fence obsolete upload results');
		photos([paths[0]]); tokenMode = 'hold'; const waitingCount = requests.length; choose([file()]); await wait(() => resolveToken); flushSync(() => events.emit('routeChangeStart')); resolveToken('late-token'); await tick(); assert.equal(requests.length, waitingCount); tokenMode = ''; pass('route departure during token refresh prevents upload dispatch');

		hours(null); assert.equal(hoursValue, null); assert(!document.querySelector('input[type="time"]')); assert(document.body.textContent.includes(text.hours.unknown));
		click(document.querySelector('.gym-hours-heading input')); assert.equal(hoursValue.length, 7); assert.deepEqual(hoursValue, blank); assert.equal(document.querySelectorAll('input[type="time"]').length, 14); assert.deepEqual(Array.from(document.querySelectorAll('.gym-hours-day h3')).map((node) => node.textContent), weekdays.map((day) => text.hours.weekdays[day])); assert(!document.querySelector('[role="alert"]')); pass('null hours toggle creates seven ordered unconfirmed rows without fabricated times');
		hoursProps = { showValidation: true }; render(); assert.equal(document.querySelectorAll('.gym-hours-day-error').length, 7); assert.throws(() => helper.normalizeGymOpeningHours(hoursValue)); pass('requested validation marks incomplete enabled draft and prevents serialization');
		const supplied = closedWeek(); supplied[1] = { ...openDay, dayOfWeek: 'TUE', closeTime: '' }; hours(supplied, { showValidation: true });
		const row = Array.from(document.querySelectorAll('.gym-hours-day')).find((node) => node.querySelector('h3').textContent === 'Tuesday'); const rowError = row.querySelector('[role="alert"]'); assert(rowError); assert.equal(rowError.textContent, text.hours.requiredTimes);
		for (const input of row.querySelectorAll('input[type="time"]')) { assert.equal(input.getAttribute('aria-invalid'), 'true'); assert(input.getAttribute('aria-describedby').split(' ').includes(rowError.id)); assert.equal(input.step, '60'); }
		assert.equal(document.querySelectorAll('.gym-hours-day-error').length, 1); pass('weekday-specific missing-time error, native minute precision, aria-invalid and exact aria-describedby');
		for (const [badClose, expected] of [['24:00', text.hours.timeFormat], ['08:30', text.hours.timeOrder], ['08:00', text.hours.timeOrder]]) {
			const bad = closedWeek(); bad[0] = { ...openDay, closeTime: badClose }; hours(bad, { showValidation: true }); assert.equal(document.querySelector('.gym-hours-day-error').textContent, expected); assert.equal(document.querySelector('[aria-label="Monday opening time"]').getAttribute('aria-invalid'), 'true');
		} pass('native-time component associates invalid format/equal/overnight errors with affected day');
		const suppliedWeek = closedWeek(); suppliedWeek[0] = openDay; hours(suppliedWeek.slice().reverse());
		assert.equal(document.querySelector('.gym-hours-day h3').textContent, 'Monday'); click(byLabel('Monday: Open')); assert.deepEqual(hoursValue.map((day) => day.dayOfWeek), weekdays); assert.equal(hoursValue[0].isClosed, true); assert.equal(hoursValue[0].openTime, null); assert.equal(hoursValue[0].closeTime, null); assert(document.querySelector('[aria-label="Monday opening time"]').disabled);
		assert.equal(helper.normalizeGymOpeningHours(hoursValue)[0].openTime, null); click(byLabel('Monday: Open')); assert.equal(hoursValue[0].openTime, ''); assert.equal(hoursValue[0].closeTime, ''); assert.throws(() => helper.normalizeGymOpeningHours(hoursValue)); pass('reversed API rows display/update in order; Closed clears submitted times; reopening stays blank');
		const edit = (label, value) => { const input = byLabel(label); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value); flushSync(() => input.dispatchEvent(new window.Event('input', { bubbles: true }))); };
		edit('Monday opening time', '09:15'); edit('Monday closing time', '20:45'); assert.equal(helper.normalizeGymOpeningHours(hoursValue)[0].openTime, '09:15'); assert.equal(helper.normalizeGymOpeningHours(hoursValue)[0].closeTime, '20:45'); pass('explicit native time entry produces valid normalized schedule');
		click(document.querySelector('.gym-hours-heading input')); assert.equal(hoursValue, null); assert(!document.querySelector('.gym-hours-week')); pass('turning hours off restores null, separate from all-closed schedule');
		hours(closedWeek().slice(1), { showValidation: true }); assert.equal(document.querySelectorAll('.gym-hours-day').length, 7); assert(document.body.textContent.includes(text.hours.sevenDays)); assert.throws(() => helper.normalizeGymOpeningHours(hoursValue)); pass('incomplete weekly structure keeps seven visible rows and cannot serialize as valid');
		hours(suppliedWeek, { disabled: true }); assert(Array.from(document.querySelectorAll('input')).every((node) => node.disabled || node.closest('fieldset').disabled)); pass('disabled hours keep all state/time controls read-only');
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale; const labels = resources[locale]['admin-gyms']; photos(paths.slice(0, 2)); assert.equal(document.querySelector('legend').textContent, labels.photos.title); assert.equal(document.querySelector('.gym-photo-cover').textContent, labels.photos.cover); assert.equal(document.querySelector('.gym-photo-actions button').textContent, labels.photos.removeAction);
			hours(null); assert.equal(document.querySelector('legend').textContent, labels.hours.title); assert.equal(document.querySelector('.gym-control-note').textContent, labels.hours.note); assert(labels.hours.note.includes('Asia/Seoul'));
		} pass('EN/KR/RU real controls resolve photos, actions and informational Asia/Seoul note');
		const css = require('sass').compile(path.join(project, 'scss/pc/admin/gyms.scss'), { logger: require('sass').Logger.silent }).css;
		assert.match(css, /object-fit: cover/); assert.match(css, /aspect-ratio: 16\/9/); assert.match(css, /max-width: 899px/); assert.match(css, /max-width: 599px/); assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/); assert.match(css, /min-height: 44px/); assert.match(css, /:focus-visible/); pass('SCSS compiles: cover hierarchy, wrapping gallery, reflowing weekly rows, touch sizes and visible focus');
		for (const filename of ['GymImages', 'GymOpeningHours']) assert.doesNotMatch(fs.readFileSync(path.join(project, 'libs/components/admin/gyms', filename + '.tsx'), 'utf8'), /CREATE_GYM|UPDATE_GYM_BY_ADMIN|useMutation|deleteFile|unlink/);
		assert(!fs.existsSync(path.join(project, 'pages/_admin/gyms/detail.tsx'))); pass('controls contain no final Gym mutation, file deletion or temporary detail route');
		console.log(`${checks} G3D control/helper/DOM groups passed. Upload transport intercepted; no Gym create/update mutations executed. Browser QA not run.`);
		return checks;
	} finally {
		if (root) root.unmount(); await new Promise((resolve) => setTimeout(resolve, 50)); dom.window.close();
		for (const key of globals) { if (previous[key]) Object.defineProperty(global, key, previous[key]); else delete global[key]; }
	}
};
if (require.main === module) module.exports().catch((error) => { console.error(error); process.exitCode = 1; });
