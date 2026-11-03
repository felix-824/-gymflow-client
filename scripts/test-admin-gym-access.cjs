// Real React/MUI/Apollo with controlled transport; backend writes use owned disposable Mongo only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
function load(file, mocks = {}, cache = new Map()) {
	file = path.resolve(base, file);
	if (cache.has(file)) return cache.get(file);
	if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
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
			return load(
				name.endsWith('.json') ? target : fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx',
				mocks,
				cache,
			);
		},
		module,
		module.exports,
	);
	return module.exports;
}
const id = (value) => value.toString(16).padStart(24, '0');
const admin = {
	_id: id(900),
	memberType: 'ADMIN',
	memberStatus: 'ACTIVE',
	memberNick: 'Fixture administrator',
	memberImage: '',
};
function records() {
	return ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'].flatMap((status, group) =>
		Array.from({ length: group === 0 ? 13 : 1 }, (_, index) => ({
			_id: id(group * 100 + index + 1),
			status,
			relationshipType: ['WORKS_HERE', 'INDEPENDENT_TRAINER', 'FACILITY_PERMISSION'][index % 3],
			requestNote: 'Permission to coach at this venue.\nPlease review the proposed relationship.',
			createdAt: '2026-10-01T00:00:00Z',
			reviewedAt: status !== 'PENDING' ? '2026-10-02T00:00:00Z' : null,
			revokedAt: status === 'REVOKED' ? '2026-10-03T00:00:00Z' : null,
			rejectionReason: status === 'REJECTED' ? 'Please clarify your venue relationship.' : null,
			revocationReason: status === 'REVOKED' ? 'Facility permission ended.' : null,
			trainerData: {
				_id: id(1000 + index),
				memberFullName: 'Fixture Trainer ' + (index + 1),
				memberNick: 'fixture-trainer-' + index,
				memberImage: '',
				memberType: 'TRAINER',
				memberStatus: 'ACTIVE',
			},
			gymData: {
				_id: id(2000 + index),
				gymName: 'Fixture Gym ' + (index + 1),
				gymStatus: 'ACTIVE',
				gymLocation: 'SEOUL',
				gymAddress: 'Fixture physical address ' + index,
				gymImage: null,
			},
		})),
	);
}
let checks = 0;
const output = console.log;
const pass = (name) => {
	checks++;
	output('PASS ' + name);
};
function unit() {
	const helper = load('libs/admin-gym-access.ts');
	assert.equal(helper.gymAccessId([id(1)]), '');
	assert.equal(helper.gymAccessId('bad'), '');
	assert.equal(helper.gymAccessId('A'.repeat(24)), 'a'.repeat(24));
	assert.deepEqual(helper.readAdminGymAccessInquiry(undefined), { page: 1, limit: 10, search: { status: 'PENDING' } });
	assert.deepEqual(
		helper.readAdminGymAccessInquiry(
			JSON.stringify({
				page: 2,
				limit: 20,
				sort: 'bad',
				trainerId: id(8),
				search: { status: 'REVOKED', trainerId: id(3), gymId: id(4), text: 'ignored' },
			}),
		),
		{ page: 2, limit: 20, search: { status: 'REVOKED', trainerId: id(3), gymId: id(4) } },
	);
	pass('validated route IDs, Pending default and exact backend filter/pagination whitelist');
	for (const reason of ['', '  ', 'x'.repeat(1001)]) assert(!helper.gymAccessReasonValid(reason));
	for (const reason of ['x', ' x ', 'x'.repeat(1000)]) assert(helper.gymAccessReasonValid(reason));
	pass('required trimmed reasons, inclusive 1/1000 bounds and whitespace rejection');
	assert.deepEqual(helper.gymAccessReviewPayload(id(1), 'APPROVED', 'discard'), {
		accessId: id(1),
		decision: 'APPROVED',
	});
	assert.deepEqual(helper.gymAccessReviewPayload(id(1), 'REJECTED', ' reason '), {
		accessId: id(1),
		decision: 'REJECTED',
		rejectionReason: 'reason',
	});
	assert.deepEqual(helper.gymAccessRevokePayload(id(1), ' reason '), { accessId: id(1), revocationReason: 'reason' });
	pass('mutation payloads send only accessId/decision/exact reason field; approval omits rejectionReason');
	for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'])
		for (const decision of ['APPROVED', 'REJECTED', 'REVOKED'])
			assert.equal(
				helper.gymAccessActionAllowed(status, decision),
				status === 'PENDING' ? decision !== 'REVOKED' : status === 'APPROVED' && decision === 'REVOKED',
			);
	pass('all source/decision presentation boundaries; historical records have no actions');
	assert.equal(helper.gymAccessModerationError(new Error('offline')), 'Uncertain');
	assert.equal(
		helper.gymAccessModerationError({
			graphQLErrors: [{ message: 'Access already has a different or inconsistent decision' }],
		}),
		'Conflict',
	);
	assert.equal(
		helper.gymAccessModerationError({
			graphQLErrors: [{ message: 'An active TRAINER account is required for approval' }],
		}),
		'Eligibility',
	);
	pass('bounded concurrency, eligibility and uncertain-outcome classification');
	const { parse, visit } = require('graphql');
	const docs = require('./check-graphql.cjs')
		.collectDocuments()
		.filter((doc) => /TRAINER_GYM_ACCESS/.test(doc.name) && doc.file.includes(path.join('apollo', 'admin')));
	assert.equal(docs.length, 4);
	for (const doc of docs)
		visit(parse(doc.query), {
			Field(node) {
				assert(
					!['reviewedBy', 'revokedBy', '__v', 'memberPassword', 'memberPhone', 'authSessions'].includes(
						node.name.value,
					),
				);
			},
		});
	pass('four actual Admin documents select bounded summaries and omit reviewer/security fields');
	const resources = ['en', 'kr', 'ru'].map((locale) =>
		JSON.parse(fs.readFileSync(path.join(base, 'public/locales', locale, 'admin-gym-access.json'), 'utf8')),
	);
	const keys = (obj) =>
		Object.entries(obj)
			.flatMap(([key, value]) => (typeof value === 'object' ? keys(value).map((child) => key + '.' + child) : [key]))
			.sort();
	for (const resource of resources) assert.deepEqual(keys(resource), keys(resources[0]));
	const css = require('sass').compile(path.join(base, 'scss/pc/admin/gymAccess.scss')).css;
	for (const text of [
		'overflow-wrap: anywhere',
		'min-height: 44px',
		'grid-template-columns: minmax(0, 1fr)',
		'.admin-access-dialog',
	])
		assert(css.includes(text));
	pass('EN/KR/RU key parity and compiled scoped responsive/focus/dialog styles');
}
async function domChecks() {
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/gym-access' });
	const names = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator'];
	const previous = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
	for (const key of names) Object.defineProperty(global, key, { value: dom.window[key], configurable: true });
	const React = require('react'),
		apollo = require('@apollo/client'),
		mui = require('@mui/material');
	const { createRoot } = require('react-dom/client'),
		{ flushSync } = require('react-dom');
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{
				'admin-gym-access': JSON.parse(
					fs.readFileSync(path.join(base, 'public/locales', locale, 'admin-gym-access.json'), 'utf8'),
				),
			},
		]),
	);
	await i18n.init({
		resources,
		lng: 'en',
		ns: ['admin-gym-access'],
		defaultNS: 'admin-gym-access',
		initImmediate: false,
	});
	const store = {
		userVar: apollo.makeVar(admin),
		authReadyVar: apollo.makeVar(true),
		authErrorVar: apollo.makeVar(''),
	};
	const router = {
		isReady: true,
		pathname: '/_admin/gym-access',
		query: {},
		locale: 'en',
		events: new (require('node:events').EventEmitter)(),
		push: async () => true,
	};
	let rows = records(),
		width = 1440,
		session = 'one',
		listFailure = false,
		detailFailure = false,
		holdRead = false,
		holdWrite = false,
		mode = '',
		pending = [],
		toasts = [],
		mountKey = 0;
	const operations = [];
	const client = new apollo.ApolloClient({
		cache: new apollo.InMemoryCache(),
		link: new apollo.ApolloLink(
			(operation) =>
				new apollo.Observable((observer) => {
					const name = operation.operationName,
						input = operation.variables.input;
					operations.push({ name, variables: JSON.parse(JSON.stringify(operation.variables)) });
					const complete = () => {
						let data;
						const fail = (message, statusCode = 409) => {
							observer.next({ errors: [{ message, extensions: { originalError: { statusCode } } }] });
							observer.complete();
						};
						if (name === 'GetTrainerGymAccessesByAdmin') {
							if (listFailure) return observer.error(new Error('PRIVATE server diagnostics'));
							assert.deepEqual(Object.keys(input).sort(), ['limit', 'page', 'search']);
							assert(Object.keys(input.search).every((key) => ['status', 'trainerId', 'gymId'].includes(key)));
							const list = rows.filter(
								(row) =>
									(!input.search.status || row.status === input.search.status) &&
									(!input.search.trainerId || row.trainerData?._id === input.search.trainerId) &&
									(!input.search.gymId || row.gymData?._id === input.search.gymId),
							);
							data = {
								getTrainerGymAccessesByAdmin: {
									list: list.slice((input.page - 1) * input.limit, input.page * input.limit),
									metaCounter: [{ total: list.length }],
								},
							};
						} else if (name === 'GetTrainerGymAccessByAdmin') {
							if (detailFailure) return observer.error(new Error('PRIVATE detail diagnostics'));
							data = { getTrainerGymAccessByAdmin: rows.find((row) => row._id === operation.variables.accessId) };
						} else if (['ReviewTrainerGymAccess', 'RevokeTrainerGymAccess'].includes(name)) {
							const row = rows.find((row) => row._id === input.accessId);
							if (mode === 'conflict') {
								Object.assign(row, { status: 'APPROVED', reviewedAt: '2026-11-01T00:00:00Z' });
								return fail('Access already has a different or inconsistent decision');
							}
							if (mode === 'eligibility') {
								row.trainerData.memberStatus = 'BLOCK';
								return fail('An active TRAINER account is required for approval', 403);
							}
							if (mode === 'failure') return fail('PRIVATE moderation diagnostics', 400);
							if (mode === 'lost-unpersisted') return observer.error(new Error('Response lost'));
							if (name === 'RevokeTrainerGymAccess')
								Object.assign(row, {
									status: 'REVOKED',
									revokedAt: '2026-11-02T00:00:00Z',
									revocationReason: input.revocationReason,
								});
							else
								Object.assign(row, {
									status: input.decision,
									reviewedAt: '2026-11-01T00:00:00Z',
									rejectionReason: input.rejectionReason ?? null,
								});
							if (mode === 'lost') return observer.error(new Error('Response lost after commit'));
							data = { [name === 'RevokeTrainerGymAccess' ? 'revokeTrainerGymAccess' : 'reviewTrainerGymAccess']: row };
						} else assert.fail('Unexpected operation ' + name);
						observer.next({ data });
						observer.complete();
					};
					if ((holdRead && name.startsWith('Get')) || (holdWrite && !name.startsWith('Get'))) {
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
		'next/head': { __esModule: true, default: () => null },
		'next/link': {
			__esModule: true,
			default: React.forwardRef(function FixtureLink({ href, children, passHref, legacyBehavior, ...props }, ref) {
				const url = typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query);
				return legacyBehavior
					? React.cloneElement(children, { ...props, href: url, ref })
					: React.createElement('a', { ...props, href: url, ref }, children);
			}),
		},
		'next-i18next': { useTranslation: (namespace) => ({ t: i18n.getFixedT(router.locale, namespace) }) },
		'@mui/material': {
			...mui,
			useMediaQuery: (query) =>
				query.includes('min-width') ? width >= Number(query.match(/\d+/)[0]) : width <= Number(query.match(/\d+/)[0]),
		},
		'../../../../apollo/store': store,
		'../../../apollo/store': store,
		'../../../auth': { getAuthSessionId: () => session },
		'../../auth': { getAuthSessionId: () => session },
		'../../../sweetAlert': { sweetTopSmallSuccessAlert: async (message) => toasts.push(message) },
	};
	const List = load('libs/components/admin/gym-access/GymAccessList.tsx', mocks).default;
	const Detail = load('libs/components/admin/gym-access/GymAccessDetail.tsx', mocks).default;
	const Menu = load('libs/components/admin/AdminMenuList.tsx', mocks).default;
	const root = createRoot(document.getElementById('root'));
	const render = (Component) =>
		flushSync(() =>
			root.render(
				React.createElement(
					mui.ThemeProvider,
					{ theme: mui.createTheme() },
					React.createElement(apollo.ApolloProvider, { client }, React.createElement(Component, { key: ++mountKey })),
				),
			),
		);
	const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
	const until = async (fn) => {
		const start = Date.now();
		while (!fn()) {
			if (Date.now() - start > 8000) assert.fail('DOM timeout: ' + document.body.textContent);
			await tick();
		}
	};
	const text = () => document.body.textContent;
	const button = (label) => [...document.querySelectorAll('button')].find((node) => node.textContent === label);
	const click = (node) => {
		assert(node);
		flushSync(() => node.click());
	};
	const change = (selector, value) => {
		const node = document.querySelector(selector);
		assert(node);
		const proto =
			node.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
		flushSync(() => node.dispatchEvent(new window.Event('input', { bubbles: true })));
	};
	const submit = () =>
		flushSync(() =>
			document
				.querySelector('[role=dialog] form')
				.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
		);
	const detail = async (row) => {
		router.query = { id: row._id };
		router.pathname = '/_admin/gym-access/detail';
		render(Detail);
		await until(
			() =>
				document.querySelector('.access-detail-surface') &&
				!document.querySelector('.access-detail-surface[aria-busy=true]'),
		);
	};
	const writes = () => operations.filter((op) => !op.name.startsWith('Get'));
	try {
		render(Menu);
		assert(document.querySelector('a[href="/_admin/gym-access"]'));
		pass('Admin navigation exposes Gym Access Requests next to Trainer Applications');
		for (const account of [
			{ ...admin, memberType: 'USER' },
			{ ...admin, memberType: 'TRAINER' },
			{ ...admin, memberStatus: 'BLOCK' },
		]) {
			store.userVar(account);
			const count = operations.length;
			render(List);
			await tick();
			assert.equal(operations.length, count);
			assert(!document.querySelector('.access-list'));
		}
		pass('USER/TRAINER/inactive Admin cannot mount list queries or moderation surface');
		store.userVar(admin);
		store.authReadyVar(false);
		render(List);
		assert(text().includes('Checking administrator'));
		store.authReadyVar(true);
		await until(() => document.querySelectorAll('[data-access-id]').length === 10);
		assert.equal(operations.at(-1).variables.input.search.status, 'PENDING');
		pass('auth restoration and Pending default use real Admin list operation');
		click(document.querySelector('[aria-label="Next page"]'));
		await until(() => document.querySelectorAll('[data-access-id]').length === 3);
		assert.equal(operations.at(-1).variables.input.page, 2);
		pass('server pagination uses metaCounter and bounded pages');
		for (const status of ['APPROVED', 'REJECTED', 'REVOKED']) {
			click(
				[...document.querySelectorAll('[role=tab]')].find(
					(node) => node.textContent === resources.en['admin-gym-access'].status[status],
				),
			);
			await until(() => document.querySelectorAll('[data-access-id]').length === 1);
			assert.equal(operations.at(-1).variables.input.search.status, status);
			pass(status + ' filter is sent to backend');
		}
		click([...document.querySelectorAll('[role=tab]')].find((node) => node.textContent === 'All'));
		await until(() => document.querySelectorAll('[data-access-id]').length === 10);
		assert(!operations.at(-1).variables.input.search.status);
		pass('ALL omits status and uses server totals');
		change('#access-trainer-filter', 'invalid');
		const readCount = operations.length;
		flushSync(() =>
			document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
		);
		assert.equal(operations.length, readCount);
		assert(document.querySelector('#access-trainer-filter').getAttribute('aria-invalid') === 'true');
		change('#access-trainer-filter', rows[2].trainerData._id);
		change('#access-gym-filter', rows[2].gymData._id);
		click(button('Apply filters'));
		await until(() => document.querySelectorAll('[data-access-id]').length === 1);
		assert.equal(operations.at(-1).variables.input.search.trainerId, rows[2].trainerData._id);
		pass('exact Trainer/Gym ID filters, validation and reset-to-page-one');
		click(button('Clear ID filters'));
		await until(() => document.querySelectorAll('[data-access-id]').length === 10);
		pass('clear ID filters restores actual backend result');
		listFailure = true;
		router.query = {};
		render(List);
		await until(() => button('Retry'));
		assert(!text().includes('PRIVATE'));
		listFailure = false;
		click(button('Retry'));
		await until(() => document.querySelectorAll('[data-access-id]').length === 10);
		pass('list error stays bounded and Retry recovers inside workspace');
		const savedRows = rows;
		rows = [];
		render(List);
		await until(() => text().includes('No pending gym access requests.'));
		rows = savedRows;
		pass('intentional Pending empty state is distinct from errors');
		rows = savedRows.slice(0, 2);
		router.query = { input: JSON.stringify({ page: 2, limit: 10, search: { status: 'PENDING' } }) };
		render(List);
		await until(() => document.querySelectorAll('[data-access-id]').length === 2);
		assert.equal(operations.at(-1).variables.input.page, 1);
		rows = savedRows;
		router.query = {};
		pass('server totals correct an emptied last page before presenting an empty result');
		width = 768;
		render(List);
		await until(() => document.querySelector('.access-mobile-list'));
		assert(!document.querySelector('table'));
		width = 390;
		render(List);
		await until(() => document.querySelector('.access-mobile-list'));
		pass('tablet/mobile mount stacked list instead of a squeezed table');
		for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']) {
			const row = rows.find((item) => item.status === status);
			await detail(row);
			assert(text().includes(row.requestNote));
			assert(text().includes(row.trainerData.memberFullName));
			assert(text().includes(row.gymData.gymAddress));
			assert.equal(Boolean(button('Approve')), status === 'PENDING');
			assert.equal(Boolean(button('Reject')), status === 'PENDING');
			assert.equal(Boolean(button('Revoke access')), status === 'APPROVED');
			if (row.rejectionReason) assert(text().includes(row.rejectionReason));
			if (row.revocationReason) assert(text().includes(row.revocationReason));
			assert(!text().includes(admin._id));
			pass(status + ' detail shows bounded identity/request/history and only valid actions');
		}
		detailFailure = true;
		router.query = { id: rows[0]._id };
		render(Detail);
		await until(() => button('Retry'));
		assert(!text().includes('PRIVATE'));
		detailFailure = false;
		click(button('Retry'));
		await until(() => document.querySelector('.access-detail-surface'));
		pass('detail query failure is sanitized and read-only Retry restores bounded detail');
		await detail(rows[0]);
		click(button('Approve'));
		assert(document.querySelector('[role=dialog]').textContent.includes(rows[0].trainerData.memberFullName));
		assert(document.querySelector('[role=dialog]').textContent.includes(rows[0].gymData.gymName));
		holdWrite = true;
		submit();
		submit();
		await until(() => pending.length === 1);
		assert.equal(writes().length, 1);
		assert(button('Saving…').disabled);
		pass('Approve confirms Trainer/Gym and synchronous lock prevents duplicate submission');
		holdWrite = false;
		pending.splice(0).forEach((finish) => finish());
		await until(
			() => !document.querySelector('[role=dialog]') && button('Revoke access') && !button('Revoke access').disabled,
		);
		assert.equal(toasts.length, 1);
		assert(operations.at(-1).name === 'GetTrainerGymAccessByAdmin');
		pass('approval receipt plus authoritative refresh changes actions and emits one success feedback');
		click(button('Revoke access'));
		assert(text().includes('Existing Programs and Reservations are preserved.'));
		change('#access-decision-reason', '  ');
		submit();
		assert.equal(writes().length, 1);
		assert(document.querySelector('#access-decision-reason').getAttribute('aria-invalid') === 'true');
		assert.equal(document.activeElement.id, 'access-decision-reason');
		assert.equal(document.querySelector('#access-decision-reason').maxLength, 1000);
		pass('revoke consequence, required trimmed reason, maxLength and first-invalid focus');
		const reviewDate = rows[0].reviewedAt;
		change('#access-decision-reason', ' Facility permission has ended. ');
		submit();
		await until(() => !document.querySelector('[role=dialog]') && !button('Revoke access'));
		assert.deepEqual(writes().at(-1).variables.input, {
			accessId: rows[0]._id,
			revocationReason: 'Facility permission has ended.',
		});
		assert.equal(rows[0].reviewedAt, reviewDate);
		assert(text().includes('Facility permission has ended.'));
		pass('revoke exact payload, terminal history and original approval date preserved');
		await detail(rows[1]);
		click(button('Reject'));
		change('#access-decision-reason', '  ');
		submit();
		assert(document.querySelector('#access-decision-reason').getAttribute('aria-invalid') === 'true');
		change('#access-decision-reason', ' Explain the venue permission. ');
		submit();
		await until(() => !document.querySelector('[role=dialog]') && !button('Reject'));
		assert.deepEqual(writes().at(-1).variables.input, {
			accessId: rows[1]._id,
			decision: 'REJECTED',
			rejectionReason: 'Explain the venue permission.',
		});
		assert(text().includes('Explain the venue permission.'));
		pass('rejection is required/trimmed and terminal reason displays without further actions');
		await detail(rows[2]);
		click(button('Reject'));
		change('#access-decision-reason', 'Keep this explanation.');
		mode = 'failure';
		submit();
		await until(() => button('Reload latest state') && !button('Reload latest state').disabled);
		assert.equal(document.querySelector('#access-decision-reason').value, 'Keep this explanation.');
		assert(!text().includes('PRIVATE'));
		assert(button('Reject').disabled);
		mode = '';
		click(button('Reload latest state'));
		await until(() => !document.querySelector('[role=dialog] button[type=submit]').disabled);
		pass('recoverable failure preserves reason, sanitizes error and requires read-only recovery');
		mode = 'conflict';
		submit();
		await until(() => !document.querySelector('[role=dialog]') && button('Revoke access'));
		assert(!button('Reject'));
		assert(text().includes('Approved'));
		assert(button('Revoke access').disabled);
		mode = '';
		click(button('Reload latest state'));
		await until(() => !button('Revoke access').disabled);
		pass('opposite first decision wins; auto-refetch removes stale Reject and never overwrites approval');
		await detail(rows[3]);
		click(button('Approve'));
		mode = 'eligibility';
		submit();
		await until(
			() =>
				text().includes('Approval requires an active Trainer account.') &&
				!document.querySelector('.access-detail-surface[aria-busy=true]'),
		);
		assert(button('Approve').disabled);
		assert(text().includes('Blocked account'));
		click(button('Cancel'));
		mode = '';
		pass('approval eligibility error is bounded and latest Trainer status is rendered with actions blocked');
		await detail(rows[4]);
		click(button('Approve'));
		mode = 'lost';
		const before = writes().length;
		submit();
		await until(
			() => text().includes('The persisted decision has been loaded.') && !document.querySelector('[role=dialog]'),
		);
		assert.equal(writes().length, before + 1);
		assert(!button('Approve'));
		assert(button('Revoke access'));
		mode = '';
		pass('lost approval receipt reconciles persisted same-decision state without a second mutation');
		click(button('Revoke access'));
		change('#access-decision-reason', 'End facility permission.');
		mode = 'lost';
		const revokeBefore = writes().length;
		submit();
		await until(() => !button('Revoke access') && !document.querySelector('[role=dialog]'));
		assert.equal(writes().length, revokeBefore + 1);
		assert(text().includes('End facility permission.'));
		mode = '';
		pass('lost revoke receipt preserves persisted dates/reason and never replays revocation');
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			await i18n.changeLanguage(locale);
			await detail(rows[5]);
			assert(text().includes(resources[locale]['admin-gym-access']['Detail title']));
			assert(!text().includes('{{'));
		}
		router.locale = 'en';
		await i18n.changeLanguage('en');
		pass('EN/KR/RU real detail translations and interpolation resolve');
		holdRead = true;
		router.query = { id: rows[6]._id };
		render(Detail);
		await until(() => pending.length > 0);
		assert(text().includes('Loading gym access'));
		assert(!text().includes('unavailable.'));
		store.userVar({ ...admin, _id: id(901) });
		session = 'two';
		render(Detail);
		holdRead = false;
		pending.splice(0).forEach((finish) => finish());
		await until(() => document.querySelector('.access-detail-surface'));
		assert.equal(toasts.length, 3);
		pass('loading never flashes missing state; account/session fences discard obsolete receipts');
		store.userVar(admin);
		router.query = { id: ['invalid'] };
		const readBefore = operations.length;
		render(Detail);
		await until(() => text().includes('This gym access request is unavailable.'));
		assert.equal(operations.length, readBefore);
		pass('invalid detail route is rejected before any Admin detail read');
	} finally {
		root.unmount();
		client.stop();
		dom.window.close();
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(global, key, descriptor);
			else delete global[key];
		}
	}
}
async function integration() {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-admin-access-test-')),
		previousCwd = process.cwd();
	let fixture;
	try {
		process.chdir(temporary);
		console.log = () => {};
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const { db, gql, trainer, otherTrainer, admin: actor, user } = fixture;
		const backRequire = require('node:module').createRequire(path.join(base, '../gymflow/package.json'));
		const { parse, validate } = backRequire('graphql'),
			schema = fixture.app.get(backRequire('@nestjs/graphql').GraphQLSchemaHost).schema;
		const documents = require('./check-graphql.cjs').collectDocuments();
		for (const doc of documents)
			assert.deepEqual(
				validate(schema, parse(doc.query)).map((error) => error.message),
				[],
				doc.name,
			);
		pass(documents.length + ' frontend documents validate against real current Nest schema');
		const gyms = db.model('Gym'),
			accesses = db.model('TrainerGymAccess');
		const gym = await gyms.create({
			gymName: 'Isolated moderation venue',
			gymLocation: 'SEOUL',
			gymAddress: 'Isolated physical address',
			gymStatus: 'ACTIVE',
			gymImages: ['uploads/gym/12345678-1234-4123-8123-123456789abc.webp'],
		});
		const make = (owner = trainer) =>
			accesses.create({
				trainerId: owner._id,
				gymId: gym._id,
				relationshipType: 'FACILITY_PERMISSION',
				requestNote: 'Permission for isolated coaching.',
			});
		const row = await make();
		const accessId = String(row._id),
			input = { page: 1, limit: 10, search: { status: 'PENDING' } };
		for (const member of [null, trainer, user]) {
			assert((await gql('GET_TRAINER_GYM_ACCESSES_BY_ADMIN', input, member)).errors?.length);
			assert((await gql('REVIEW_TRAINER_GYM_ACCESS', { accessId, decision: 'APPROVED' }, member)).errors?.length);
			assert(
				(await gql('REVOKE_TRAINER_GYM_ACCESS', { accessId, revocationReason: 'Permission ended.' }, member)).errors
					?.length,
			);
		}
		pass('real guest/USER/TRAINER cannot read Admin list or review/revoke');
		const list = await gql('GET_TRAINER_GYM_ACCESSES_BY_ADMIN', input, actor);
		assert.equal(list.errors, undefined);
		assert.equal(list.data.getTrainerGymAccessesByAdmin.metaCounter[0].total, 1);
		assert.deepEqual(
			Object.keys(list.data.getTrainerGymAccessesByAdmin.list[0].trainerData).sort(),
			['_id', 'memberFullName', 'memberImage', 'memberNick', 'memberStatus', 'memberType'].sort(),
		);
		const detailDocument = documents.find((doc) => doc.name === 'GET_TRAINER_GYM_ACCESS_BY_ADMIN').query;
		const detailRead = async (member = actor) =>
			(
				await fetch(fixture.uri, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fixture.token(member) },
					body: JSON.stringify({ query: detailDocument, variables: { accessId } }),
				})
			).json();
		assert.equal((await detailRead()).data.getTrainerGymAccessByAdmin.requestNote, row.requestNote);
		assert((await detailRead(user)).errors?.length);
		pass('real bounded Admin list/detail and role enforcement');
		for (const reason of ['', ' ', 'x'.repeat(1001)])
			assert(
				(await gql('REVIEW_TRAINER_GYM_ACCESS', { accessId, decision: 'REJECTED', rejectionReason: reason }, actor))
					.errors?.length,
			);
		assert(
			(await gql('REVOKE_TRAINER_GYM_ACCESS', { accessId, revocationReason: 'Not approved yet.' }, actor)).errors
				?.length,
		);
		pass('real reason validation and PENDING cannot be revoked');
		const approved = await gql('REVIEW_TRAINER_GYM_ACCESS', { accessId, decision: 'APPROVED' }, actor);
		assert.equal(approved.errors, undefined);
		assert.equal(approved.data.reviewTrainerGymAccess.status, 'APPROVED');
		const persisted = await accesses.findById(accessId).lean();
		const retry = await gql('REVIEW_TRAINER_GYM_ACCESS', { accessId, decision: 'APPROVED' }, actor);
		assert.equal(retry.errors, undefined);
		assert.equal(retry.data.reviewTrainerGymAccess.reviewedAt, approved.data.reviewTrainerGymAccess.reviewedAt);
		assert(
			(
				await gql(
					'REVIEW_TRAINER_GYM_ACCESS',
					{ accessId, decision: 'REJECTED', rejectionReason: 'Opposite decision.' },
					actor,
				)
			).errors?.length,
		);
		assert.equal((await accesses.findById(accessId)).status, 'APPROVED');
		pass('real approve, same-decision retry and opposite-decision conflict preserve first review');
		for (const reason of ['', ' ', 'x'.repeat(1001)])
			assert((await gql('REVOKE_TRAINER_GYM_ACCESS', { accessId, revocationReason: reason }, actor)).errors?.length);
		const revoked = await gql(
			'REVOKE_TRAINER_GYM_ACCESS',
			{ accessId, revocationReason: ' Permission ended. ' },
			actor,
		);
		assert.equal(revoked.errors, undefined);
		assert.equal(revoked.data.revokeTrainerGymAccess.revocationReason, 'Permission ended.');
		assert.equal(revoked.data.revokeTrainerGymAccess.reviewedAt, approved.data.reviewTrainerGymAccess.reviewedAt);
		assert.equal(
			(await gql('REVOKE_TRAINER_GYM_ACCESS', { accessId, revocationReason: 'Permission ended.' }, actor)).data
				.revokeTrainerGymAccess.revokedAt,
			revoked.data.revokeTrainerGymAccess.revokedAt,
		);
		assert(
			(await gql('REVOKE_TRAINER_GYM_ACCESS', { accessId, revocationReason: 'A different reason.' }, actor)).errors
				?.length,
		);
		assert((await gql('REVIEW_TRAINER_GYM_ACCESS', { accessId, decision: 'APPROVED' }, actor)).errors?.length);
		assert.equal(String((await accesses.findById(accessId)).reviewedBy), String(persisted.reviewedBy));
		pass(
			'real revoke requires reason; same-revoke retry preserves approval/revocation audit and revoked cannot reapprove',
		);
		const second = await make(),
			secondId = String(second._id);
		const rejected = await gql(
			'REVIEW_TRAINER_GYM_ACCESS',
			{ accessId: secondId, decision: 'REJECTED', rejectionReason: ' Clarify the facility relationship. ' },
			actor,
		);
		assert.equal(rejected.errors, undefined);
		assert.equal(rejected.data.reviewTrainerGymAccess.rejectionReason, 'Clarify the facility relationship.');
		assert.equal(
			(
				await gql(
					'REVIEW_TRAINER_GYM_ACCESS',
					{ accessId: secondId, decision: 'REJECTED', rejectionReason: 'Clarify the facility relationship.' },
					actor,
				)
			).errors,
			undefined,
		);
		assert(
			(await gql('REVIEW_TRAINER_GYM_ACCESS', { accessId: secondId, decision: 'APPROVED' }, actor)).errors?.length,
		);
		pass('real rejection trims reason, supports exact retry and stays terminal');
		const third = await make(otherTrainer);
		await fixture.members.updateOne({ _id: otherTrainer._id }, { $set: { memberStatus: 'BLOCK' } });
		assert(
			(await gql('REVIEW_TRAINER_GYM_ACCESS', { accessId: String(third._id), decision: 'APPROVED' }, actor)).errors
				?.length,
		);
		await fixture.members.updateOne({ _id: otherTrainer._id }, { $set: { memberStatus: 'ACTIVE' } });
		await gyms.updateOne({ _id: gym._id }, { $set: { gymStatus: 'PAUSED' } });
		assert(
			(await gql('REVIEW_TRAINER_GYM_ACCESS', { accessId: String(third._id), decision: 'APPROVED' }, actor)).errors
				?.length,
		);
		pass('real approval rechecks current Trainer and Gym eligibility');
		for (const status of ['PENDING', 'REJECTED', 'REVOKED']) {
			const result = await gql(
				'GET_TRAINER_GYM_ACCESSES_BY_ADMIN',
				{
					page: 1,
					limit: 1,
					search: {
						status,
						trainerId: String(status === 'PENDING' ? otherTrainer._id : trainer._id),
						gymId: String(gym._id),
					},
				},
				actor,
			);
			assert.equal(result.errors, undefined);
			assert(result.data.getTrainerGymAccessesByAdmin.list.every((item) => item.status === status));
		}
		const all = await gql('GET_TRAINER_GYM_ACCESSES_BY_ADMIN', { page: 1, limit: 2, search: {} }, actor);
		assert.equal(all.data.getTrainerGymAccessesByAdmin.list.length, 2);
		assert.equal(all.data.getTrainerGymAccessesByAdmin.metaCounter[0].total, 3);
		pass('real combined status/Trainer/Gym filters, ALL and server pagination totals');
	} finally {
		await fixture?.stop();
		console.log = output;
		process.chdir(previousCwd);
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5 });
	}
}
module.exports = { records, admin, load };
if (require.main === module)
	(async () => {
		unit();
		await domChecks();
		if (process.argv.includes('--integration')) await integration();
		output(checks + ' Admin Gym Access checks passed. Application databases were not used.');
	})().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
