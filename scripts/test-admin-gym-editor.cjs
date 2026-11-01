// Deterministic real React/MUI/Apollo integration; no application Gym writes.
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
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (!name.startsWith('.')) return require(name);
		const target = path.resolve(path.dirname(file), name);
		if (target.endsWith('.css')) return {};
		if (target.endsWith('.json')) return JSON.parse(fs.readFileSync(target, 'utf8'));
		return load(fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}

module.exports = async function editorTests() {
	let checks = 0, lifecycleChecks = 0;
	const pass = (name) => { checks++; console.log('PASS G3E ' + name); };
	const helper = load('libs/admin-gyms.ts');
	const imagePath = 'uploads/gym/123e4567-e89b-42d3-a456-426614174000.jpg';
	const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
	const closed = () => weekdays.map((dayOfWeek) => ({ dayOfWeek, isClosed: true, openTime: null, closeTime: null, __typename: 'GymOpeningHoursDay' }));
	const id = 'a'.repeat(24), createdId = 'b'.repeat(24), otherId = 'c'.repeat(24);
	const original = () => ({ _id: id, gymName: 'Existing Gym', gymLocation: 'SEOUL', gymAddress: '10 Test Street', gymDesc: 'An existing description', gymPhone: '+82 10-1234-5678', gymImages: [imagePath], amenities: ['SHOWER', 'PARKING'], openingHours: closed(), gymStatus: 'PAUSED', gymRevision: 7, __v: 91, createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:00:00.000Z', deletedAt: null, __typename: 'AdminGym' });
	assert.equal(helper.gymEditorId(undefined), ''); assert.equal(helper.gymEditorId(['a'.repeat(24)]), ''); assert.equal(helper.gymEditorId('bad'), ''); assert.equal(helper.gymEditorId('A'.repeat(24)), id);
	const first = helper.gymEditorDraft(original()); assert(helper.gymEditorReceipt(original()));
	assert.equal(helper.gymEditorKey(first), helper.gymEditorKey({ ...first, gymName: ' Existing Gym ', amenities: ['PARKING', 'SHOWER'], openingHours: first.openingHours.slice().reverse() }));
	assert.equal(helper.gymEditorKey({ ...first, gymDesc: null, gymPhone: null }), helper.gymEditorKey({ ...first, gymDesc: ' ', gymPhone: '' }));
	assert.notEqual(helper.gymEditorKey(first), helper.gymEditorKey({ ...first, gymImages: [imagePath, imagePath.replace('.jpg', '.png')] }));
	assert(!helper.gymEditorReceipt({ ...original(), gymRevision: undefined, __v: 7 }));
	assert(!helper.gymEditorReceipt({ ...original(), gymImages: ['https://example.com/image.jpg'] }));
	assert(!helper.gymEditorReceipt({ ...original(), amenities: 1 }));
	pass('route IDs, stable normalized dirty comparison, GraphQL metadata stripping and business revision receipt guard');
	const { JSDOM } = require('jsdom');
	const globals = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'Image', 'FormData', 'File', 'Blob'];
	const previous = Object.fromEntries(globals.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
	const dom = new JSDOM('<main id="pc-wrap" class="admin"><div id="bunker"></div></main>', { url: 'http://localhost/_admin/gyms/detail' });
	let root, client;
	try {
		for (const key of globals) Object.defineProperty(global, key, { configurable: true, writable: true, value: dom.window[key] });
		const React = require('react'), { flushSync } = require('react-dom'), { createRoot } = require('react-dom/client');
		const apollo = require('@apollo/client'), { GraphQLError } = require('graphql');
		const { ThemeProvider, createTheme } = require('@mui/material/styles');
		const theme = createTheme(load('scss/MaterialTheme/index.ts').light);
		const admin = { _id: 'admin1', memberType: 'ADMIN', memberStatus: 'ACTIVE' };
		const store = { userVar: apollo.makeVar(admin), authReadyVar: apollo.makeVar(true), authErrorVar: apollo.makeVar('') };
		let session = 'session1', readFault = '', writeFault = '', holdRead = false, holdWrite = false;
		const events = new (require('node:events').EventEmitter)(), navigations = [], toasts = [], requests = [], pending = [], uploads = [];
		const router = { query: {}, isReady: true, asPath: '/_admin/gyms/detail', pathname: '/_admin/gyms/detail', locale: 'en', events,
			push: async (to) => { navigations.push({ kind: 'push', to }); return true; }, replace: async (to) => { navigations.push({ kind: 'replace', to }); return true; } };
		const resources = Object.fromEntries(['en', 'kr', 'ru'].map((lng) => [lng, Object.fromEntries(['common', 'admin-gyms'].map((ns) => [ns, JSON.parse(fs.readFileSync(path.join(project, 'public/locales', lng, ns + '.json'), 'utf8'))]))]));
		const i18n = require('i18next').createInstance(); await i18n.init({ resources, lng: 'en', initImmediate: false, fallbackLng: false });
		const text = resources.en['admin-gyms'];
		let gyms = new Map([[id, original()], [otherId, { ...original(), _id: otherId, gymName: 'Other Gym' }]]);
		const clone = (value) => JSON.parse(JSON.stringify(value));
		client = new apollo.ApolloClient({ cache: new apollo.InMemoryCache(), link: new apollo.ApolloLink((operation) => new apollo.Observable((observer) => {
			const name = operation.operationName, variables = clone(operation.variables);
			assert(['GetGymByAdmin', 'CreateGym', 'UpdateGymByAdmin'].includes(name));
			const item = { name, variables, observer }; requests.push(item);
			const read = name === 'GetGymByAdmin';
			item.respond = () => {
				const fault = read ? readFault : writeFault;
				if (fault === 'network') return observer.error(new Error('private transport stack'));
				const errors = { stale: 'Gym has changed. Refresh and review the latest data.', venue: 'Gym location and address cannot change while any Program references it', contention: 'Gym is busy. Review the latest data before saving again.', rejected: 'Private backend field validation diagnostic' };
				if (errors[fault]) { observer.next({ errors: [new GraphQLError(errors[fault])] }); observer.complete(); return; }
				let gym;
				if (read) gym = gyms.get(variables.gymId) ?? null;
				else if (name === 'CreateGym') { gym = { ...original(), ...variables.input, _id: createdId, gymStatus: 'PAUSED', gymRevision: 0 }; gyms.set(createdId, gym); }
				else { gym = { ...gyms.get(variables.input._id), ...variables.input, gymRevision: variables.input.expectedRevision + 1 }; delete gym.expectedRevision; gyms.set(gym._id, gym); }
				if (fault === 'malformed') gym = { ...gym, gymRevision: undefined };
				observer.next({ data: { [read ? 'getGymByAdmin' : name === 'CreateGym' ? 'createGym' : 'updateGymByAdmin']: clone(gym) } }); observer.complete();
			};
			if ((read && holdRead) || (!read && holdWrite)) { pending.push(item); return () => {}; }
			const timer = setTimeout(item.respond, 10); return () => clearTimeout(timer);
		})) });
		const link = ({ href, children, legacyBehavior, ...props }) => { const url = typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query); return legacyBehavior ? React.cloneElement(children, { ...props, href: url }) : React.createElement('a', { ...props, href: url }, children); };
		const mocks = {
			'next/router': { useRouter: () => router }, 'next/link': { __esModule: true, default: link },
			'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(router.locale, ns) }) },
			'../../../../apollo/store': store,
			'../../../auth': { getAuthSessionId: () => session, ensureAccessToken: async () => 'fixture-access-token', invalidateSession: async () => {}, isAuthenticationError: () => false },
			'../../../sweetAlert': { sweetTopSmallSuccessAlert: async (message) => { toasts.push(message); } },
			axios: { __esModule: true, default: { post: (url, form, options) => new Promise((resolve, reject) => uploads.push({ url, form, options, resolve, reject })) } },
		};
		const Detail = load('libs/components/admin/gyms/GymDetail.tsx', mocks).default;
		root = createRoot(document.getElementById('bunker'));
		const render = () => flushSync(() => root.render(React.createElement(ThemeProvider, { theme }, React.createElement(apollo.ApolloProvider, { client }, React.createElement(Detail)))));
		const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
		const wait = async (predicate) => { for (let n = 0; n < 100; n++) { if (predicate()) return; await tick(); } assert.fail('Editor DOM/query state timed out'); };
		const click = (node) => { assert(node, 'Clickable element exists'); flushSync(() => node.click()); };
		const button = (label) => Array.from(document.querySelectorAll('button')).find((node) => node.textContent === label);
		const input = (name) => document.querySelector(`[name="${name}"]`);
		const edit = (name, value) => { const node = input(name); assert(node); Object.getOwnPropertyDescriptor(node.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(node, value); flushSync(() => node.dispatchEvent(new window.Event('input', { bubbles: true }))); };
		const submit = () => flushSync(() => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
		const count = (name) => requests.filter((item) => item.name === name).length;
		const writes = () => requests.filter((item) => item.name !== 'GetGymByAdmin');
		const selectLocation = async (label) => {
			const node = document.querySelector('#gym-location'); assert(node);
			node.parentElement.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 44, width: 200, height: 44 });
			flushSync(() => node.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 })));
			await wait(() => document.querySelector('[role="option"]')); click(Array.from(document.querySelectorAll('[role="option"]')).find((option) => option.textContent === label)); await tick();
		};
		const route = async (gymId) => { router.query = gymId === undefined ? {} : { id: gymId }; router.asPath = '/_admin/gyms/detail' + (gymId === undefined ? '' : '?id=' + gymId); render(); await tick(); };
		const reload = async (gymId = id) => { session += '-reload'; gyms.set(id, original()); readFault = ''; writeFault = ''; holdRead = false; holdWrite = false; await route(gymId); await wait(() => input('gymName')); };
		const chooseFile = () => { const picker = document.querySelector('input[type="file"]'); Object.defineProperty(picker, 'files', { value: [new File(['fixture'], 'photo.jpg', { type: 'image/jpeg' })], configurable: true }); flushSync(() => picker.dispatchEvent(new window.Event('change', { bubbles: true }))); };
		const upload = async () => { const before = uploads.length; chooseFile(); await wait(() => uploads.length === before + 1); const task = uploads.at(-1); task.resolve({ data: { data: { imagesUploader: [imagePath] } } }); await wait(() => !document.querySelector('.gym-photos[aria-busy="true"]')); await tick(); };

		for (const actor of [{}, { ...admin, memberType: 'USER' }, { ...admin, memberType: 'TRAINER' }, { ...admin, memberStatus: 'BLOCK' }, { ...admin, memberStatus: 'DELETE' }]) {
			flushSync(() => store.userVar(actor)); await route(id); assert(document.querySelector('[role="alert"]')); assert.equal(requests.length, 0);
		} pass('guest, USER, TRAINER, BLOCK/DELETE ADMIN cannot query or mutate editor');
		flushSync(() => { store.userVar(admin); store.authReadyVar(false); }); render(); await tick(); assert(document.querySelector('[role="status"]')); assert.equal(requests.length, 0);
		router.isReady = false; flushSync(() => store.authReadyVar(true)); render(); await tick(); assert.equal(requests.length, 0); router.isReady = true;
		await route(undefined); assert(document.body.textContent.includes(text.lifecycle.createdPaused)); assert.equal(count('GetGymByAdmin'), 0); assert.equal(document.querySelectorAll('input[type="radio"]').length, 0); assert(button(text.list.create).disabled); pass('auth/router readiness; no-id create mode starts PAUSED without read or create-time ACTIVE control');
		submit(); await tick(); assert.equal(writes().length, 0); assert.equal(input('gymName').getAttribute('aria-invalid'), 'true'); assert(document.body.textContent.includes(text.photos.minimum)); assert(input('gymAddress').getAttribute('aria-describedby').includes('helper-text')); pass('required basic validation and image minimum block GraphQL with accessible field errors');
		edit('gymName', '  New Gym  '); edit('gymAddress', '  20 New Street  '); await selectLocation(resources.en.common.BUSAN); edit('gymDesc', '   '); edit('gymPhone', ' ');
		const beforeUpload = uploads.length; chooseFile(); await wait(() => uploads.length > beforeUpload); assert(button(text.list.create).disabled); const beforeBlocked = writes().length; submit(); assert.equal(writes().length, beforeBlocked); assert(input('gymName').disabled); assert(!uploads.at(-1).options.signal.aborted);
		uploads.at(-1).resolve({ data: { data: { imagesUploader: [imagePath] } } }); await wait(() => !button(text.list.create).disabled); pass('G3D upload busy synchronously blocks create and freezes fields without aborting its own upload');
		for (const amenity of ['PARKING', 'WIFI']) click(Array.from(document.querySelectorAll('.gym-editor-amenities label')).find((node) => node.textContent === text.amenities[amenity]).querySelector('input'));
		holdWrite = true; const beforeCreate = count('CreateGym'); submit(); submit(); await wait(() => count('CreateGym') === beforeCreate + 1); assert(button(text.form.saving).disabled); assert.equal(toasts.length, 0);
		const createRequest = requests.at(-1); assert.equal(createRequest.name, 'CreateGym'); assert.deepEqual(createRequest.variables.input, { gymName: 'New Gym', gymLocation: 'BUSAN', gymAddress: '20 New Street', gymImages: [imagePath], gymDesc: null, gymPhone: null, openingHours: null, amenities: ['PARKING', 'WIFI'] }); assert(!('gymStatus' in createRequest.variables.input)); assert(!('gymRevision' in createRequest.variables.input));
		createRequest.respond(); await wait(() => navigations.some((nav) => nav.kind === 'replace')); assert.deepEqual(navigations.at(-1).to, { pathname: '/_admin/gyms/detail', query: { id: createdId } }); assert.equal(toasts.at(-1), text.form.saved); submit(); await tick(); assert.equal(count('CreateGym'), beforeCreate + 1); pass('whitelisted nullable create payload, amenities, null hours, duplicate lock, confirmed-only toast and real edit navigation');
		holdWrite = false; await route(createdId); await wait(() => input('gymName')?.value === 'New Gym'); assert(button(text.form.save).disabled); pass('created id route hydrates returned Gym with clean server revision');
		await reload(); assert.equal(requests.filter((item) => item.name === 'GetGymByAdmin').at(-1).variables.gymId, id); assert.equal(input('gymName').value, 'Existing Gym'); assert.equal(input('gymPhone').value, original().gymPhone); assert.equal(document.querySelector('.gym-photos legend').textContent, text.photos.editTitle); assert.equal(document.querySelectorAll('.gym-hours-day').length, 7); assert(button(text.form.save).disabled);
		const cleanWrites = writes().length; submit(); await tick(); assert.equal(writes().length, cleanWrites); pass('id edit query, full server hydration including metadata-bearing hours and no clean save');
		edit('gymName', ' Existing Gym '); assert(button(text.form.save).disabled); pass('trim-only changes do not mark an edit dirty');
		edit('gymName', '  Updated Gym  '); edit('gymDesc', ' '); edit('gymPhone', ''); assert(!button(text.form.save).disabled); holdWrite = true; const beforeUpdate = count('UpdateGymByAdmin'); submit(); submit(); await wait(() => count('UpdateGymByAdmin') === beforeUpdate + 1);
		const update = requests.at(-1); assert.equal(update.variables.input._id, id); assert.equal(update.variables.input.expectedRevision, 7); assert(!('__v' in update.variables.input)); assert(!('gymRevision' in update.variables.input)); assert.equal(update.variables.input.gymName, 'Updated Gym'); assert.equal(update.variables.input.gymDesc, null); assert.equal(update.variables.input.gymPhone, null); assert.equal(update.variables.input.openingHours.length, 7); assert(update.variables.input.openingHours.every((day) => day.openTime === null && day.closeTime === null && !('__typename' in day)));
		update.respond(); await wait(() => button(text.form.save)?.disabled && !document.querySelector('form[aria-busy="true"]')); assert.equal(input('gymName').value, 'Updated Gym'); holdWrite = false; pass('one update sends loaded expectedRevision instead of __v, preserves null clearing and normalizes seven closed days; success resets baseline');
		edit('gymName', 'Revision Eight Gym'); submit(); await wait(() => requests.filter((item) => item.name === 'UpdateGymByAdmin').at(-1).variables.input.expectedRevision === 8); await wait(() => button(text.form.save)?.disabled); pass('successful receipt advances business revision for the next explicit save');
		await reload(); const activeRadio = Array.from(document.querySelectorAll('.gym-editor-publishing input[type="radio"]')).find((node) => node.value === 'ACTIVE'); click(activeRadio); assert(document.querySelector('.gym-editor-heading').textContent.includes(text.lifecycle.paused)); submit(); await wait(() => requests.filter((item) => item.name === 'UpdateGymByAdmin').at(-1).variables.input.gymStatus === 'ACTIVE'); await wait(() => button(text.form.save)?.disabled); assert(document.querySelector('.gym-editor-heading').textContent.includes(text.lifecycle.active)); assert(!document.querySelector('input[type="radio"][value="DELETE"]')); pass('PAUSED→ACTIVE uses expectedRevision update; header retains persisted status until success; no DELETE action');
		click(Array.from(document.querySelectorAll('.gym-editor-publishing input[type="radio"]')).find((node) => node.value === 'PAUSED')); submit(); await wait(() => requests.filter((item) => item.name === 'UpdateGymByAdmin').at(-1).variables.input.gymStatus === 'PAUSED'); await wait(() => button(text.form.save)?.disabled); pass('ACTIVE→PAUSED normal status editing');
		await reload(); for (const checkbox of Array.from(document.querySelectorAll('.gym-editor-amenities input')).filter((node) => node.checked)) click(checkbox); submit(); await wait(() => requests.filter((item) => item.name === 'UpdateGymByAdmin').at(-1).variables.input.amenities.length === 0); await wait(() => button(text.form.save)?.disabled); pass('all six enum amenity controls support clearing amenities to an empty array');
		await reload(); edit('gymName', 'Locally Edited Gym'); gyms.set(id, { ...original(), gymName: 'Remote Name', gymRevision: 25 }); await client.reFetchObservableQueries(); await tick(); assert.equal(input('gymName').value, 'Locally Edited Gym'); writeFault = 'stale'; const staleReads = count('GetGymByAdmin'), staleWrites = count('UpdateGymByAdmin'); submit(); await wait(() => document.querySelector('[data-recovery="stale"]')); assert.equal(requests.at(-1).variables.input.expectedRevision, 7); assert.equal(input('gymName').value, 'Locally Edited Gym'); submit(); await tick(); assert.equal(count('UpdateGymByAdmin'), staleWrites + 1); assert.equal(count('GetGymByAdmin'), staleReads); assert(button(text.form.save).disabled); pass('query rerender cannot overwrite draft/revision; stale conflict preserves draft and never reloads/replays');
		await reload(); edit('gymAddress', '99 Unsaved Street'); await selectLocation(resources.en.common.BUSAN); writeFault = 'venue'; const venueWrites = count('UpdateGymByAdmin'), venueReads = count('GetGymByAdmin'); submit(); await wait(() => document.querySelector('#gym-venue-error')); assert.equal(input('gymAddress').value, '99 Unsaved Street'); assert.equal(document.querySelector('#gym-venue-error p').textContent, text.venue.referenced); assert(input('gymAddress').getAttribute('aria-describedby').includes('gym-venue-error')); assert(!input('gymAddress').disabled); await tick(); assert.equal(count('UpdateGymByAdmin'), venueWrites + 1); assert.equal(count('GetGymByAdmin'), venueReads); pass('referenced physical venue conflict stays beside location/address, preserves both drafts, does not guess-disable or retry');
		await reload(); edit('gymName', 'Unsure Gym'); writeFault = 'network'; const uncertainBefore = count('UpdateGymByAdmin'); submit(); await wait(() => document.querySelector('[data-recovery="unknown"]')); assert.equal(input('gymName').value, 'Unsure Gym'); submit(); await tick(); assert.equal(count('UpdateGymByAdmin'), uncertainBefore + 1); assert(!document.body.textContent.includes('private transport')); pass('uncertain update blocks replay and preserves draft without leaking transport details');
		await reload(); edit('gymName', 'Contended Gym'); writeFault = 'contention'; const contendedWrites = count('UpdateGymByAdmin'); submit(); await wait(() => document.querySelector('[data-recovery="contention"]')); submit(); await tick(); assert.equal(count('UpdateGymByAdmin'), contendedWrites + 1); assert.equal(input('gymName').value, 'Contended Gym'); pass('contention recovery remains non-destructive and never replays the update');
		await reload(); edit('gymName', 'Rejected Gym'); writeFault = 'rejected'; submit(); await wait(() => document.querySelector('[data-recovery="rejected"]')); assert.equal(document.querySelector('[data-recovery="rejected"]').textContent, text.form.saveError); assert.equal(input('gymName').value, 'Rejected Gym'); assert(!document.body.textContent.includes('Private backend')); pass('definitive server rejection uses safe localized error and retains input');
		await reload(); edit('gymName', 'Broken Receipt Gym'); writeFault = 'malformed'; const toastCount = toasts.length; submit(); await wait(() => document.querySelector('[data-recovery="unknown"]')); assert.equal(toasts.length, toastCount); assert(button(text.form.save).disabled); pass('malformed successful receipt cannot fake success or unlock a second mutation');
		await reload(); edit('gymName', 'Upload Block Gym'); const uploadBefore = uploads.length; chooseFile(); await wait(() => uploads.length > uploadBefore); const blockedWrites = writes().length; submit(); assert.equal(writes().length, blockedWrites); assert(button(text.form.save).disabled); uploads.at(-1).reject(new Error('upload failed')); await wait(() => !document.querySelector('form[aria-busy="true"]')); assert.deepEqual(gyms.get(id).gymImages, [imagePath]); pass('edit upload busy blocks save; failed upload keeps persisted image draft');
		for (const badId of ['', 'bad', ['a'.repeat(24)]]) { const before = requests.length; await route(badId); assert(document.body.textContent.includes(text.form.notFound)); assert.equal(requests.length, before); } pass('invalid/array/empty id cannot accidentally enter create mode or query');
		readFault = 'network'; session += '-read'; await route(id); await wait(() => button(text.list.retry)); assert(document.body.textContent.includes(text.form.loadError)); readFault = ''; click(button(text.list.retry)); await wait(() => input('gymName')); pass('initial query error is localized and read-only Retry hydrates safely');
		session += '-missing'; await route('d'.repeat(24)); await wait(() => document.body.textContent.includes(text.form.notFound)); pass('valid but absent Gym produces unavailable state');
		session += '-held'; holdRead = true; await route(id); assert(document.body.textContent.includes(text.form.loading)); const heldRead = pending.at(-1); holdRead = false; heldRead.respond(); await wait(() => input('gymName')); pass('edit loading state waits for actual response');
		gyms.set(id, { ...original(), gymStatus: 'DELETE' }); session += '-delete'; await route(id); await wait(() => document.querySelector('.gym-history')); assert(!input('gymName')); assert(!button(text.form.save)); assert(!document.querySelector('input[type="radio"]')); assert(document.body.textContent.includes(text.lifecycle.terminal)); const terminalWrites = writes().length; assert(!document.querySelector('form')); assert.equal(writes().length, terminalWrites); pass('DELETE Gym is guarded read-only with no normal save/restore/terminal mutation');
		await reload(); edit('gymName', 'Old Session Draft'); holdWrite = true; submit(); await wait(() => pending.at(-1)?.name === 'UpdateGymByAdmin'); const oldWrite = pending.at(-1); const previousToast = toasts.length; session += '-new'; render(); await wait(() => input('gymName')?.value === 'Existing Gym'); oldWrite.respond(); await tick(); assert.equal(toasts.length, previousToast); assert.equal(input('gymName').value, 'Existing Gym'); holdWrite = false; pass('obsolete logical-session mutation response cannot hydrate or toast in a new editor session');
		await reload(); edit('gymName', 'Old Route Draft'); holdWrite = true; submit(); await wait(() => pending.at(-1)?.name === 'UpdateGymByAdmin'); const routeWrite = pending.at(-1); flushSync(() => events.emit('routeChangeStart', '/_admin/gyms/detail?id=' + otherId)); await route(otherId); await wait(() => input('gymName')?.value === 'Other Gym'); routeWrite.respond(); await tick(); assert.equal(input('gymName').value, 'Other Gym'); holdWrite = false; pass('obsolete route mutation response cannot overwrite another Gym');
		await reload(undefined); // reload's default targets edit; explicitly create a fresh no-id session next.
		session += '-create-hours'; await route(undefined); edit('gymName', 'Hours Gym'); edit('gymAddress', '30 Hours Street'); await selectLocation(resources.en.common.SEOUL); await upload(); click(document.querySelector('.gym-hours-heading input')); assert(button(text.list.create).disabled);
		for (const node of Array.from(document.querySelectorAll('.gym-hours-state input'))) click(node); assert(!button(text.list.create).disabled); holdWrite = true; submit(); await wait(() => pending.at(-1)?.name === 'CreateGym'); const hoursCreate = pending.at(-1); assert.equal(hoursCreate.variables.input.openingHours.length, 7); assert(hoursCreate.variables.input.openingHours.every((day) => day.isClosed && day.openTime === null && day.closeTime === null)); hoursCreate.respond(); await tick(); holdWrite = false; pass('real G3D Hours integration blocks incomplete seven-day drafts and sends null times for closed days');
		session += '-uncertain-create'; writeFault = 'network'; await route(undefined); edit('gymName', 'Uncertain Create'); edit('gymAddress', '40 Test Street'); await selectLocation(resources.en.common.SEOUL); await upload(); const createBefore = count('CreateGym'); submit(); await wait(() => document.querySelector('[data-recovery="unknown"]')); assert(document.body.textContent.includes(text.conflict.unknownCreate)); submit(); await tick(); assert.equal(count('CreateGym'), createBefore + 1); pass('uncertain create cannot be accidentally replayed');
		const lifecyclePass = (name) => { checks++; lifecycleChecks++; console.log('PASS G3F ' + name); };
		for (const [error, expected] of [
			[{ graphQLErrors: [{ extensions: { code: 'UNAUTHENTICATED' } }] }, 'session'],
			[{ graphQLErrors: [{ code: 'FORBIDDEN' }] }, 'forbidden'],
			[{ networkError: { statusCode: 401 } }, 'session'],
			[{ networkError: { statusCode: 403 } }, 'forbidden'],
			[{ graphQLErrors: [{ extensions: { code: 'BAD_USER_INPUT' } }] }, 'validation'],
			[{ graphQLErrors: [{ extensions: { code: 'INTERNAL_SERVER_ERROR' }, message: 'Private backend' }] }, 'rejected'],
			[{ graphQLErrors: [{ extensions: { code: 'CONFLICT' }, message: 'Unrelated conflict' }] }, 'rejected'],
			[{ graphQLErrors: {} }, 'unknown'],
			[{ graphQLErrors: [null] }, 'rejected'],
		]) assert.equal(helper.gymUpdateError(error), expected);
		lifecyclePass('stable session/authorization/validation codes, narrow business conflicts and safe unexpected failures');
		await reload(); gyms.set(id, { ...original(), gymImages: [imagePath, imagePath.replace('.jpg', '.png')] }); session += '-stale-full'; await route(id); await wait(() => document.querySelectorAll('.gym-photos li').length === 2);
		click(button(text.photos.makeCoverAction)); click(document.querySelector('.gym-hours-heading input'));
		edit('gymName', 'Full Local Draft'); edit('gymDesc', 'Keep my description'); edit('gymPhone', '+82 10-5555-1234'); edit('gymAddress', '99 Local Street');
		await selectLocation(resources.en.common.BUSAN); click(document.querySelector('.gym-editor-amenities input[value=""]') || document.querySelector('.gym-editor-amenities input'));
		click(Array.from(document.querySelectorAll('.gym-editor-publishing input')).find((node) => node.value === 'ACTIVE'));
		writeFault = 'stale'; submit(); await wait(() => document.querySelector('[data-recovery="stale"]'));
		assert.equal(input('gymName').value, 'Full Local Draft'); assert.equal(input('gymAddress').value, '99 Local Street'); assert.equal(input('gymDesc').value, 'Keep my description');
		assert(document.querySelector('.gym-photos img').src.endsWith('.png')); assert(!document.querySelector('.gym-hours-heading input').checked); assert(document.querySelector('.gym-editor-publishing input[value="ACTIVE"]').checked);
		assert(button(text.form.save).disabled); assert(button(text.lifecycle.markDeleted).disabled); assert(document.querySelector('[data-recovery="stale"]').textContent.includes(text.conflict.discardWarning));
		const reloadWrites = count('UpdateGymByAdmin'), reloadReads = count('GetGymByAdmin');
		gyms.set(id, { ...original(), gymName: 'Latest Server Gym', gymRevision: 12 }); holdRead = true; click(button(text.conflict.reload));
		await wait(() => count('GetGymByAdmin') === reloadReads + 1); assert.equal(requests.at(-1).variables.gymId, id); assert.equal(input('gymName').value, 'Full Local Draft'); assert(input('gymName').disabled);
		readFault = 'network'; pending.at(-1).respond(); await wait(() => document.body.textContent.includes(text.conflict.reloadFailed));
		assert.equal(input('gymName').value, 'Full Local Draft'); assert.equal(input('gymDesc').value, 'Keep my description'); assert(document.querySelector('[data-recovery="stale"]')); assert(button(text.form.save).disabled);
		readFault = ''; click(button(text.conflict.reload)); await wait(() => count('GetGymByAdmin') === reloadReads + 2); pending.at(-1).respond();
		await wait(() => input('gymName')?.value === 'Latest Server Gym' && !input('gymName').disabled); holdRead = false;
		assert.equal(input('gymAddress').value, original().gymAddress); assert(!document.querySelector('[data-recovery="stale"]')); assert(button(text.form.save).disabled); assert.equal(count('UpdateGymByAdmin'), reloadWrites);
		writeFault = ''; edit('gymName', 'Saved After Reload'); submit(); await wait(() => count('UpdateGymByAdmin') === reloadWrites + 1); assert.equal(requests.at(-1).variables.input.expectedRevision, 12);
		await wait(() => !document.querySelector('form[aria-busy="true"]')); assert(button(text.form.save).disabled); assert.equal(toasts.at(-1), text.form.saved);
		edit('gymName', 'Next Revision'); submit(); await wait(() => count('UpdateGymByAdmin') === reloadWrites + 2); assert.equal(requests.at(-1).variables.input.expectedRevision, 13); await wait(() => !document.querySelector('form[aria-busy="true"]'));
		lifecyclePass('stale preserves full draft, blocks saves/deletion, explicit failed reload preserves state, successful reload becomes clean at authoritative revision without replay, success toast and next revision');
		await reload(); gyms.set(id, { ...original(), gymImages: [imagePath, imagePath.replace('.jpg', '.png')] }); session += '-venue-full'; await route(id); await wait(() => document.querySelectorAll('.gym-photos li').length === 2);
		click(button(text.photos.makeCoverAction)); click(document.querySelector('.gym-hours-heading input'));
		edit('gymName', 'Other Unsaved Name'); edit('gymDesc', 'Other unsaved description'); edit('gymPhone', '+82 10-2222-3333'); edit('gymAddress', '90 Venue Draft'); await selectLocation(resources.en.common.BUSAN);
		click(document.querySelector('.gym-editor-amenities input')); click(Array.from(document.querySelectorAll('.gym-editor-publishing input')).find((node) => node.value === 'ACTIVE'));
		assert(!input('gymAddress').disabled); assert(!button(text.form.save).disabled); writeFault = 'venue'; submit(); await wait(() => document.querySelector('#gym-venue-error'));
		const rejectedDraft = clone(requests.at(-1).variables.input), revertReads = count('GetGymByAdmin'), revertWrites = count('UpdateGymByAdmin');
		assert.deepEqual(rejectedDraft.gymImages, [imagePath.replace('.jpg', '.png'), imagePath]); assert.equal(rejectedDraft.openingHours, null);
		assert(button(text.form.save).disabled); assert.equal(document.querySelector('#gym-location').getAttribute('aria-describedby'), 'gym-venue-error'); submit(); await tick(); assert.equal(count('UpdateGymByAdmin'), revertWrites);
		click(button(text.venue.resetFields)); assert.equal(input('gymAddress').value, original().gymAddress); assert(document.querySelector('#gym-location').textContent.includes(resources.en.common.SEOUL));
		assert.equal(input('gymName').value, rejectedDraft.gymName); assert.equal(input('gymDesc').value, rejectedDraft.gymDesc); assert.equal(input('gymPhone').value, rejectedDraft.gymPhone); assert(!document.querySelector('#gym-venue-error')); assert(!button(text.form.save).disabled); assert.equal(count('GetGymByAdmin'), revertReads);
		writeFault = ''; submit(); await wait(() => count('UpdateGymByAdmin') === revertWrites + 1); const revertedPayload = requests.at(-1).variables.input;
		assert.deepEqual(revertedPayload, { ...rejectedDraft, gymLocation: original().gymLocation, gymAddress: original().gymAddress }); await wait(() => !document.querySelector('form[aria-busy="true"]'));
		await reload(); edit('gymAddress', '91 Venue Only Draft'); writeFault = 'venue'; submit(); await wait(() => document.querySelector('#gym-venue-error')); click(button(text.venue.resetFields)); assert(button(text.form.save).disabled);
		lifecyclePass('venue rejection blocks save; explicit revert restores only location/address while preserving all other payload fields; venue-only revert becomes clean; no refetch or speculative disabling');
		await reload(); assert(document.querySelector('.gym-editor-danger')); edit('gymName', 'Must Never Be Saved'); edit('gymAddress', 'Invalid is fine for delete');
		const deleteStart = count('UpdateGymByAdmin'); const danger = button(text.lifecycle.markDeleted); danger.focus(); click(danger); await wait(() => document.querySelector('[role="dialog"]'));
		const dialog = document.querySelector('[role="dialog"]'); assert.equal(dialog.getAttribute('aria-labelledby'), 'gym-delete-title'); assert.equal(dialog.getAttribute('aria-describedby'), 'gym-delete-description'); assert(dialog.textContent.includes(text.lifecycle.confirmBody)); assert.equal(count('UpdateGymByAdmin'), deleteStart);
		await tick(); assert(dialog.contains(document.activeElement)); click(Array.from(dialog.querySelectorAll('button')).find((node) => node.textContent === text.form.cancel)); await wait(() => !document.querySelector('[role="dialog"]')); assert.equal(count('UpdateGymByAdmin'), deleteStart); assert.equal(input('gymName').value, 'Must Never Be Saved'); assert.equal(document.activeElement, danger);
		click(danger); await wait(() => document.querySelector('[role="dialog"]')); flushSync(() => document.querySelector('[role="dialog"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await wait(() => !document.querySelector('[role="dialog"]')); assert.equal(count('UpdateGymByAdmin'), deleteStart);
		click(danger); await wait(() => document.querySelector('[role="dialog"]')); holdWrite = true;
		const confirm = Array.from(document.querySelectorAll('[role="dialog"] button')).find((node) => node.textContent === text.lifecycle.confirmAction); click(confirm); click(confirm); await wait(() => count('UpdateGymByAdmin') === deleteStart + 1);
		assert.deepEqual(requests.at(-1).variables.input, { _id: id, expectedRevision: 7, gymStatus: 'DELETE' }); assert(confirm.disabled); assert(document.querySelector('[role="dialog"][aria-busy="true"]'));
		flushSync(() => document.querySelector('[role="dialog"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); assert(document.querySelector('[role="dialog"]')); assert(!document.querySelector('.gym-history'));
		writeFault = 'stale'; pending.at(-1).respond(); await wait(() => document.querySelector('[data-recovery="stale"]')); holdWrite = false;
		await wait(() => !document.querySelector('[role="dialog"]')); assert.equal(input('gymName').value, 'Must Never Be Saved'); assert.equal(gyms.get(id).gymStatus, 'PAUSED'); assert(button(text.lifecycle.markDeleted).disabled); assert(button(text.form.save).disabled); assert.equal(count('UpdateGymByAdmin'), deleteStart + 1);
		lifecyclePass('dialog requires explicit confirmation, safe Cancel/Escape/focus, duplicate/progress guards, DELETE-only revisioned payload, stale delete preserves draft and requires reload without replay');
		gyms.set(id, { ...original(), gymRevision: 15 }); writeFault = ''; click(button(text.conflict.reload)); await wait(() => input('gymName')?.value === 'Existing Gym' && !document.querySelector('[data-recovery="stale"]'));
		edit('gymName', 'Unrelated Unsaved Changes'); edit('gymDesc', 'Another unsaved description'); click(button(text.lifecycle.markDeleted)); await wait(() => document.querySelector('[role="dialog"]'));
		click(Array.from(document.querySelectorAll('[role="dialog"] button')).find((node) => node.textContent === text.lifecycle.confirmAction)); await wait(() => document.querySelector('.gym-history'));
		assert.deepEqual(requests.at(-1).variables.input, { _id: id, expectedRevision: 15, gymStatus: 'DELETE' }); assert.equal(gyms.get(id).gymName, original().gymName); assert.equal(gyms.get(id).gymDesc, original().gymDesc); assert.equal(gyms.get(id).gymRevision, 16);
		assert(document.querySelector('.gym-history').textContent.includes(original().gymName)); assert(document.querySelector('.gym-editor-heading').textContent.includes(text.lifecycle.deleted)); assert(!document.querySelector('.gym-editor-danger')); assert(!document.querySelector('form, input, textarea, [role="combobox"]')); assert(!button(text.form.save)); assert(!button(text.lifecycle.markDeleted)); assert(!document.querySelector('.gym-photos')); assert(document.querySelector('a[href="/_admin/gyms"]')); assert.equal(toasts.at(-1), text.lifecycle.deleteSuccess);
		lifecyclePass('successful DELETE uses authoritative receipt, excludes unrelated edits, shows historical terminal data with no save/upload/amenity/hour/status/danger/restore/hard-delete controls and has list link');
		// A direct URL or reload must produce the same terminal state, including optional empty values.
		gyms.set(id, { ...gyms.get(id), gymDesc: null, gymPhone: null, amenities: [], openingHours: null }); session += '-direct-terminal'; await route(id); await wait(() => document.querySelector('.gym-history'));
		assert(document.body.textContent.includes(text.lifecycle.notSupplied)); assert(document.body.textContent.includes(text.lifecycle.noAmenities)); assert(document.body.textContent.includes(text.hours.unknown)); assert.equal(count('UpdateGymByAdmin'), deleteStart + 2);
		lifecyclePass('direct deleted detail route and absent optional historical information remain readable without writes');
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale; await reload(); const localized = resources[locale]['admin-gyms']; edit('gymName', 'Locale Conflict'); writeFault = 'stale'; submit(); await wait(() => document.querySelector('[data-recovery="stale"]')); assert(button(localized.conflict.reload)); assert(document.body.textContent.includes(localized.conflict.staleTitle));
			writeFault = ''; click(button(localized.conflict.reload)); await wait(() => !document.querySelector('[data-recovery="stale"]')); click(button(localized.lifecycle.markDeleted)); await wait(() => document.querySelector('[role="dialog"]')); assert(document.querySelector('[role="dialog"]').textContent.includes(localized.lifecycle.confirmBody)); click(Array.from(document.querySelectorAll('[role="dialog"] button')).find((node) => node.textContent === localized.form.cancel)); await wait(() => !document.querySelector('[role="dialog"]'));
		}
		const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => child && typeof child === 'object' ? keys(child, prefix + key + '.') : [prefix + key]).sort();
		assert.deepEqual(keys(resources.en['admin-gyms']), keys(resources.kr['admin-gyms'])); assert.deepEqual(keys(resources.en['admin-gyms']), keys(resources.ru['admin-gyms'])); lifecyclePass('EN/KR/RU exact translation parity and real localized conflict/dialog actions');
		writeFault = ''; for (const locale of ['en', 'kr', 'ru']) { router.locale = locale; session += '-locale'; await route(undefined); assert.equal(document.querySelector('h1').textContent, resources[locale]['admin-gyms'].form.createTitle); assert(document.body.textContent.includes(resources[locale]['admin-gyms'].lifecycle.createdPaused)); assert.equal(document.querySelectorAll('.gym-editor-amenities input').length, 6); assert(!document.querySelector('.gym-editor-danger')); } pass('EN/KR/RU editor strings resolve with all six enum amenities');
		assert(document.querySelector('.gym-editor-fields')); assert(document.querySelector('.gym-editor-actions')); assert(document.querySelector('a[href="/_admin/gyms"]')); const stylesheet = require('sass').compile(path.join(project, 'scss/pc/admin/gyms.scss'), { logger: require('sass').Logger.silent }).css; assert.match(stylesheet, /max-width: 699px/); assert.match(stylesheet, /grid-template-columns: minmax\(0, 1fr\)/); assert.match(stylesheet, /min-height: 44px/); assert.match(stylesheet, /focus-visible/); pass('responsive editor structure, compiled stacked-field SCSS and native accessible controls');
		const singleLineHeight = window.getComputedStyle(input('gymName').closest('.MuiOutlinedInput-root')).height;
		const editorStyles = document.createElement('style'); editorStyles.textContent = stylesheet; document.head.append(editorStyles);
		const descriptionWrites = writes().length;
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale; session += '-description'; await route(undefined);
			for (const value of ['', 'Short description', 'First line\nSecond line\nThird line\nFourth line\nFifth line', 'A long wrapping description with useful Gym information. '.repeat(12)]) {
				edit('gymDesc', value); const textarea = input('gymDesc'), outline = textarea.closest('.MuiOutlinedInput-root');
				assert.equal(textarea.tagName, 'TEXTAREA'); assert.equal(textarea.value, value); assert.equal(textarea.getAttribute('maxlength'), '2000');
				assert.equal(window.getComputedStyle(outline).height, 'auto', 'multiline wrapper must grow with its native textarea instead of theme height');
				assert.equal(window.getComputedStyle(input('gymName').closest('.MuiOutlinedInput-root')).height, singleLineHeight, 'single-line fields retain their existing height');
				assert.equal(document.querySelector('label[for="gym-gymDesc"]').textContent, resources[locale]['admin-gyms'].basic.description);
				textarea.focus(); assert.equal(document.activeElement, textarea); textarea.blur();
			}
			assert.equal(writes().length, descriptionWrites); pass(locale + ' empty/short/multiline/long Description keeps native input, associated label, focus and scoped auto-height without writes');
		}
		editorStyles.remove();
		console.log(`${checks - lifecycleChecks} G3E and ${lifecycleChecks} G3F editor helper/DOM/query groups passed. Mutations used deterministic fixture transport only.`);
		return checks;
	} finally {
		if (root) root.unmount(); if (client) client.stop(); await new Promise((resolve) => setTimeout(resolve, 80)); dom.window.close();
		for (const key of globals) { if (previous[key]) Object.defineProperty(global, key, previous[key]); else delete global[key]; }
	}
};
const domTests = module.exports;
async function backendTests() {
	const os = require('node:os');
	const previousCwd = process.cwd(), previousLog = console.log, previousUploadRoot = process.env.UPLOAD_ROOT;
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-gym-editor-'));
	let fixture;
	try {
		process.chdir(temporary); console.log = () => {}; process.env.UPLOAD_ROOT = path.join(temporary, 'uploads');
		fixture = await require('./test-trainer-reservations.cjs').createFixture({ multipart: true });
		const backendRequire = require('node:module').createRequire(path.join(project, '../gymflow/package.json'));
		const collected = require('./check-graphql.cjs').collectDocuments();
		const documents = Object.fromEntries(collected.map((document) => [document.name, document.query]));
		const uploadDocument = collected.find((document) => path.basename(document.file) === 'GymImages.tsx' && document.name === 'inline-upload');
		assert(uploadDocument, 'Use the actual GymImages multipart document');
		const helper = load('libs/admin-gyms.ts');
		const dispatch = async (name, variables, actor = fixture.admin) => (await fetch(fixture.uri, {
			method: 'POST', headers: { 'Content-Type': 'application/json', 'Apollo-Require-Preflight': 'true', ...(actor ? { Authorization: 'Bearer ' + fixture.token(actor) } : {}) },
			body: JSON.stringify({ query: documents[name], variables }),
		})).json();
		const png = await backendRequire('sharp')({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
		const multipart = new FormData();
		multipart.append('operations', JSON.stringify({ query: uploadDocument.query, variables: { files: [null], target: 'gym' } }));
		multipart.append('map', JSON.stringify({ '0': ['variables.files.0'] })); multipart.append('0', new Blob([png], { type: 'image/png' }), 'fixture.png');
		const upload = await (await fetch(fixture.uri, { method: 'POST', headers: { 'Apollo-Require-Preflight': 'true', Authorization: 'Bearer ' + fixture.token(fixture.admin) }, body: multipart })).json();
		assert.equal(upload.errors, undefined); assert.equal(helper.gymImagesError(upload.data.imagesUploader), null);
		const payload = helper.gymPayload({ gymName: ' Disposable Gym ', gymLocation: 'SEOUL', gymAddress: ' 10 Fixture Street ', gymImages: upload.data.imagesUploader, gymDesc: null, gymPhone: null, openingHours: null, amenities: [] });
		const created = await dispatch('CREATE_GYM', { input: payload }); assert.equal(created.errors, undefined);
		const gym = created.data.createGym; assert.equal(gym.gymStatus, 'PAUSED'); assert.equal(gym.gymRevision, 0); assert.equal(gym.gymName, 'Disposable Gym'); assert.equal(gym.openingHours, null); assert(!('__v' in gym));
		const read = await dispatch('GET_GYM_BY_ADMIN', { gymId: gym._id }); assert.equal(read.errors, undefined); assert.equal(read.data.getGymByAdmin._id, gym._id);
		const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((dayOfWeek) => ({ dayOfWeek, isClosed: dayOfWeek !== 'MON', openTime: dayOfWeek === 'MON' ? '08:30' : null, closeTime: dayOfWeek === 'MON' ? '20:00' : null }));
		const updated = await dispatch('UPDATE_GYM_BY_ADMIN', { input: { ...payload, _id: gym._id, expectedRevision: 0, gymStatus: 'ACTIVE', openingHours: days, amenities: ['WIFI'] } });
		assert.equal(updated.errors, undefined); assert.equal(updated.data.updateGymByAdmin.gymRevision, 1); assert.equal(updated.data.updateGymByAdmin.gymStatus, 'ACTIVE'); assert.deepEqual(updated.data.updateGymByAdmin.openingHours, days);
		previousLog('PASS G3E disposable backend: actual secure Gym multipart upload, PAUSED create, typed detail read and revisioned ACTIVE update with seven-day hours');
		const stale = await dispatch('UPDATE_GYM_BY_ADMIN', { input: { _id: gym._id, expectedRevision: 0, gymName: 'Stale Name' } });
		assert.equal(helper.gymUpdateError({ graphQLErrors: stale.errors }), 'stale');
		await fixture.programs.updateOne({ _id: fixture.program._id }, { $set: { gymId: new fixture.db.base.Types.ObjectId(gym._id), programStatus: 'DELETE' } });
		const venue = await dispatch('UPDATE_GYM_BY_ADMIN', { input: { _id: gym._id, expectedRevision: 1, gymLocation: 'BUSAN', gymAddress: '99 Changed Street' } });
		assert.equal(helper.gymUpdateError({ graphQLErrors: venue.errors }), 'referenced-venue');
		const unchanged = await dispatch('GET_GYM_BY_ADMIN', { gymId: gym._id }); assert.equal(unchanged.data.getGymByAdmin.gymRevision, 1); assert.equal(unchanged.data.getGymByAdmin.gymAddress, payload.gymAddress);
		await fixture.db.model('Gym').updateOne({ _id: gym._id }, { $inc: { __v: 10 } });
		const paused = await dispatch('UPDATE_GYM_BY_ADMIN', { input: { _id: gym._id, expectedRevision: 1, gymStatus: 'PAUSED', amenities: [] } });
		assert.equal(paused.errors, undefined); assert.equal(paused.data.updateGymByAdmin.gymRevision, 2); assert.deepEqual(paused.data.updateGymByAdmin.amenities, []);
		previousLog('PASS G3E disposable backend: stale and DELETE-Program venue conflicts preserve state; internal __v changes do not replace business revision');
		for (const actor of [null, fixture.user, fixture.trainer]) {
			assert((await dispatch('GET_GYM_BY_ADMIN', { gymId: gym._id }, actor)).errors?.length);
			assert((await dispatch('CREATE_GYM', { input: payload }, actor)).errors?.length);
			assert((await dispatch('UPDATE_GYM_BY_ADMIN', { input: { _id: gym._id, expectedRevision: 2, gymName: 'Denied Name' } }, actor)).errors?.length);
		}
		for (const memberStatus of ['BLOCK', 'DELETE']) {
			await fixture.members.updateOne({ _id: fixture.admin._id }, { $set: { memberStatus } });
			assert((await dispatch('GET_GYM_BY_ADMIN', { gymId: gym._id })).errors?.length);
			assert((await dispatch('CREATE_GYM', { input: payload })).errors?.length);
			assert((await dispatch('UPDATE_GYM_BY_ADMIN', { input: { _id: gym._id, expectedRevision: 2, gymName: 'Denied Name' } })).errors?.length);
		}
		assert.equal(await fixture.db.model('Gym').countDocuments(), 1);
		previousLog('PASS G3E disposable backend: guest/non-admin/inactive ADMIN reads and writes denied; no extra Gyms created');
		await fixture.members.updateOne({ _id: fixture.admin._id }, { $set: { memberStatus: 'ACTIVE' } });
		const reservationSnapshot = JSON.stringify(await fixture.reservations.find().sort({ _id: 1 }).lean());
		const staleDelete = await dispatch('UPDATE_GYM_BY_ADMIN', { input: { _id: gym._id, expectedRevision: 1, gymStatus: 'DELETE' } });
		assert.equal(helper.gymUpdateError({ graphQLErrors: staleDelete.errors }), 'stale');
		assert.equal((await dispatch('GET_GYM_BY_ADMIN', { gymId: gym._id })).data.getGymByAdmin.gymStatus, 'PAUSED');
		const deleted = await dispatch('UPDATE_GYM_BY_ADMIN', { input: { _id: gym._id, expectedRevision: 2, gymStatus: 'DELETE' } });
		assert.equal(deleted.errors, undefined); const terminal = deleted.data.updateGymByAdmin;
		assert.equal(terminal.gymStatus, 'DELETE'); assert.equal(terminal.gymRevision, 3); assert(terminal.deletedAt); assert.equal(terminal.gymName, payload.gymName); assert.equal(terminal.gymAddress, payload.gymAddress);
		assert.deepEqual((await dispatch('GET_GYM_BY_ADMIN', { gymId: gym._id })).data.getGymByAdmin, terminal);
		const list = await dispatch('GET_ALL_GYMS_BY_ADMIN', { input: { page: 1, limit: 10, sort: 'createdAt', direction: 'DESC', search: { gymStatus: 'DELETE' } } });
		assert.equal(list.errors, undefined); assert.equal(list.data.getAllGymsByAdmin.list[0]._id, gym._id); assert.equal(list.data.getAllGymsByAdmin.list[0].gymStatus, 'DELETE');
		for (const gymStatus of ['ACTIVE', 'PAUSED', 'DELETE']) assert((await dispatch('UPDATE_GYM_BY_ADMIN', { input: { _id: gym._id, expectedRevision: 3, gymStatus } })).errors?.length);
		assert.equal(await fixture.db.model('Gym').countDocuments(), 1); assert.equal(JSON.stringify(await fixture.reservations.find().sort({ _id: 1 }).lean()), reservationSnapshot);
		previousLog('PASS G3F disposable backend: stale delete rejected; revisioned DELETE-only write; authoritative deleted detail/list; terminal restore/repeat denied; Gym and reservation history preserved');
		return 4;
	} finally {
		if (fixture) await fixture.stop();
		process.chdir(previousCwd); console.log = previousLog;
		if (previousUploadRoot === undefined) delete process.env.UPLOAD_ROOT; else process.env.UPLOAD_ROOT = previousUploadRoot;
		const resolved = path.resolve(temporary); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert(path.basename(resolved).startsWith('gymflow-gym-editor-'));
		fs.rmSync(resolved, { recursive: true, force: true });
	}
}
module.exports = async () => {
	const dom = await domTests();
	const backend = process.argv.includes('--dom-only') ? 0 : await backendTests();
	console.log(`${dom} G3E/G3F deterministic editor groups; ${backend} disposable Gym backend groups passed.`);
	return dom + backend;
};
if (require.main === module) module.exports().catch((error) => { console.error(error); process.exitCode = 1; });
