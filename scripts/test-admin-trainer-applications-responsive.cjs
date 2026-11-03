// Real React/MUI/Apollo list and detail. Transport is in-memory, query-only; no server or database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
let checks = 0;
const pass = (name) => {
	checks++;
	console.log('PASS ' + name);
};
async function main() {
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{
				'admin-trainer-applications': load('public/locales/' + locale + '/admin-trainer-applications.json'),
				common: load('public/locales/' + locale + '/common.json'),
			},
		]),
	);
	for (const locale of Object.values(resources)) {
		assert.deepEqual(
			Object.keys(locale['admin-trainer-applications']),
			Object.keys(resources.en['admin-trainer-applications']),
		);
		assert(!Object.values(locale['admin-trainer-applications']).some((value) => /\ufffd|\?{2,}/.test(value)));
	}
	pass('existing EN/KR/RU application namespaces have key parity and intact text');
	const i18n = require('i18next').createInstance();
	await i18n.init({
		resources,
		lng: 'en',
		fallbackLng: 'en',
		ns: ['admin-trainer-applications', 'common'],
		defaultNS: 'admin-trainer-applications',
		interpolation: { escapeValue: false },
	});
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/trainer-applications' });
	const names = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'Image'];
	const previous = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(global, name)]));
	for (const name of names) Object.defineProperty(global, name, { value: dom.window[name], configurable: true });
	let root, client;
	try {
		const React = require('react'),
			{ createRoot } = require('react-dom/client'),
			{ flushSync } = require('react-dom');
		const apollo = require('@apollo/client'),
			mui = require('@mui/material');
		let width = 1440,
			empty = false,
			fault = false,
			hold = false,
			pendingQuery;
		const admin = { _id: 'a'.repeat(24), memberType: 'ADMIN', memberStatus: 'ACTIVE', memberNick: 'Fixture Admin' };
		const store = {
			userVar: apollo.makeVar({}),
			authReadyVar: apollo.makeVar(false),
			authErrorVar: apollo.makeVar(''),
		};
		const router = {
			isReady: true,
			pathname: '/_admin/trainer-applications',
			asPath: '/_admin/trainer-applications',
			query: {},
			locale: 'en',
			events: new (require('node:events').EventEmitter)(),
			push: async () => true,
		};
		const requests = [];
		const applications = ['PENDING', 'REJECTED', 'APPROVED'].flatMap((status, group) =>
			Array.from({ length: 13 }, (_, index) => ({
				_id: String(group * 100 + index + 1).padStart(24, '0'),
				status,
				fullName: index === 0 ? 'Ekaterina Aleksandrovna Konstantinopolskaya' : 'Applicant ' + status + ' ' + index,
				categories:
					index === 0 ? ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'YOGA', 'PILATES', 'CROSSFIT', 'CARDIO', 'REHAB'] : ['YOGA'],
				createdAt: '2026-10-21T09:00:00Z',
				experienceSummary: 'Eight years of applicant-submitted experience.',
				bio: 'Coaching philosophy. <script>untrusted()</script>',
				rejectionReason: status === 'REJECTED' ? 'Please provide further experience.' : null,
			})),
		);
		client = new apollo.ApolloClient({
			cache: new apollo.InMemoryCache(),
			link: new apollo.ApolloLink(
				(operation) =>
					new apollo.Observable((observer) => {
						const definition = operation.query.definitions.find((item) => item.kind === 'OperationDefinition');
						assert.equal(definition.operation, 'query', 'Responsive harness must never issue mutations');
						assert(['GetTrainerApplicationsByAdmin', 'GetTrainerApplicationByAdmin'].includes(operation.operationName));
						requests.push({
							name: operation.operationName,
							variables: JSON.parse(JSON.stringify(operation.variables)),
						});
						const complete = () => {
							if (fault) return observer.error(new Error('private connection details'));
							let data;
							if (operation.operationName === 'GetTrainerApplicationsByAdmin') {
								const input = operation.variables.input;
								const list = empty ? [] : applications.filter((item) => item.status === input.search.status);
								data = {
									getTrainerApplicationsByAdmin: {
										list: list.slice((input.page - 1) * input.limit, input.page * input.limit),
										metaCounter: [{ total: list.length }],
									},
								};
							} else
								data = {
									getTrainerApplicationByAdmin: applications.find(
										(item) => item._id === operation.variables.applicationId,
									),
								};
							observer.next({ data });
							observer.complete();
						};
						if (hold) {
							pendingQuery = complete;
							return () => {};
						}
						const timer = setTimeout(complete, 10);
						return () => clearTimeout(timer);
					}),
			),
		});
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/head': { __esModule: true, default: () => null },
			'next/link': {
				__esModule: true,
				default: React.forwardRef(function FixtureLink({ href, children, legacyBehavior, passHref, ...props }, ref) {
					const url =
						typeof href === 'string' ? href : href.pathname + (href.query ? '?' + new URLSearchParams(href.query) : '');
					return legacyBehavior
						? React.cloneElement(children, { href: url, ref, ...props })
						: React.createElement('a', { ...props, ref, href: url }, children);
				}),
			},
			'next-i18next': { useTranslation: (ns) => ({ t: i18n.getFixedT(router.locale, ns) }) },
			'@mui/material': {
				...mui,
				useMediaQuery: (query) => (query.includes('min-width') ? width >= 1200 : width <= 599),
			},
			'../../../apollo/store': store,
			'../../../../apollo/store': store,
			'../../auth': { logOut: async () => true },
			'../../../auth': { getAuthSessionId: () => 'fixture-session' },
		};
		const withAdminLayout = load('libs/components/layout/LayoutAdmin.tsx', mocks).default;
		const List = withAdminLayout(
			load('libs/components/admin/trainer-applications/TrainerApplications.tsx', mocks).default,
		);
		const Detail = withAdminLayout(
			load('libs/components/admin/trainer-applications/TrainerApplicationDetail.tsx', mocks).default,
		);
		root = createRoot(document.getElementById('root'));
		let Component = List,
			instance = 0;
		const render = () =>
			flushSync(() =>
				root.render(
					React.createElement(
						mui.ThemeProvider,
						{ theme: mui.createTheme() },
						React.createElement(apollo.ApolloProvider, { client }, React.createElement(Component, { key: instance })),
					),
				),
			);
		const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
		const wait = async (condition) => {
			for (let n = 0; n < 120; n++) {
				if (condition()) return;
				await tick();
			}
			assert.fail('DOM timeout: ' + document.body.textContent);
		};
		const click = (node) => {
			assert(node);
			flushSync(() =>
				node.dispatchEvent(
					new window.MouseEvent(node.matches('.MuiSelect-select') ? 'mousedown' : 'click', {
						bubbles: true,
						button: 0,
					}),
				),
			);
		};
		const byText = (selector, text) =>
			[...document.querySelectorAll(selector)].find((node) => node.textContent.trim() === text);
		const labels = () => resources[router.locale]['admin-trainer-applications'];
		const loaded = () =>
			document.querySelector('.admin-application-list') &&
			!document.querySelector('.admin-application-list [role="status"], .admin-application-list [role="alert"]');
		const remount = async () => {
			instance++;
			render();
			await wait(
				() =>
					loaded() &&
					(empty ? document.querySelector('.admin-application-mobile-feedback') : document.querySelector('time')),
			);
		};
		render();
		await tick();
		assert.equal(requests.length, 0);
		for (const account of [
			{},
			{ ...admin, memberType: 'USER' },
			{ ...admin, memberType: 'TRAINER' },
			{ ...admin, memberStatus: 'BLOCK' },
			{ ...admin, memberStatus: 'DELETE' },
		]) {
			flushSync(() => {
				store.authReadyVar(true);
				store.userVar(account);
			});
			await tick();
			assert.equal(requests.length, 0);
		}
		flushSync(() => {
			store.userVar(admin);
			store.authErrorVar('private auth failure');
		});
		await tick();
		assert.equal(requests.length, 0);
		flushSync(() => {
			store.authErrorVar('');
			router.isReady = false;
		});
		render();
		await tick();
		assert.equal(requests.length, 0);
		pass(
			'unchanged shell/access guards block private queries for unresolved/error auth, router readiness, guests, USER/TRAINER and inactive Admin',
		);
		router.isReady = true;
		render();
		await wait(() => loaded() && document.querySelector('time'));
		for (width of [1440, 768, 390]) {
			render();
			await tick();
			assert.equal(Boolean(document.querySelector('table')), width > 599);
			if (width > 599)
				assert.deepEqual(
					[...document.querySelectorAll('th')].map((item) => item.textContent),
					['Applicant', 'Specialties', 'Status', 'Submitted Date', 'Action'],
				);
			else {
				assert.equal(document.querySelectorAll('.admin-application-mobile-row').length, 10);
				const row = document.querySelector('.admin-application-mobile-row');
				assert(row.textContent.includes(applications[0].fullName));
				assert(row.textContent.includes('PENDING'));
				assert.equal(row.querySelectorAll('.admin-application-specialties span').length, 7);
				assert.equal(row.querySelector('time').getAttribute('datetime'), applications[0].createdAt);
				assert.equal(row.querySelector('a').textContent, 'Review');
				assert(row.querySelector('a').getAttribute('aria-label').includes(applications[0].fullName));
				assert(!row.textContent.includes(applications[0]._id));
			}
			assert.equal(
				document.querySelector('a[href*="applicationId"]').getAttribute('href'),
				'/_admin/trainer-applications/detail?applicationId=' + applications[0]._id,
			);
			pass(
				width +
					'px presentation retains actual identity, specialties, status, submitted date and exact detail navigation',
			);
		}
		click(document.querySelector('[aria-label="Next page"]'));
		await wait(() => loaded() && document.querySelectorAll('.admin-application-mobile-row').length === 3);
		assert.equal(requests.at(-1).variables.input.page, 2);
		click(document.querySelector('.MuiTablePagination-select'));
		await wait(() => document.querySelector('[role="listbox"]'));
		assert.deepEqual(
			[...document.querySelectorAll('[role="option"]')].map((item) => item.textContent),
			['10', '20', '40', '60'],
		);
		click(byText('[role="option"]', '20'));
		await wait(() => loaded() && document.querySelectorAll('.admin-application-mobile-row').length === 13);
		assert.equal(requests.at(-1).variables.input.page, 1);
		assert.equal(requests.at(-1).variables.input.limit, 20);
		pass('one-based pagination, totals and 10/20/40/60 sizes preserved; size change resets page one');
		for (const status of ['REJECTED', 'APPROVED', 'PENDING']) {
			click(byText('[role="tab"]', labels()[status]));
			await wait(
				() =>
					loaded() && document.querySelector('.admin-application-status')?.textContent === labels()['Status ' + status],
			);
			assert.equal(requests.at(-1).variables.input.search.status, status);
			assert.equal(requests.at(-1).variables.input.page, 1);
			assert.equal(
				document.querySelector('.admin-application-mobile-action').textContent,
				labels()[status === 'PENDING' ? 'Review' : 'View'],
			);
			assert(!document.querySelector('.admin-application-list button[type="submit"]'));
		}
		pass('Pending/Rejected/Approved tabs retain enum filtering and Review/View; no list decision action added');
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			render();
			await tick();
			assert.equal(document.querySelector('h1').textContent, labels().Title);
			assert.equal(
				document.querySelector('.admin-application-mobile-row time').textContent,
				new Date(applications[0].createdAt).toLocaleDateString(
					locale === 'kr' ? 'ko-KR' : locale === 'ru' ? 'ru-RU' : 'en-US',
					{ year: 'numeric', month: 'short', day: 'numeric' },
				),
			);
			empty = true;
			await remount();
			for (const status of ['PENDING', 'REJECTED', 'APPROVED']) {
				click(byText('[role="tab"]', labels()[status]));
				await wait(
					() =>
						document.querySelector('.admin-application-mobile-feedback')?.textContent === labels()['Empty ' + status],
				);
				assert(!document.querySelector('table'));
				assert(document.querySelector('[aria-label="' + labels()['Next page'] + '"]').disabled);
			}
			empty = false;
			await remount();
		}
		pass(
			'EN/KR/RU identity, categories, dates, tabs, actions, pagination and all nine mobile empty messages use existing resources',
		);
		router.locale = 'en';
		hold = true;
		instance++;
		render();
		await wait(() => pendingQuery && document.querySelector('.admin-application-list [role="status"]'));
		hold = false;
		fault = true;
		pendingQuery();
		await wait(() => document.querySelector('.admin-application-mobile-feedback [role="alert"]'));
		assert(!document.body.textContent.includes('private connection'));
		fault = false;
		click(byText('button', 'Retry'));
		await wait(() => loaded() && document.querySelector('time'));
		pass('mobile loading, sanitized failure and Retry recover through the same read-only list query');
		Component = Detail;
		for (width of [1440, 768, 390]) {
			for (const status of ['PENDING', 'REJECTED', 'APPROVED']) {
				const application = applications.find((item) => item.status === status);
				router.query = { applicationId: application._id };
				instance++;
				render();
				await wait(() => document.querySelector('.admin-application-detail h2'));
				assert.equal(document.querySelector('h2').textContent, application.fullName);
				assert.equal(
					document.querySelectorAll('.admin-application-decision button').length,
					status === 'PENDING' ? 2 : 0,
				);
				assert(document.querySelector('dd').textContent.includes('Yoga'));
				assert(!document.querySelector('.admin-application-detail script'));
				assert(document.body.textContent.includes('<script>untrusted()</script>'));
				if (status === 'REJECTED') assert(document.body.textContent.includes(application.rejectionReason));
			}
		}
		pass(
			'detail data and existing Pending-only review controls remain intact at all widths; terminal feedback and untrusted text safe; no decisions submitted',
		);
		const before = requests.length;
		router.query = { applicationId: 'malformed' };
		instance++;
		render();
		await wait(() => document.body.textContent.includes(labels()['Not found']));
		assert.equal(requests.length, before);
		assert(document.body.textContent.includes(labels()['Not found']));
		pass('malformed detail IDs do not issue an application query');
		const sass = require('sass');
		const css = sass.compile(path.join(base, 'scss/pc/admin/trainerApplications.scss'), {
			logger: sass.Logger.silent,
		}).css;
		assert.match(css, /max-width: 599px/);
		assert.match(css, /\.admin-application-list/);
		assert.match(css, /min-height: 44px/);
		assert.match(css, /min-width: 740px/);
		assert(
			requests.every(
				(item) => item.name === 'GetTrainerApplicationsByAdmin' || item.name === 'GetTrainerApplicationByAdmin',
			),
		);
		pass(
			'list-scoped mobile SCSS compiles; existing table minimum retained; transport observed only the two permitted read queries',
		);
	} finally {
		root?.unmount();
		client?.stop();
		dom.window.close();
		for (const [name, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(global, name, descriptor);
			else delete global[name];
		}
	}
	console.log(checks + ' Trainer Applications responsive checks passed. No server or database writes.');
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
