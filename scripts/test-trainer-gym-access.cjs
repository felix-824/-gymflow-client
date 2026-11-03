// Real React/MUI/Apollo with an in-memory transport; optional real isolated GraphQL/Mongo checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
function load(file, mocks = {}, cache = new Map()) {
	file = path.resolve(base, file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file,
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2021,
			jsx: ts.JsxEmit.ReactJSX,
			esModuleInterop: true,
		},
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
		(name) => {
			if (Object.hasOwn(mocks, name)) return mocks[name];
			if (!name.startsWith('.')) return require(name);
			const target = path.resolve(path.dirname(file), name);
			return load(fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache);
		},
		module,
		module.exports,
	);
	return module.exports;
}
let checks = 0;
const pass = (name) => {
	checks++;
	console.log('PASS ' + name);
};
const id = (n) => n.toString(16).padStart(24, '0');
const trainer = { _id: id(100), memberType: 'TRAINER', memberStatus: 'ACTIVE', memberNick: 'Fixture trainer' };
const gyms = Array.from({ length: 5 }, (_, index) => ({
	_id: id(index + 1),
	gymName: 'Active Gym ' + (index + 1),
	gymLocation: 'SEOUL',
	gymAddress: 'Test venue ' + (index + 1),
	gymDesc: null,
	gymImages: [],
	amenities: [],
	createdAt: '2026-10-01T00:00:00Z',
	updatedAt: '2026-10-01T00:00:00Z',
}));
function records() {
	return ['APPROVED', 'PENDING', 'REJECTED', 'REVOKED'].map((status, index) => ({
		_id: id(20 + index),
		gymId: gyms[index]._id,
		gymData: { _id: gyms[index]._id, gymName: gyms[index].gymName },
		status,
		relationshipType: ['WORKS_HERE', 'INDEPENDENT_TRAINER', 'FACILITY_PERMISSION', 'WORKS_HERE'][index],
		requestNote: 'I request venue access for coaching.',
		rejectionReason: status === 'REJECTED' ? 'Explain your relationship to this venue.' : null,
		revocationReason: status === 'REVOKED' ? 'Previous facility permission ended.' : null,
		reviewedAt: status !== 'PENDING' ? '2026-10-03T00:00:00Z' : null,
		revokedAt: status === 'REVOKED' ? '2026-10-04T00:00:00Z' : null,
		createdAt: '2026-10-02T00:00:00Z',
	}));
}
const helpers = load('libs/trainer-gym-access.ts');
function unit() {
	const valid = { gymId: id(1), relationshipType: 'WORKS_HERE', requestNote: '  Valid access request  ' };
	assert.deepEqual(helpers.gymAccessErrors(valid), {});
	pass('valid draft uses actual Gym/relationship contract');
	assert(helpers.gymAccessErrors({ ...valid, requestNote: '   ' }).requestNote);
	pass('request note required after trimming');
	assert(helpers.gymAccessErrors({ ...valid, requestNote: 'x'.repeat(9) }).requestNote);
	assert.equal(helpers.gymAccessErrors({ ...valid, requestNote: ' x'.trim().repeat(10) }).requestNote, undefined);
	pass('request note minimum 10 after trimming');
	assert.equal(helpers.gymAccessErrors({ ...valid, requestNote: 'x'.repeat(1000) }).requestNote, undefined);
	assert(helpers.gymAccessErrors({ ...valid, requestNote: 'x'.repeat(1001) }).requestNote);
	pass('request note inclusive 1000 maximum');
	for (const relationshipType of ['', 'Works at this gym', 'ADMIN'])
		assert(helpers.gymAccessErrors({ ...valid, relationshipType }).relationshipType);
	assert.deepEqual(helpers.gymAccessRelationships, ['WORKS_HERE', 'INDEPENDENT_TRAINER', 'FACILITY_PERMISSION']);
	pass('relationship labels cannot enter mutation payloads');
	assert.deepEqual(
		helpers.gymAccessPayload({ ...valid, trainerId: 'injected', status: 'APPROVED', previousAccessId: 'injected' }),
		{ gymId: id(1), relationshipType: 'WORKS_HERE', requestNote: 'Valid access request' },
	);
	pass('whitelisted payload excludes Trainer identity and server-owned fields');
	const history = records();
	assert.equal(
		helpers.gymAccessPayload({ ...valid, gymId: history[2].gymId }, history[2]).previousAccessId,
		history[2]._id,
	);
	assert.equal(
		helpers.gymAccessPayload({ ...valid, gymId: history[3].gymId }, history[3]).previousAccessId,
		history[3]._id,
	);
	pass('rejected and revoked requests reference the latest previousAccessId');
	assert.equal(helpers.gymAccessPayload(valid, history[2]).previousAccessId, undefined);
	assert.equal(helpers.gymAccessPayload(valid, history[0]).previousAccessId, undefined);
	pass('different Gym and operational records are never reapplication IDs');
}
async function domChecks() {
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			Object.fromEntries(
				['common', 'gyms', 'trainer-gym-access'].map((ns) => [
					ns,
					JSON.parse(fs.readFileSync(path.join(base, 'public/locales', locale, ns + '.json'), 'utf8')),
				]),
			),
		]),
	);
	for (const locale of ['kr', 'ru'])
		assert.deepEqual(
			Object.keys(resources[locale]['trainer-gym-access']),
			Object.keys(resources.en['trainer-gym-access']),
		);
	pass('scoped EN/KR/RU namespace parity without editing common.json');
	const i18n = require('i18next').createInstance();
	await i18n.init({
		resources,
		lng: 'en',
		fallbackLng: 'en',
		ns: ['common', 'gyms', 'trainer-gym-access'],
		interpolation: { escapeValue: false },
	});
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/mypage?category=gymAccess' });
	const names = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator'];
	const previous = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
	for (const name of names) Object.defineProperty(global, name, { value: dom.window[name], configurable: true });
	let root, client;
	try {
		const React = require('react'),
			{ createRoot } = require('react-dom/client'),
			{ flushSync } = require('react-dom');
		const apollo = require('@apollo/client'),
			mui = require('@mui/material');
		const store = {
			userVar: apollo.makeVar({}),
			authReadyVar: apollo.makeVar(false),
			authErrorVar: apollo.makeVar(''),
		};
		const router = {
			isReady: true,
			pathname: '/mypage',
			query: { category: 'gymAccess' },
			locale: 'en',
			push: async () => true,
			replace: async () => true,
		};
		let rows = records(),
			holdRead = false,
			holdMutation = false,
			failRead = false,
			failSubmit = false,
			pending = [],
			session = 'one';
		const operations = [],
			toasts = [];
		client = new apollo.ApolloClient({
			cache: new apollo.InMemoryCache(),
			link: new apollo.ApolloLink(
				(operation) =>
					new apollo.Observable((observer) => {
						operations.push({
							name: operation.operationName,
							variables: JSON.parse(JSON.stringify(operation.variables)),
						});
						const complete = () => {
							let data;
							if (operation.operationName === 'GetMyTrainerGymAccesses') {
								if (failRead) return observer.error(new Error('PRIVATE stack Admin secret'));
								const { page, limit, search } = operation.variables.input;
								const list = rows.filter((row) => !search.gymId || row.gymId === search.gymId);
								data = {
									getMyTrainerGymAccesses: {
										list: list.slice((page - 1) * limit, page * limit),
										metaCounter: [{ total: list.length }],
									},
								};
							} else if (operation.operationName === 'GetGyms') {
								const input = operation.variables.input;
								assert(!input.search.gymStatus, 'public getGyms owns ACTIVE eligibility');
								const list = gyms.filter((gym) => !input.search.text || gym.gymName.includes(input.search.text));
								data = { getGyms: { list, metaCounter: [{ total: list.length }] } };
							} else if (operation.operationName === 'GetGym')
								data = { getGym: gyms.find((gym) => gym._id === operation.variables.gymId) };
							else if (operation.operationName === 'SubmitTrainerGymAccess') {
								if (failSubmit) return observer.error(new Error('PRIVATE stack Admin secret'));
								const input = operation.variables.input;
								const row = {
									...records()[1],
									...input,
									_id: id(200 + rows.length),
									status: 'PENDING',
									gymData: gyms.find((gym) => gym._id === input.gymId),
								};
								rows = [row, ...rows];
								data = { submitTrainerGymAccess: row };
							} else assert.fail('Unexpected operation ' + operation.operationName);
							observer.next({ data });
							observer.complete();
						};
						if (
							(holdRead && operation.operationName === 'GetMyTrainerGymAccesses') ||
							(holdMutation && operation.operationName === 'SubmitTrainerGymAccess')
						) {
							pending.push(complete);
							return () => {};
						}
						const timer = setTimeout(complete, 5);
						return () => clearTimeout(timer);
					}),
			),
		});
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/link': {
				__esModule: true,
				default: React.forwardRef(function FixtureLink({ href, children, passHref, ...props }, ref) {
					return React.createElement(
						'a',
						{
							...props,
							ref,
							href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
						},
						children,
					);
				}),
			},
			'next/image': { __esModule: true, default: (props) => React.createElement('img', props) },
			'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(router.locale, ns), i18n }) },
			'../../../apollo/store': store,
			'../../auth': { getAuthSessionId: () => session, updateUserInfo: async () => {} },
			'../../sweetAlert': { sweetTopSmallSuccessAlert: async (text) => toasts.push(text) },
		};
		const Workspace = load('libs/components/mypage/TrainerGymAccess.tsx', mocks).default;
		root = createRoot(document.getElementById('root'));
		let instance = 0;
		const render = () =>
			flushSync(() =>
				root.render(
					React.createElement(
						mui.ThemeProvider,
						{ theme: mui.createTheme() },
						React.createElement(apollo.ApolloProvider, { client }, React.createElement(Workspace, { key: instance })),
					),
				),
			);
		const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
		const until = async (condition) => {
			for (let i = 0; i < 100; i++) {
				if (condition()) return;
				await tick();
			}
			assert.fail('DOM timeout: ' + document.body.textContent);
		};
		const click = (node) => {
			assert(node);
			flushSync(() => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
		};
		const button = (text) => [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
		const change = (selector, value) => {
			const node = document.querySelector(selector);
			assert(node);
			const proto =
				node.tagName === 'SELECT'
					? window.HTMLSelectElement.prototype
					: node.tagName === 'TEXTAREA'
					? window.HTMLTextAreaElement.prototype
					: window.HTMLInputElement.prototype;
			Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
			flushSync(() =>
				node.dispatchEvent(new window.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })),
			);
		};
		const submit = () =>
			flushSync(() =>
				document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
			);
		const loaded = () =>
			Boolean(document.querySelector('.gym-access-card, .gym-access-state')) &&
			!document.querySelector('.gym-access-loading');
		const remount = async () => {
			instance++;
			render();
			await until(loaded);
		};
		render();
		await tick();
		assert.equal(operations.length, 0);
		pass('unresolved authentication does not issue private queries');
		for (const memberType of ['USER', 'ADMIN']) {
			flushSync(() => {
				store.userVar({ ...trainer, memberType });
				store.authReadyVar(true);
			});
			await tick();
			assert.equal(operations.length, 0);
			assert(!document.querySelector('nav, form'));
		}
		pass('USER and ADMIN get harmless direct-category fallback without trainer navigation/actions');
		holdRead = true;
		flushSync(() => store.userVar(trainer));
		await until(() => document.querySelector('.gym-access-loading'));
		assert(!document.body.textContent.includes('No gym access requests yet'));
		pass('loading skeleton never flashes empty history');
		holdRead = false;
		pending.splice(0).forEach((finish) => finish());
		await until(() => document.querySelectorAll('.gym-access-card').length === 4);
		assert.equal(document.querySelectorAll('.schedule-desktop-navigation a[href*="gymAccess"]').length, 1);
		assert.equal(
			document.querySelectorAll('.schedule-mobile-navigation a[href*="gymAccess"][aria-current="page"]').length,
			1,
		);
		pass('Trainer desktop and mobile navigation select the existing gymAccess category');
		for (const status of ['APPROVED', 'PENDING', 'REJECTED', 'REVOKED']) {
			const card = document.querySelector('.status-' + status.toLowerCase()).closest('article');
			assert(card.textContent.includes(resources.en['trainer-gym-access']['Meaning ' + status]));
			pass(status + ' text and distinct status treatment');
		}
		assert(document.querySelector('.gym-access-reason').textContent.includes(records()[2].rejectionReason));
		pass('owner rejection reason displayed');
		assert(document.body.textContent.includes(records()[3].revocationReason));
		pass('owner revocation reason and historical dates displayed');
		for (const value of helpers.gymAccessRelationships)
			assert(document.body.textContent.includes(resources.en['trainer-gym-access']['Relationship ' + value]));
		pass('all relationship values render human-readable labels');
		assert(!document.body.textContent.includes(trainer._id));
		assert(!document.querySelector('script'));
		pass('no Admin identities or raw database IDs displayed');
		click(button('Request gym access'));
		await until(() => document.querySelectorAll('#gym-access-gym option').length === 6);
		assert.equal(document.activeElement.id, 'gym-access-search');
		pass('request action opens inline labeled form and focuses the first field');
		assert.equal(document.querySelector('#gym-access-note').maxLength, 1000);
		assert.equal(document.querySelector('#gym-access-note').value, '');
		pass('textarea has maxLength 1000 and no generated note');
		for (const gym of gyms.slice(0, 2))
			assert(document.querySelector(`#gym-access-gym option[value="${gym._id}"]`).disabled);
		pass('visible operational Gym options disabled and labeled');
		assert.equal(document.querySelectorAll('#gym-access-gym option:not([value=""])').length, 5);
		pass('existing public active-Gym query populates selector');
		submit();
		assert.equal(document.querySelector('#gym-access-gym').getAttribute('aria-invalid'), 'true');
		assert.equal(document.querySelectorAll('[aria-invalid="true"]').length, 3);
		pass('required Gym, relationship and note errors associate with fields');
		change('#gym-access-gym', gyms[4]._id);
		change('#gym-access-relationship', 'INDEPENDENT_TRAINER');
		change('#gym-access-note', 'Too short');
		await until(() => !button('Submit request').disabled);
		submit();
		assert.equal(document.querySelector('#gym-access-note').getAttribute('aria-invalid'), 'true');
		pass('short note blocked in real form');
		change('#gym-access-note', '  A meaningful request note.  ');
		holdMutation = true;
		submit();
		submit();
		await until(() => operations.filter((op) => op.name === 'SubmitTrainerGymAccess').length === 1);
		assert(button('Submitting…').disabled);
		assert(document.querySelector('fieldset').disabled);
		pass('synchronous lock and loading state prevent double submission');
		assert.deepEqual(operations.find((op) => op.name === 'SubmitTrainerGymAccess').variables.input, {
			gymId: gyms[4]._id,
			relationshipType: 'INDEPENDENT_TRAINER',
			requestNote: 'A meaningful request note.',
		});
		pass('mutation sends actual enum values and trimmed note only');
		holdMutation = false;
		pending.splice(0).forEach((finish) => finish());
		await until(() => !document.querySelector('form') && document.querySelectorAll('.gym-access-card').length === 5);
		assert.equal(toasts.length, 1);
		assert.equal(document.querySelectorAll('.status-pending').length, 2);
		pass('success closes form, uses existing toast, refetches and shows new PENDING');
		for (const index of [2, 3]) {
			const original = rows.find((row) => row._id === records()[index]._id);
			const before = JSON.stringify(original);
			const card = document.querySelector(`[data-access-id="${original._id}"]`);
			click([...card.querySelectorAll('button')].find((node) => node.textContent === 'Request again'));
			await until(
				() => document.querySelector('#gym-access-gym')?.value === original.gymId && !button('Submit request').disabled,
			);
			assert.equal(document.querySelector('#gym-access-note').value, '');
			change('#gym-access-note', 'Please review a new venue access request.');
			submit();
			await until(() => !document.querySelector('form'));
			const request = operations.filter((op) => op.name === 'SubmitTrainerGymAccess').at(-1);
			assert.equal(request.variables.input.previousAccessId, original._id);
			assert.equal(JSON.stringify(original), before);
			pass(original.status + ' Request Again creates a new record and preserves history');
		}
		rows = records();
		await remount();
		click(button('Request gym access'));
		await until(() => document.querySelectorAll('#gym-access-gym option').length === 6);
		change('#gym-access-gym', gyms[4]._id);
		change('#gym-access-relationship', 'FACILITY_PERMISSION');
		change('#gym-access-note', 'Keep this request draft when offline.');
		await until(() => !button('Submit request').disabled);
		failSubmit = true;
		submit();
		await until(() => button('Reload latest access'));
		assert.equal(document.querySelector('#gym-access-note').value, 'Keep this request draft when offline.');
		assert(!document.body.textContent.includes('PRIVATE'));
		assert(button('Submit request').disabled);
		pass('server failure preserves the draft, sanitizes feedback and requires reload');
		failSubmit = false;
		click(button('Reload latest access'));
		await until(() => !button('Submit request').disabled);
		click(button('Cancel'));
		assert.equal(document.activeElement, button('Request gym access'));
		pass('reload reconciles uncertain outcome; cancel returns focus to the request action');
		rows = [];
		await remount();
		assert(document.body.textContent.includes('No gym access requests yet'));
		assert(button('Request gym access'));
		pass('deliberate empty state with request action');
		failRead = true;
		await remount();
		assert(document.body.textContent.includes('Your gym access could not be loaded'));
		assert(!document.body.textContent.includes('PRIVATE'));
		failRead = false;
		click(button('Retry'));
		await until(() => document.body.textContent.includes('No gym access requests yet'));
		pass('recoverable sanitized history error and retry');
		rows = records();
		rows[0].gymData.gymName = 'LongVenue'.repeat(40);
		rows[2].rejectionReason = '<script>untrusted()</script>' + 'reason'.repeat(200);
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			await i18n.changeLanguage(locale);
			await remount();
			assert(document.querySelector('h1').textContent === resources[locale]['trainer-gym-access'].Title);
			assert.equal(document.querySelectorAll('.gym-access-card').length, 4);
			assert(!document.querySelector('.gym-access-card script'));
		}
		pass('EN/KR/RU real rendering, full long content and React text escaping');
		const page = fs.readFileSync(path.join(base, 'pages/mypage/index.tsx'), 'utf8');
		assert.match(page, /category === 'gymAccess'\) return <TrainerGymAccess/);
		assert.match(page, /category !== 'gymAccess'/);
		assert(page.includes("['common', 'trainer-application', 'trainer-gym-access', 'gyms']"));
		assert.match(
			fs.readFileSync(path.join(base, 'libs/components/layout/LayoutBasic.tsx'), 'utf8'),
			/trainerGymAccess.*trainer-gym-access-layout/,
		);
		pass('direct navigation/refresh keeps category route, modern shell and scoped translations');
		const styles = fs.readFileSync(path.join(base, 'scss/pc/mypage/trainerGymAccess.scss'), 'utf8');
		for (const fragment of [
			'overflow-wrap: anywhere',
			'max-width: 767px',
			'max-width: 900px',
			'minmax(0, 1fr)',
			'focus-visible',
			'grid-auto-columns',
		])
			assert(styles.includes(fragment));
		pass('responsive source provides wrapping, stacked cards/form, six mobile destinations and visible focus');
		router.locale = 'en';
		await i18n.changeLanguage('en');
		const newer = Array.from({ length: 8 }, (_, index) => ({ ...records()[2], _id: id(400 + index) }));
		rows = [...newer, { ...records()[1], _id: id(499), gymId: gyms[4]._id, gymData: gyms[4] }];
		await remount();
		click(button('Request gym access'));
		await until(() => document.querySelectorAll('#gym-access-gym option').length === 6);
		assert.equal(document.querySelector(`#gym-access-gym option[value="${gyms[4]._id}"]`).disabled, false);
		change('#gym-access-gym', gyms[4]._id);
		await until(() => document.body.textContent.includes('Another request cannot be submitted'));
		assert(button('Submit request').disabled);
		pass('latest selected-Gym query blocks operational duplicates outside the current history page');
		click(button('Cancel'));
		click(document.querySelector('[aria-label="Go to next page"]'));
		await until(() => document.querySelectorAll('.gym-access-card').length === 1);
		assert(document.querySelector('.status-pending'));
		pass('history pagination preserves older operational records without collapsing history');
		rows = records();
		await remount();
		click(button('Request gym access'));
		await until(() => document.querySelectorAll('#gym-access-gym option').length === 6);
		change('#gym-access-gym', gyms[4]._id);
		change('#gym-access-relationship', 'WORKS_HERE');
		change('#gym-access-note', 'A request made before changing account.');
		await until(() => !button('Submit request').disabled);
		holdMutation = true;
		const toastCount = toasts.length;
		submit();
		await until(() => pending.length > 0);
		flushSync(() => {
			session = 'two';
			store.userVar({ ...trainer, memberType: 'USER' });
		});
		holdMutation = false;
		pending.splice(0).forEach((finish) => finish());
		await tick();
		assert(!document.querySelector('form, .gym-access-card'));
		assert.equal(toasts.length, toastCount);
		pass('late submission receipt cannot re-open private state or toast after role/session changes');
		const { print } = require('graphql');
		const queries = load('apollo/user/query.ts'),
			mutations = load('apollo/user/mutation.ts');
		for (const document of [queries.GET_MY_TRAINER_GYM_ACCESSES, mutations.SUBMIT_TRAINER_GYM_ACCESS])
			assert(
				!/reviewedBy|revokedBy|trainerId|ByAdmin|reviewTrainerGymAccess|revokeTrainerGymAccess|__v/.test(
					print(document),
				),
			);
		pass('owner operations omit Admin fields and moderation operations');
	} finally {
		root?.unmount();
		client?.stop();
		dom.window.close();
		for (const [name, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(global, name, descriptor);
			else delete global[name];
		}
	}
}
async function integration() {
	const os = require('node:os'),
		Module = require('node:module');
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-gym-access-test-'));
	const previousCwd = process.cwd(),
		previousLog = console.log;
	let fixture;
	try {
		process.chdir(temporary);
		console.log = () => {};
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const backRequire = Module.createRequire(path.join(base, '../gymflow/package.json'));
		const schema = fixture.app.get(backRequire('@nestjs/graphql').GraphQLSchemaHost).schema;
		const { parse, validate } = backRequire('graphql');
		const documents = require('./check-graphql.cjs').collectDocuments();
		for (const document of documents)
			assert.deepEqual(
				validate(schema, parse(document.query)).map((error) => error.message),
				[],
				document.name,
			);
		previousLog('PASS ' + documents.length + ' frontend GraphQL documents validate against real current Nest schema');
		checks++;
		const db = fixture.db,
			gymModel = db.model('Gym'),
			accessModel = db.model('TrainerGymAccess');
		const gym = await gymModel.create({
			gymName: 'Isolated access test venue',
			gymLocation: 'SEOUL',
			gymAddress: 'Isolated test address',
			gymImages: ['uploads/gym/12345678-1234-4123-8123-123456789abc.webp'],
			gymStatus: 'ACTIVE',
		});
		const input = {
			gymId: String(gym._id),
			relationshipType: 'FACILITY_PERMISSION',
			requestNote: '  Permission for my coaching sessions.  ',
		};
		for (const member of [null, fixture.user, fixture.admin])
			assert((await fixture.gql('SUBMIT_TRAINER_GYM_ACCESS', input, member)).errors?.length);
		const first = await fixture.gql('SUBMIT_TRAINER_GYM_ACCESS', input);
		assert.equal(first.errors, undefined);
		assert.equal(first.data.submitTrainerGymAccess.status, 'PENDING');
		assert.equal(first.data.submitTrainerGymAccess.requestNote, input.requestNote.trim());
		assert((await fixture.gql('SUBMIT_TRAINER_GYM_ACCESS', input)).errors?.length);
		previousLog('PASS real owner submission, trimming, role denial and duplicate rejection');
		checks++;
		for (const status of ['REJECTED', 'REVOKED']) {
			const latest = await accessModel
				.findOne({ trainerId: fixture.trainer._id, gymId: gym._id })
				.sort({ createdAt: -1, _id: -1 });
			await accessModel.updateOne(
				{ _id: latest._id },
				{
					$set: {
						status,
						...(status === 'REJECTED'
							? { rejectionReason: 'More detail requested.' }
							: { revocationReason: 'Permission ended.' }),
					},
				},
			);
			const before = await accessModel.findById(latest._id).lean();
			const result = await fixture.gql('SUBMIT_TRAINER_GYM_ACCESS', { ...input, previousAccessId: String(latest._id) });
			assert.equal(result.errors, undefined);
			assert.notEqual(result.data.submitTrainerGymAccess._id, String(latest._id));
			assert.deepEqual(await accessModel.findById(latest._id).lean(), before);
		}
		const history = await fixture.gql('GET_MY_TRAINER_GYM_ACCESSES', { page: 1, limit: 8, search: {} });
		assert.equal(history.errors, undefined);
		assert.equal(history.data.getMyTrainerGymAccesses.list.length, 3);
		assert(history.data.getMyTrainerGymAccesses.list.some((row) => row.rejectionReason));
		assert(history.data.getMyTrainerGymAccesses.list.some((row) => row.revocationReason));
		previousLog('PASS real rejected/revoked reapply creates new records and owner history/reasons remain intact');
		checks++;
	} finally {
		if (fixture) await fixture.stop();
		console.log = previousLog;
		process.chdir(previousCwd);
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5 });
	}
}
module.exports = { records, gyms, trainer };
if (require.main === module)
	(async () => {
		unit();
		await domChecks();
		if (process.argv.includes('--integration')) await integration();
		console.log(checks + ' Trainer Gym Access checks passed. Application databases were not used.');
	})().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
