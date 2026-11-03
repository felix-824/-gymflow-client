// Actual React/MUI/Apollo page with an owned in-memory transport. No network or database writes.
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
const adminFixture = {
	_id: 'a'.repeat(24),
	memberType: 'ADMIN',
	memberStatus: 'ACTIVE',
	memberAuthType: 'PHONE',
	memberPhone: 'fixture',
	memberNick: 'Admin demo',
	memberFullName: '',
	memberImage: '',
	memberAddress: '',
	memberDesc: '',
	memberWarnings: 0,
	memberBlocks: 0,
	memberPrograms: 0,
	memberRank: 0,
	memberArticles: 0,
	memberPoints: 0,
	memberLikes: 0,
	memberViews: 0,
	deletedAt: null,
	createdAt: '2026-11-01T00:00:00Z',
	updatedAt: '2026-11-01T00:00:00Z',
};
const programFixtures = Array.from({ length: 26 }, (_, index) => ({
	_id: String(index + 1).padStart(24, '0'),
	programRevision: 7,
	programType: ['PT_1ON1', 'GROUP_CLASS', 'ONLINE'][index % 3],
	programStatus: index < 20 ? 'ACTIVE' : index < 23 ? 'PAUSED' : 'DELETE',
	programLocation: index % 3 === 2 ? 'ONLINE' : index % 2 ? 'BUSAN' : 'SEOUL',
	programAddress: index % 3 === 2 ? null : '123 Training Street',
	gymId: index % 3 === 2 ? null : index % 2 ? 'd'.repeat(24) : null,
	programName:
		index === 0
			? 'Strength & mobility foundations'
			: index === 1
			? 'A purposeful strength and mobility coaching program for sustainable everyday movement'
			: 'Program ' + (index + 1),
	programPrice: index === 1 ? 123456789 : 75000 + index * 1000,
	programDuration: 60,
	programCapacity: index % 3 === 0 ? 1 : 12,
	programCategory: ['MUSCLE_GAIN', 'YOGA', 'REHAB', 'PILATES', 'WEIGHT_LOSS', 'CROSSFIT', 'CARDIO'][index % 7],
	programImages: index === 0 ? ['uploads/program/responsive-fixture.jpg'] : [],
	programDesc: 'Actual fixture description.',
	programViews: 0,
	programLikes: 0,
	memberId: 'e'.repeat(24),
	createdAt: '2026-11-01T00:00:00Z',
	updatedAt: '2026-11-01T00:00:00Z',
	deletedAt: null,
	memberData: {
		...adminFixture,
		_id: 'e'.repeat(24),
		memberType: 'TRAINER',
		memberNick: index === 1 ? 'trainer_with_a_long_nickname' : 'alex_park',
	},
}));
module.exports = { adminFixture, programFixtures };
let checks = 0;
const pass = (name) => {
	checks++;
	console.log('PASS ' + name);
};
async function main() {
	const messages = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [locale, load('public/locales/' + locale + '/admin-programs.json')]),
	);
	const keys = (object, prefix = '') =>
		Object.entries(object).flatMap(([key, value]) =>
			typeof value === 'object' ? keys(value, prefix + key + '.') : [prefix + key],
		);
	for (const labels of Object.values(messages)) {
		assert.deepEqual(keys(labels), keys(messages.en));
		assert(!JSON.stringify(labels).includes('\ufffd'));
	}
	pass('safe EN/KR/RU Program resources have exact nested-key parity and intact text');
	const { JSDOM } = require('jsdom'),
		dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/programs' });
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
			allow = true,
			empty = false,
			fault = false,
			hold = false,
			pending;
		const store = {
			userVar: apollo.makeVar({}),
			authReadyVar: apollo.makeVar(false),
			authErrorVar: apollo.makeVar(''),
		};
		const router = {
			isReady: true,
			locale: 'en',
			pathname: '/_admin/programs',
			asPath: '/_admin/programs',
			events: new (require('node:events').EventEmitter)(),
			push: async () => true,
		};
		const programs = structuredClone(programFixtures),
			requests = [],
			mutations = [],
			confirmations = [],
			failures = [];
		client = new apollo.ApolloClient({
			cache: new apollo.InMemoryCache(),
			link: new apollo.ApolloLink(
				(operation) =>
					new apollo.Observable((observer) => {
						const complete = () => {
							let data;
							if (operation.operationName === 'GetAllProgramsByAdmin') {
								if (fault) return observer.error(new Error('private connection details'));
								const input = operation.variables.input,
									search = input.search;
								const list = empty
									? []
									: programs.filter(
											(item) =>
												(!search.programStatus || item.programStatus === search.programStatus) &&
												(!search.locationList || search.locationList.includes(item.programLocation)),
									  );
								data = {
									getAllProgramsByAdmin: {
										list: list.slice((input.page - 1) * input.limit, input.page * input.limit),
										metaCounter: [{ total: list.length }],
									},
								};
							} else if (operation.operationName === 'UpdateProgramByAdmin') {
								const input = operation.variables.input,
									program = programs.find((item) => item._id === input._id);
								assert.equal(input.expectedRevision, program.programRevision);
								Object.assign(program, {
									programStatus: input.programStatus,
									programRevision: program.programRevision + 1,
								});
								data = { updateProgramByAdmin: program };
							} else {
								assert.equal(operation.operationName, 'RemoveProgramByAdmin');
								const index = programs.findIndex((item) => item._id === operation.variables.input);
								assert.equal(programs[index].programStatus, 'DELETE');
								data = { removeProgramByAdmin: programs.splice(index, 1)[0] };
							}
							observer.next({ data });
							observer.complete();
						};
						if (operation.operationName === 'GetAllProgramsByAdmin') {
							requests.push(structuredClone(operation.variables.input));
							if (hold) {
								pending = complete;
								return () => {};
							}
						} else mutations.push({ name: operation.operationName, input: structuredClone(operation.variables.input) });
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
					return legacyBehavior
						? React.cloneElement(children, { href, ref, ...props })
						: React.createElement(
								'a',
								{ ...props, ref, href: typeof href === 'string' ? href : href.pathname },
								children,
						  );
				}),
			},
			'@mui/material': {
				...mui,
				useMediaQuery: (query) => (query.includes('min-width') ? width >= 1200 : width <= 599),
			},
			'../../../apollo/store': store,
			'../../auth': { logOut: async () => true },
			'../../../libs/sweetAlert': {
				sweetConfirmAlert: async (message) => {
					confirmations.push(message);
					return allow;
				},
				sweetErrorHandling: async (error) => failures.push(error),
			},
		};
		const Page = load('pages/_admin/programs/index.tsx', mocks).default;
		root = createRoot(document.getElementById('root'));
		let instance = 0;
		const render = () =>
			flushSync(() =>
				root.render(
					React.createElement(
						mui.ThemeProvider,
						{ theme: mui.createTheme() },
						React.createElement(apollo.ApolloProvider, { client }, React.createElement(Page, { key: instance })),
					),
				),
			);
		const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
		const wait = async (condition) => {
			for (let n = 0; n < 160; n++) {
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
		const loaded = () => document.querySelector('.admin-programs') && !document.querySelector('.program-feedback');
		const reset = async () => {
			instance++;
			render();
			await wait(() => loaded() && document.querySelector('.program-identity'));
		};
		render();
		await tick();
		assert.equal(requests.length, 0);
		for (const account of [
			{},
			{ ...adminFixture, memberType: 'USER' },
			{ ...adminFixture, memberType: 'TRAINER' },
			{ ...adminFixture, memberStatus: 'BLOCK' },
			{ ...adminFixture, memberStatus: 'DELETE' },
		]) {
			flushSync(() => {
				store.authReadyVar(true);
				store.userVar(account);
			});
			await tick();
			assert.equal(requests.length, 0);
		}
		flushSync(() => {
			store.userVar(adminFixture);
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
			'unchanged Admin shell prevents private queries for unready/error auth, guests, wrong roles, inactive Admin and unready router',
		);
		router.isReady = true;
		render();
		await wait(loaded);
		assert.deepEqual(requests.at(-1), { page: 1, limit: 10, sort: 'createdAt', direction: 'DESC', search: {} });
		for (width of [1440, 768, 390]) {
			render();
			await tick();
			assert.equal(Boolean(document.querySelector('table')), width > 599);
			assert.equal(document.querySelectorAll('.program-identity').length, 10);
			assert.equal(
				document.querySelector('.program-identity').getAttribute('href'),
				'/program/detail?id=' + programs[0]._id,
			);
			assert(document.querySelector('.program-details').textContent.includes(programs[0]._id));
			assert(!document.querySelector('details').open);
			assert(document.querySelector('.program-technical-id'));
			assert(document.querySelector('.program-control').getAttribute('aria-haspopup') === 'menu');
			if (width === 390) {
				const rows = document.querySelectorAll('.program-mobile-row');
				assert.equal(rows.length, 10);
				assert(rows[1].textContent.includes(programs[1].programName));
				assert(rows[1].textContent.includes(programs[1].memberData.memberNick));
				assert(rows[1].textContent.includes('123,456,789'));
				assert.equal(rows[1].querySelectorAll('details dd').length, 5);
			}
			pass(
				width +
					'px identity-first presentation retains actual image/title, trainer, price, type, status, secondary metadata and Active-only detail route',
			);
		}
		click(document.querySelector('[aria-label="Next page"]'));
		await wait(
			() =>
				loaded() &&
				requests.at(-1).page === 2 &&
				document.querySelector('.program-identity').textContent.includes('Program 11'),
		);
		click(document.querySelector('.MuiTablePagination-select'));
		await wait(() => document.querySelector('[role="listbox"]'));
		assert.deepEqual(
			[...document.querySelectorAll('[role="option"]')].map((item) => item.textContent),
			['10', '20', '40', '60'],
		);
		click(byText('[role="option"]', '20'));
		await wait(() => loaded() && document.querySelectorAll('.program-identity').length === 20);
		assert.equal(requests.at(-1).page, 1);
		pass('one-based paging, real total, 10/20/40/60 sizes and page-one reset remain');
		click(document.getElementById('admin-program-location'));
		await wait(() => document.querySelector('[role="listbox"]'));
		click(byText('[role="option"]', 'Seoul'));
		await wait(() => loaded() && requests.at(-1).search.locationList?.[0] === 'SEOUL');
		click(byText('[role="tab"]', 'Paused'));
		await wait(() => loaded() && requests.at(-1).search.programStatus === 'PAUSED' && !document.querySelector('.program-identity')?.hasAttribute('href'));
		assert.deepEqual(requests.at(-1).search.locationList, ['SEOUL']);
		assert.equal(requests.at(-1).page, 1);
		assert(!document.querySelector('.program-identity').hasAttribute('href'));
		click(byText('[role="tab"]', 'Delete'));
		await wait(() => loaded() && requests.at(-1).search.programStatus === 'DELETE' && document.querySelector('.program-control.is-delete'));
		assert(document.querySelector('.program-control.is-delete'));
		click(byText('[role="tab"]', 'Active'));
		await wait(() => loaded() && requests.at(-1).search.programStatus === 'ACTIVE');
		click(byText('[role="tab"]', 'All'));
		await wait(() => loaded() && !requests.at(-1).search.programStatus);
		assert.deepEqual(requests.at(-1).search.locationList, ['SEOUL']);
		click(document.getElementById('admin-program-location'));
		await wait(() => document.querySelector('[role="listbox"]'));
		click(byText('[role="option"]', 'All locations'));
		await wait(() => loaded() && !requests.at(-1).search.locationList);
		pass(
			'All/Active/Paused/Delete tabs and the location-only ALL filter retain enum/search semantics and page reset; inactive titles stay unlinked',
		);
		click(document.getElementById('admin-program-location'));
		await wait(() => document.querySelector('[role="listbox"]'));
		click(byText('[role="option"]', 'Online'));
		await wait(() => loaded() && requests.at(-1).search.locationList?.[0] === 'ONLINE');
		for (const row of document.querySelectorAll('.program-mobile-row')) {
			assert(row.querySelector('.program-mobile-context').textContent.startsWith('Online'));
			assert(!row.textContent.includes('123 Training Street'));
			assert(!row.textContent.includes('Seoul'));
		}
		assert(programFixtures.some((item) => item.gymId));
		assert(programFixtures.some((item) => !item.gymId && item.programType === 'PT_1ON1'));
		assert(programFixtures.filter((item) => item.programType === 'ONLINE').every((item) => item.gymId === null));
		pass(
			'ONLINE has online context without physical address/Gym; fixture matrix includes linked and independent physical Programs',
		);
		await reset();
		for (width of [1440, 768, 390]) {
			render();
			await tick();
			const button = document.querySelector('.program-control');
			click(button);
			await wait(() => document.querySelector('[role="menu"]'));
			assert.equal(button.getAttribute('aria-expanded'), 'true');
			assert(byText('[role="menuitem"]', 'Paused'));
			assert(byText('[role="menuitem"]', 'Delete'));
			allow = false;
			click(byText('[role="menuitem"]', 'Paused'));
			await tick();
			assert.equal(mutations.length, 0);
			flushSync(() =>
				document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
			);
			await wait(() => !document.querySelector('[role="menu"]'));
		}
		pass('status menu remains accessible in every branch; cancelling existing confirmation issues no mutation');
		allow = true;
		const firstId = programs[0]._id;
		click(document.querySelector('.program-control'));
		await wait(() => document.querySelector('[role="menu"]'));
		click(byText('[role="menuitem"]', 'Paused'));
		await wait(
			() =>
				loaded() &&
				document.querySelector('.program-control')?.textContent === 'Paused' &&
				!document.querySelector('[role="menu"]'),
		);
		assert.deepEqual(mutations.at(-1), {
			name: 'UpdateProgramByAdmin',
			input: { _id: firstId, programStatus: 'PAUSED', expectedRevision: 7 },
		});
		assert.equal(confirmations.at(-1), 'Change program status?');
		pass(
			'in-memory status action keeps exact _id/status/expectedRevision payload, original confirmation and authoritative refetch',
		);
		click(byText('[role="tab"]', 'Delete'));
		await wait(() => loaded() && document.querySelector('.program-control.is-delete'));
		const deleteId = programs.find((item) => item.programStatus === 'DELETE')._id;
		allow = false;
		click(document.querySelector('.program-control.is-delete'));
		await tick();
		assert.equal(mutations.length, 1);
		allow = true;
		click(document.querySelector('.program-control.is-delete'));
		await wait(
			() => loaded() && mutations.length === 2 && !document.querySelector('details').textContent.includes(deleteId),
		);
		assert.deepEqual(mutations.at(-1), { name: 'RemoveProgramByAdmin', input: deleteId });
		assert.equal(confirmations.at(-1), 'Are you sure to remove?');
		assert.equal(failures.length, 0);
		pass(
			'in-memory terminal removal keeps exact ID-only mutation and original confirmation; cancellation is non-mutating',
		);
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			await reset();
			assert.equal(document.querySelector('h1').textContent, messages[locale].title);
			assert.equal(document.querySelector('summary').textContent, messages[locale].details);
			assert.equal(document.querySelector('.program-type').textContent, messages[locale].types.PT_1ON1);
			assert(
				document.querySelector('.MuiTablePagination-selectLabel').textContent.includes(messages[locale].rowsPerPage),
			);
			empty = true;
			instance++;
			render();
			await wait(() => document.querySelector('.program-feedback')?.textContent === messages[locale].empty);
			empty = false;
		}
		pass(
			'EN/KR/RU headings, enum labels, secondary details, empty states and pagination use the safe Program resources',
		);
		router.locale = 'en';
		hold = true;
		instance++;
		render();
		await wait(() => pending && document.querySelector('.program-feedback [role="status"]'));
		hold = false;
		fault = true;
		pending();
		await wait(() => document.querySelector('.program-feedback [role="alert"]'));
		assert(!document.body.textContent.includes('private connection'));
		fault = false;
		click(byText('button', 'Try again'));
		await wait(loaded);
		pass('localized loading and sanitized error/Retry recover without stale controls or private transport details');
		const sass = require('sass'),
			css = sass.compile(path.join(base, 'scss/pc/admin/programs.scss'), { logger: sass.Logger.silent }).css;
		assert.match(css, /max-width: 1199px/);
		assert.match(css, /max-width: 599px/);
		assert.match(css, /table-layout: fixed/);
		assert.match(css, /min-height: 44px/);
		assert(
			!fs
				.readFileSync(path.join(base, 'libs/components/admin/programs/ProgramList.tsx'), 'utf8')
				.includes('minWidth: 750'),
		);
		pass(
			'Programs-only SCSS compiles with reduced tablet columns, mobile rows, 44px controls and no fixed table minimum',
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
	console.log(
		checks +
			' Admin Programs responsive checks passed. All writes used in-memory fixtures; no database or network writes.',
	);
}
if (require.main === module)
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
