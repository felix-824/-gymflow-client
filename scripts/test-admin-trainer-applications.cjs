// Uses an owned disposable Nest/Mongo fixture; never reads application database connection settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
let checks = 0;
const output = console.log;
const pass = (name) => {
	checks++;
	output('PASS ' + name);
};
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file,
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2021,
			jsx: ts.JsxEmit.React,
			esModuleInterop: true,
		},
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('.')) {
			const target = path.resolve(path.dirname(file), name);
			if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(target, 'utf8'));
			return loadTs(fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache);
		}
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
		localRequire,
		module,
		module.exports,
	);
	return module.exports;
}
const helper = loadTs(path.join(__dirname, '../libs/admin-trainer-applications.ts'));
function unit() {
	const admin = { _id: 'admin', memberType: 'ADMIN', memberStatus: 'ACTIVE' };
	assert.equal(helper.adminTrainerApplicationsAccess(false, '', admin), 'initializing');
	assert.equal(helper.adminTrainerApplicationsAccess(true, 'failure', admin), 'Access error');
	assert.equal(helper.adminTrainerApplicationsAccess(true, '', admin), 'ready');
	for (const patch of [
		{ _id: '' },
		{ memberType: 'USER' },
		{ memberType: 'TRAINER' },
		{ memberStatus: 'BLOCK' },
		{ memberStatus: 'DELETE' },
	])
		assert.equal(helper.adminTrainerApplicationsAccess(true, '', { ...admin, ...patch }), 'Access denied');
	for (const value of [undefined, [], 'bad', 'a'.repeat(25)]) assert.equal(helper.trainerApplicationId(value), '');
	assert.equal(helper.trainerApplicationId('A'.repeat(24)), 'a'.repeat(24));
	for (const value of ['', '   ', 'x'.repeat(1001)]) assert.equal(helper.trainerReviewFeedbackValid(value), false);
	for (const value of [' x ', 'x'.repeat(1000)]) assert.equal(helper.trainerReviewFeedbackValid(value), true);
	assert.deepEqual(helper.trainerReviewPayload('a'.repeat(24), 'APPROVED', 'ignored'), {
		applicationId: 'a'.repeat(24),
		decision: 'APPROVED',
	});
	assert.equal(helper.trainerReviewPayload('a'.repeat(24), 'REJECTED', ' Feedback ').rejectionReason, 'Feedback');
	assert(helper.trainerReviewConflict({ graphQLErrors: [{ extensions: { originalError: { statusCode: 409 } } }] }));
	assert(
		helper.trainerReviewConflict({
			graphQLErrors: [{ message: 'Application already has a different review decision' }],
		}),
	);
	assert(!helper.trainerReviewConflict(new Error('private network details')));
	pass(
		'ACTIVE ADMIN access, safe IDs, trimmed feedback boundaries, exact decision payloads and conflict classification',
	);
}

async function integration() {
	const previousCwd = process.cwd(),
		previousLog = console.log;
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-admin-applications-'));
	const previousGlobals = Object.fromEntries(
		['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'Image'].map((key) => [
			key,
			Object.getOwnPropertyDescriptor(global, key),
		]),
	);
	let fixture, dom, root, client;
	try {
		process.chdir(temporary);
		console.log = () => {};
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const { print } = require('graphql');
		const backendRequire = require('node:module').createRequire(path.join(__dirname, '../../gymflow/package.json'));
		const { validate } = backendRequire('graphql');
		const { GraphQLSchemaHost } = backendRequire('@nestjs/graphql');
		const queries = loadTs(path.join(__dirname, '../apollo/admin/query.ts'));
		const mutations = loadTs(path.join(__dirname, '../apollo/admin/mutation.ts'));
		const operations = { ...queries, ...mutations };
		for (const name of [
			'GET_TRAINER_APPLICATIONS_BY_ADMIN',
			'GET_TRAINER_APPLICATION_BY_ADMIN',
			'REVIEW_TRAINER_APPLICATION',
		]) {
			assert.deepEqual(validate(fixture.app.get(GraphQLSchemaHost).schema, operations[name]), []);
			assert.doesNotMatch(
				print(operations[name]),
				/memberId|memberData|reviewedBy|reviewedAt|memberPhone|memberEmail|memberNick/,
			);
		}
		const direct = async (name, variables, member = fixture.admin) =>
			(
				await fetch(fixture.uri, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(member ? { Authorization: 'Bearer ' + fixture.token(member) } : {}),
					},
					body: JSON.stringify({ query: print(operations[name]), variables }),
				})
			).json();
		const applications = fixture.db.model('TrainerApplication');
		const pending = [];
		for (let i = 0; i < 13; i++) {
			const applicant = await fixture.members.create({
				memberNick: 'applicant-' + i,
				memberPassword: 'fixture',
				memberPhone: 'private-phone-' + i,
				memberType: 'USER',
			});
			pending.push(
				await applications.create({
					memberId: applicant._id,
					fullName: 'Applicant ' + String(i).padStart(2, '0'),
					categories: ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'YOGA', 'PILATES', 'CROSSFIT', 'CARDIO', 'REHAB'],
					experienceSummary: 'Applicant-submitted experience',
					bio: 'Applicant claims a certificate. <script>untrusted()</script>',
					status: 'PENDING',
					createdAt: new Date(Date.UTC(2026, 9, i + 1)),
				}),
			);
		}
		const approved = await applications.create({
			memberId: fixture.trainer._id,
			fullName: 'Approved Applicant',
			categories: ['YOGA'],
			experienceSummary: 'Actual experience',
			bio: 'Actual philosophy',
			status: 'APPROVED',
			reviewedBy: fixture.admin._id,
			reviewedAt: new Date(),
		});
		const rejected = await applications.create({
			memberId: fixture.user._id,
			fullName: 'Rejected Applicant',
			categories: ['PILATES'],
			experienceSummary: 'Actual rejected experience',
			bio: 'Actual rejected philosophy',
			status: 'REJECTED',
			rejectionReason: 'Please explain your approach.\nAdd relevant experience.',
			reviewedBy: fixture.admin._id,
			reviewedAt: new Date(),
		});
		const inquiry = { page: 1, limit: 10, search: { status: 'PENDING' } };
		const initial = await direct('GET_TRAINER_APPLICATIONS_BY_ADMIN', { input: inquiry });
		assert.equal(initial.errors, undefined);
		assert.equal(initial.data.getTrainerApplicationsByAdmin.metaCounter[0].total, 13);
		assert.equal(initial.data.getTrainerApplicationsByAdmin.list[0]._id, String(pending[12]._id));
		for (const actor of [null, fixture.user, fixture.trainer]) {
			assert((await direct('GET_TRAINER_APPLICATIONS_BY_ADMIN', { input: inquiry }, actor)).errors?.length);
			assert(
				(await direct('GET_TRAINER_APPLICATION_BY_ADMIN', { applicationId: String(pending[0]._id) }, actor)).errors
					?.length,
			);
			assert(
				(
					await direct(
						'REVIEW_TRAINER_APPLICATION',
						{ input: { applicationId: String(pending[0]._id), decision: 'APPROVED' } },
						actor,
					)
				).errors?.length,
			);
		}
		assert(
			(await direct('UPDATE_MEMBER_BY_ADMIN', { input: { _id: String(fixture.user._id), memberType: 'TRAINER' } }))
				.errors?.length,
		);
		assert.equal((await fixture.members.findById(fixture.user._id)).memberType, 'USER');
		pass(
			'frontend documents validate against the real schema, safe projections, real newest-first total, backend guards and generic promotion denial',
		);

		const { JSDOM } = require('jsdom');
		dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/trainer-applications' });
		Object.assign(global, {
			window: dom.window,
			document: dom.window.document,
			HTMLElement: dom.window.HTMLElement,
			DocumentFragment: dom.window.DocumentFragment,
			Image: dom.window.Image,
		});
		Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
		const React = require('react');
		const { ThemeProvider, createTheme } = require('@mui/material/styles');
		const { light } = loadTs(path.join(__dirname, '../scss/MaterialTheme/index.ts'));
		const theme = createTheme(light);
		const dialogStyles = document.createElement('style');
		dialogStyles.textContent = require('sass').compile(
			path.join(__dirname, '../scss/pc/admin/trainerApplications.scss'),
		).css;
		const { createRoot } = require('react-dom/client');
		const { flushSync } = require('react-dom');
		const { ApolloClient, ApolloLink, ApolloProvider, HttpLink, InMemoryCache } = require('@apollo/client');
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		let locale = 'en',
			session = 'session-1',
			fault = '',
			release,
			activeActor = fixture.admin;
		const router = { isReady: true, locale, pathname: '/_admin/trainer-applications', query: {} };
		const resources = Object.fromEntries(
			['en', 'kr', 'ru'].map((lng) => [
				lng,
				Object.fromEntries(
					['common', 'admin-trainer-applications'].map((ns) => [
						ns,
						JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', lng, ns + '.json'), 'utf8')),
					]),
				),
			]),
		);
		const i18n = require('i18next').createInstance();
		await i18n.init({ resources, lng: 'en', fallbackLng: false, initImmediate: false });
		for (const lng of ['en', 'kr', 'ru']) {
			assert.deepEqual(
				Object.keys(resources[lng]['admin-trainer-applications']).sort(),
				Object.keys(resources.en['admin-trainer-applications']).sort(),
			);
			for (const key of Object.keys(resources.en['admin-trainer-applications']))
				assert(i18n.exists(key, { lng, ns: 'admin-trainer-applications' }));
		}
		const messages = resources.en['admin-trainer-applications'];
		const requests = [];
		const transport = async (url, options) => {
			const request = JSON.parse(options.body);
			requests.push(request);
			if (fault === 'read-error' && request.operationName.startsWith('GetTrainerApplication'))
				throw new Error('private GraphQL stack detail');
			if (fault === 'hold-write' && request.operationName === 'ReviewTrainerApplication')
				await new Promise((resolve) => {
					release = resolve;
				});
			if (fault === 'before-write' && request.operationName === 'ReviewTrainerApplication')
				throw new Error('private network failure');
			const response = await fetch(url, options);
			if (fault === 'lost-write' && request.operationName === 'ReviewTrainerApplication') {
				await response.text();
				throw new Error('response lost after commit');
			}
			return response;
		};
		client = new ApolloClient({
			cache: new InMemoryCache(),
			link: new ApolloLink((operation, forward) => {
				operation.setContext({ headers: { Authorization: 'Bearer ' + fixture.token(activeActor) } });
				return forward(operation);
			}).concat(new HttpLink({ uri: fixture.uri, fetch: transport })),
		});
		const link = ({ href, children, passHref, shallow, replace, ...props }) =>
			React.createElement(
				'a',
				{ ...props, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) },
				children,
			);
		const mocks = {
			'../../../../apollo/store': store,
			'../../../auth': { getAuthSessionId: () => session },
			'next/router': { useRouter: () => router, withRouter: (component) => component },
			'next/link': { __esModule: true, default: link },
			'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(locale, ns), i18n }) },
			'../../hooks/useDeviceDetect': { __esModule: true, default: () => 'desktop' },
		};
		const List = loadTs(
			path.join(__dirname, '../libs/components/admin/trainer-applications/TrainerApplications.tsx'),
			mocks,
		).default;
		const Detail = loadTs(
			path.join(__dirname, '../libs/components/admin/trainer-applications/TrainerApplicationDetail.tsx'),
			mocks,
		).default;
		root = createRoot(document.getElementById('root'));
		let key = 0;
		const render = (Component, props = {}) =>
			flushSync(() =>
				root.render(
					React.createElement(
						React.StrictMode,
						null,
						React.createElement(
							ThemeProvider,
							{ theme },
							React.createElement(ApolloProvider, { client }, React.createElement(Component, { ...props, key })),
						),
					),
				),
			);
		const text = () => document.body.textContent;
		const until = async (condition) => {
			const start = Date.now();
			while (!condition()) {
				if (Date.now() - start > 12000) throw new Error('UI timeout: ' + text());
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		};
		const button = (label, scope = document) =>
			[...scope.querySelectorAll('button')].find((node) => node.textContent === label);
		const click = (label, scope) => {
			const node = button(label, scope);
			assert(node, label);
			flushSync(() => node.click());
		};
		const writes = () => requests.filter((request) => request.operationName === 'ReviewTrainerApplication');
		const setUser = (patch = {}) =>
			flushSync(() =>
				store.userVar({
					...store.emptyUser,
					_id: String(fixture.admin._id),
					memberType: 'ADMIN',
					memberStatus: 'ACTIVE',
					...patch,
				}),
			);
		store.authReadyVar(false);
		store.authErrorVar('');
		setUser();
		render(List);
		await until(() => text().includes(messages.initializing));
		assert.equal(requests.length, 0);
		setUser({ _id: '' });
		store.authReadyVar(true);
		for (const patch of [
			{ _id: '' },
			{ memberType: 'USER' },
			{ memberType: 'TRAINER' },
			{ memberStatus: 'BLOCK' },
			{ memberStatus: 'DELETE' },
		]) {
			setUser(patch);
			await until(() => text().includes(messages['Access denied']));
			assert.equal(requests.length, 0);
		}
		store.authErrorVar('private authentication error');
		setUser();
		await until(() => text().includes(messages['Access error']));
		assert.equal(requests.length, 0);
		router.isReady = false;
		store.authErrorVar('');
		render(List);
		assert.equal(requests.length, 0);
		pass('mounted unresolved auth/router, guests, USER/TRAINER and inactive ADMIN issue no Admin queries');
		router.isReady = true;
		render(List);
		await until(() => document.querySelectorAll('tbody tr').length === 10);
		assert.deepEqual(requests[0].variables.input, inquiry);
		assert.deepEqual(
			[...document.querySelectorAll('thead th')].map((node) => node.textContent),
			['Applicant', 'Specialties', 'Status', 'Submitted Date', 'Action'],
		);
		assert(text().includes('Showing 1–10 of 13'));
		assert.equal(document.querySelector('tbody tr').textContent.includes('Applicant 12'), true);
		for (const label of ['Weight loss', 'Muscle gain', 'Yoga', 'Pilates', 'CrossFit', 'Cardio', 'Rehabilitation'])
			assert(document.querySelector('tbody').textContent.includes(label));
		for (const row of pending) assert(!document.querySelector('tbody').textContent.includes(String(row._id)));
		assert.doesNotMatch(
			document.querySelector('tbody').textContent,
			/private-phone|@|Approve Trainer|Reject Application/,
		);
		assert.equal(document.querySelectorAll('tbody a').length, 10);
		assert(
			[...document.querySelectorAll('tbody a')].every(
				(node) =>
					node.textContent === 'Review' && node.href.includes('/_admin/trainer-applications/detail?applicationId='),
			),
		);
		assert.equal(document.querySelector('time').dateTime, pending[12].createdAt.toISOString());
		click('Approved');
		await until(() => document.querySelector('tbody').textContent.includes('Approved Applicant'));
		assert.equal(requests.at(-1).variables.input.search.status, 'APPROVED');
		assert.equal(document.querySelector('tbody a').textContent, 'View');
		click('Rejected');
		await until(() => document.querySelector('tbody').textContent.includes('Rejected Applicant'));
		assert.equal(requests.at(-1).variables.input.search.status, 'REJECTED');
		click('Pending');
		await until(() => document.querySelectorAll('tbody tr').length === 10);
		flushSync(() => document.querySelector('[aria-label="Next page"]').click());
		await until(() => document.querySelectorAll('tbody tr').length === 3);
		assert.equal(requests.at(-1).variables.input.page, 2);
		assert(text().includes('Showing 11–13 of 13'));
		click('Approved');
		await until(() => document.querySelector('tbody').textContent.includes('Approved Applicant'));
		assert.equal(requests.at(-1).variables.input.page, 1);
		pass(
			'real Pending default, three filters, exact columns/specialties/date, safe row links, factual total and zero/one-based pagination',
		);

		const showDetail = async (id, expected = 'PENDING') => {
			router.pathname = '/_admin/trainer-applications/detail';
			router.query = { applicationId: String(id) };
			key++;
			render(Detail);
			await until(
				() => document.querySelector('.admin-application-detail .admin-application-status')?.textContent === expected,
			);
		};
		await showDetail(pending[0]._id);
		assert.equal(document.querySelectorAll('.admin-application-back a').length, 1);
		assert.equal(document.querySelectorAll('.admin-application-decision').length, 1);
		assert(text().includes('Applicant claims a certificate. <script>untrusted()</script>'));
		assert.equal(document.querySelector('.admin-application-detail script'), null);
		assert.doesNotMatch(
			document.querySelector('.admin-application-detail').textContent,
			/private-phone|Account Role|verified|reviewedBy/,
		);
		assert(!document.querySelector('.admin-application-detail').textContent.includes(String(pending[0]._id)));
		assert.equal(document.querySelector('.admin-application-detail input, .admin-application-detail textarea'), null);
		const before = writes().length;
		click('Approve Trainer');
		await until(() => document.querySelector('[role="dialog"]'));
		assert.equal(writes().length, before);
		assert(text().includes(messages['Approve title']));
		assert(text().includes(messages['Approve copy']));
		click('Cancel', document.querySelector('[role="dialog"]'));
		await until(() => !document.querySelector('[role="dialog"]'));
		assert.equal(writes().length, before);
		click('Approve Trainer');
		await until(() => document.querySelector('[role="dialog"]'));
		fault = 'hold-write';
		const form = document.querySelector('[role="dialog"] form');
		flushSync(() => {
			for (let i = 0; i < 3; i++) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
		});
		await until(() => release);
		assert.equal(writes().length, before + 1);
		assert.deepEqual(writes().at(-1).variables.input, { applicationId: String(pending[0]._id), decision: 'APPROVED' });
		assert.equal(document.querySelector('.admin-application-status').textContent, 'PENDING');
		assert([...document.querySelectorAll('[role="dialog"] button')].every((node) => node.disabled));
		fault = '';
		release();
		release = undefined;
		await until(() => document.querySelector('.admin-application-status')?.textContent === 'APPROVED');
		assert.equal(document.querySelector('.admin-application-decision'), null);
		assert.equal((await fixture.members.findById(pending[0].memberId)).memberType, 'TRAINER');
		pass(
			'safe read-only content and escaped applicant claims; approval requires confirmation, cancels safely, locks duplicate submissions and displays backend approval',
		);

		await showDetail(pending[1]._id);
		click('Reject Application');
		await until(() => document.querySelector('#admin-review-feedback'));
		document.head.appendChild(dialogStyles);
		const textarea = document.querySelector('#admin-review-feedback');
		const feedbackLabel = document.querySelector('.admin-review-field > label[for="admin-review-feedback"]');
		assert(feedbackLabel, 'feedback needs a stable external label above the textarea');
		assert.equal(feedbackLabel.control, textarea);
		assert(feedbackLabel.textContent.includes(messages['Review feedback']));
		assert(feedbackLabel.textContent.includes('*'));
		assert.equal(document.querySelector('.admin-review-field .MuiInputLabel-root'), null);
		assert.equal(window.getComputedStyle(textarea.closest('.MuiOutlinedInput-root')).height, 'auto');
		assert.equal(window.getComputedStyle(textarea.closest('.MuiOutlinedInput-root')).paddingTop, '16.5px');
		assert.equal(window.getComputedStyle(document.querySelector('.admin-review-field fieldset')).top, '-5px');
		assert.equal(window.getComputedStyle(feedbackLabel).position, 'static');
		assert.equal(window.getComputedStyle(textarea).whiteSpace, 'pre-wrap');
		assert.equal(window.getComputedStyle(textarea).overflowWrap, 'anywhere');
		const feedback = (value) =>
			flushSync(() => {
				const node = document.querySelector('#admin-review-feedback');
				Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(node, value);
				node.dispatchEvent(new window.Event('input', { bubbles: true }));
			});
		const confirm = () =>
			flushSync(() =>
				document
					.querySelector('[role="dialog"] form')
					.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
			);
		const rejectionStart = writes().length;
		feedback('A long first line ' + 'x'.repeat(300) + '\nSecond line of constructive feedback.');
		assert.equal(textarea.value, 'A long first line ' + 'x'.repeat(300) + '\nSecond line of constructive feedback.');
		assert.equal(window.getComputedStyle(textarea.closest('.MuiOutlinedInput-root')).height, 'auto');
		pass(
			'real app theme and compiled dialog SCSS keep a required external label separate from an auto-height wrapping textarea',
		);
		for (const value of ['', '   ', 'x'.repeat(1001)]) {
			feedback(value);
			confirm();
			assert.equal(writes().length, rejectionStart);
			assert(document.querySelector('#admin-review-feedback').getAttribute('aria-invalid') === 'true');
		}
		feedback('x'.repeat(1000));
		assert(document.querySelector('#admin-review-counter').textContent.includes('1000 / 1000'));
		assert.equal(document.querySelector('#admin-review-feedback').maxLength, 1000);
		assert(document.querySelector('#admin-review-feedback').required);
		assert(
			document
				.querySelector('#admin-review-feedback')
				.getAttribute('aria-describedby')
				.includes('admin-review-counter'),
		);
		feedback('  Please describe your coaching approach.  ');
		fault = 'hold-write';
		confirm();
		confirm();
		await until(() => release);
		assert.equal(writes().length, rejectionStart + 1);
		assert.deepEqual(writes().at(-1).variables.input, {
			applicationId: String(pending[1]._id),
			decision: 'REJECTED',
			rejectionReason: 'Please describe your coaching approach.',
		});
		fault = '';
		release();
		release = undefined;
		await until(() => document.querySelector('.admin-application-status')?.textContent === 'REJECTED');
		assert(text().includes('Please describe your coaching approach.'));
		assert.equal(document.querySelector('.admin-application-decision'), null);
		pass(
			'reject dialog has required accessible feedback/counter; blank/whitespace/1001 fail, 1000 allowed, trimmed payload and duplicate lock; terminal feedback is read-only',
		);

		await showDetail(approved._id, 'APPROVED');
		assert.equal(document.querySelector('.admin-application-decision'), null);
		await showDetail(rejected._id, 'REJECTED');
		assert(text().includes(rejected.rejectionReason));
		assert.equal(document.querySelector('.admin-application-decision'), null);
		assert(!text().includes(String(fixture.admin._id)));
		assert.doesNotMatch(text(), /Reverse decision|Re-review|verified badge/);
		await showDetail(pending[2]._id);
		await direct('REVIEW_TRAINER_APPLICATION', {
			input: {
				applicationId: String(pending[2]._id),
				decision: 'REJECTED',
				rejectionReason: 'Reviewed by another administrator',
			},
		});
		const staleWrites = writes().length;
		click('Approve Trainer');
		await until(() => document.querySelector('[role="dialog"]'));
		click('Approve Trainer', document.querySelector('[role="dialog"]'));
		await until(() => text().includes(messages.Conflict));
		assert.equal(writes().length, staleWrites + 1);
		assert.equal(document.querySelector('.admin-application-status').textContent, 'PENDING');
		assert(button('Approve Trainer').disabled);
		assert(!text().includes('different review decision'));
		click('Refresh');
		await until(() => document.querySelector('.admin-application-status')?.textContent === 'REJECTED');
		assert(text().includes('Reviewed by another administrator'));
		assert.equal(writes().length, staleWrites + 1);
		assert.equal(document.querySelector('.admin-application-decision'), null);
		pass(
			'terminal routes have no decision controls; an actual stale conflicting review stays unconfirmed until explicit Refresh and never replays',
		);

		for (const [index, mode, expected] of [
			[3, 'lost-write', 'APPROVED'],
			[4, 'before-write', 'PENDING'],
		]) {
			await showDetail(pending[index]._id);
			const prior = writes().length;
			fault = mode;
			click('Approve Trainer');
			await until(() => document.querySelector('[role="dialog"]'));
			click('Approve Trainer', document.querySelector('[role="dialog"]'));
			await until(() => text().includes(messages.Uncertain));
			assert(button('Approve Trainer').disabled);
			assert.equal(writes().length, prior + 1);
			fault = 'read-error';
			click('Refresh');
			await until(() => text().includes(messages['Load error']));
			assert(button('Approve Trainer').disabled);
			assert.equal(writes().length, prior + 1);
			fault = '';
			click('Refresh');
			await until(
				() =>
					!text().includes(messages.Uncertain) &&
					document.querySelector('.admin-application-status')?.textContent === expected,
			);
			assert.equal(writes().length, prior + 1);
			if (expected === 'PENDING') assert(!button('Approve Trainer').disabled);
		}
		pass(
			'lost-after-commit and failed-before-write outcomes block decisions; failed recovery stays locked, successful read restores only appropriate actions without mutation replay',
		);

		await showDetail(pending[5]._id);
		fault = 'hold-write';
		click('Approve Trainer');
		await until(() => document.querySelector('[role="dialog"]'));
		click('Approve Trainer', document.querySelector('[role="dialog"]'));
		await until(() => release);
		await showDetail(pending[6]._id);
		fault = '';
		release();
		release = undefined;
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(document.querySelector('.admin-application-status').textContent, 'PENDING');
		assert(text().includes('Applicant 06'));
		setUser({ memberType: 'USER' });
		await until(() => text().includes(messages['Access denied']));
		assert.equal(document.querySelector('.admin-application-detail'), null);
		setUser();
		router.query = { applicationId: ['bad'] };
		key++;
		render(Detail);
		await until(() => text().includes(messages['Not found']));
		const invalidReads = requests.length;
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(requests.length, invalidReads);
		fault = 'read-error';
		key++;
		render(List);
		await until(() => text().includes(messages['Load error']));
		assert(!text().includes('private GraphQL stack'));
		fault = '';
		click('Retry');
		await until(() => document.querySelector('tbody a'));
		pass(
			'obsolete review completion cannot change a different detail; role loss hides private content, malformed IDs do not query, safe list errors recover',
		);

		for (locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			key++;
			render(List);
			await until(() => document.querySelector('tbody a'));
			const labels = resources[locale]['admin-trainer-applications'];
			assert.equal(document.querySelector('h1').textContent, labels.Title);
			assert.equal(document.querySelector('[role="tab"][aria-selected="true"]').textContent, labels.PENDING);
			for (const status of ['PENDING', 'APPROVED', 'REJECTED']) {
				const target = status === 'PENDING' ? pending[6] : status === 'APPROVED' ? approved : rejected;
				await showDetail(target._id, labels['Status ' + status]);
				assert.equal(document.querySelector('h1').textContent, labels['Detail title']);
				if (status === 'PENDING') {
					click(labels['Reject Application']);
					await until(() => document.querySelector('[role="dialog"]'));
					assert(text().includes(labels['Reject title']));
					assert(text().includes(labels['Feedback helper']));
					click(labels.Cancel, document.querySelector('[role="dialog"]'));
				}
			}
		}
		locale = 'en';
		router.locale = 'en';
		const Menu = loadTs(path.join(__dirname, '../libs/components/admin/AdminMenuList.tsx'), mocks).default;
		for (const lng of ['en', 'kr', 'ru']) {
			router.locale = lng;
			render(Menu, { router });
			assert.equal(
				document.querySelector('a[href="/_admin/trainer-applications"]').textContent,
				resources[lng]['admin-trainer-applications'].Title,
			);
		}
		pass(
			'EN/KR/RU namespaces and localized list/detail/reject dialog content resolve; navigation works on existing Admin pages without common.json additions',
		);

		const { MemberPanelList } = loadTs(path.join(__dirname, '../libs/components/admin/users/MemberList.tsx'), mocks);
		const actions = [];
		const MemberHarness = ({ memberType }) => {
			const [anchorEl, setAnchor] = React.useState({});
			return React.createElement(MemberPanelList, {
				members: [{ ...store.emptyUser, _id: 'a'.repeat(24), memberType, memberStatus: 'ACTIVE' }],
				anchorEl,
				menuIconClickHandler: (event, index) => setAnchor({ [index]: event.currentTarget }),
				menuIconCloseHandler: () => setAnchor({}),
				updateMemberHandler: (input) => actions.push(input),
			});
		};
		key++;
		render(MemberHarness, { memberType: 'USER' });
		click('USER');
		await until(() => document.querySelector('[role="menu"]'));
		assert(![...document.querySelectorAll('[role="menuitem"]')].some((node) => node.textContent === 'TRAINER'));
		assert([...document.querySelectorAll('[role="menuitem"]')].some((node) => node.textContent === 'ADMIN'));
		key++;
		render(MemberHarness, { memberType: 'TRAINER' });
		click('TRAINER');
		await until(() => document.querySelector('[role="menu"]'));
		assert([...document.querySelectorAll('[role="menuitem"]')].some((node) => node.textContent === 'USER'));
		key++;
		render(MemberHarness, { memberType: 'TRAINER' });
		click('ACTIVE');
		await until(() => document.querySelector('[role="menu"]'));
		flushSync(() =>
			[...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === 'BLOCK').click(),
		);
		assert.deepEqual(actions.at(-1), { _id: 'a'.repeat(24), memberStatus: 'BLOCK' });
		pass(
			'actual generic member menu removes only USER→TRAINER; ADMIN handling, TRAINER role display and status moderation remain functional',
		);

		await applications.deleteMany({ status: 'PENDING' });
		key++;
		render(List);
		await until(() => text().includes(messages['Empty PENDING']));
		assert.equal(document.querySelectorAll('tbody a').length, 0);
		pass('real empty Pending result displays the frozen restrained message and no invented totals or actions');
	} finally {
		if (root) require('react-dom').flushSync(() => root.unmount());
		client?.stop();
		dom?.window.close();
		for (const [key, descriptor] of Object.entries(previousGlobals)) {
			if (descriptor) Object.defineProperty(global, key, descriptor);
			else delete global[key];
		}
		await fixture?.stop();
		console.log = previousLog;
		process.chdir(previousCwd);
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
(async () => {
	unit();
	await integration();
	output(checks + ' Admin trainer application checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
