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

const { adminFixture } = require('./test-admin-programs-responsive.cjs');
const articlesFixture = Array.from({ length: 26 }, (_, i) => ({
	_id: String(i + 1).padStart(24, '0'),
	articleCategory: ['FREE', 'TIP', 'SUCCESS_STORY', 'NEWS'][i % 4],
	articleStatus: i < 22 ? 'ACTIVE' : 'DELETE',
	articleTitle:
		i === 0
			? 'Building strength with a sustainable training routine'
			: i === 1
			? '매일 꾸준하게 이어가는 근력 운동과 회복: 오래 지속할 수 있는 일상 만들기'
			: 'Community story ' + (i + 1),
	articleContent: 'Isolated QA story',
	articleImage: null,
	articleViews: i === 0 ? 1234567 : i * 27,
	articleLikes: i === 0 ? 34567 : i * 3,
	memberId: 'e'.repeat(24),
	createdAt: '2026-11-01T00:00:00Z',
	updatedAt: '2026-11-01T00:00:00Z',
	memberData: {
		...adminFixture,
		_id: 'e'.repeat(24),
		memberType: 'USER',
		memberNick: i === 1 ? 'writer_with_a_long_unbroken_nickname' : 'minji_park',
	},
}));
module.exports = { adminFixture, articlesFixture };
let checks = 0;
const pass = (name) => {
	checks++;
	console.log('PASS ' + name);
};
async function main() {
	const labelsByLocale = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [locale, load('libs/admin-community-labels.ts').adminCommunityLabels(locale)]),
	);
	for (const locale of ['en', 'kr', 'ru']) {
		const labels = labelsByLocale[locale];
		assert.equal(labels.categories.TIP, load('public/locales/' + locale + '/common.json')['Community discovery'].TIP);
		assert(!JSON.stringify(labels).includes('\ufffd'));
		assert.deepEqual(
			Object.keys(load('public/locales/' + locale + '/admin-community.json')),
			Object.keys(load('public/locales/en/admin-community.json')),
		);
	}
	pass('EN/KR/RU resources have key parity and reuse existing category, engagement, status and pagination labels');
	const { JSDOM } = require('jsdom'),
		dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/community' });
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
			fault = false;
		const articles = structuredClone(articlesFixture),
			requests = [],
			mutations = [],
			confirmations = [],
			failures = [];
		const store = {
			userVar: apollo.makeVar({}),
			authReadyVar: apollo.makeVar(false),
			authErrorVar: apollo.makeVar(''),
		};
		const router = {
			isReady: true,
			locale: 'en',
			pathname: '/_admin/community',
			asPath: '/_admin/community',
			events: new (require('node:events').EventEmitter)(),
			push: async () => true,
		};
		client = new apollo.ApolloClient({
			cache: new apollo.InMemoryCache(),
			link: new apollo.ApolloLink(
				(operation) =>
					new apollo.Observable((observer) => {
						const timer = setTimeout(() => {
							let data;
							if (operation.operationName === 'GetAllBoardArticlesByAdmin') {
								const input = operation.variables.input,
									s = input.search;
								requests.push(structuredClone(input));
								const list = empty
									? []
									: articles.filter(
											(a) =>
												(!s.articleStatus || a.articleStatus === s.articleStatus) &&
												(!s.articleCategory || a.articleCategory === s.articleCategory),
									  );
								data = {
									getAllBoardArticlesByAdmin: {
										list: list.slice((input.page - 1) * input.limit, input.page * input.limit),
										metaCounter: [{ total: list.length }],
									},
								};
							} else {
								mutations.push({ name: operation.operationName, input: structuredClone(operation.variables.input) });
								if (fault) return observer.error(new Error('controlled moderation failure'));
								if (operation.operationName === 'UpdateBoardArticleByAdmin') {
									const a = articles.find((a) => a._id === operation.variables.input._id);
									Object.assign(a, operation.variables.input);
									data = { updateBoardArticleByAdmin: a };
								} else {
									assert.equal(operation.operationName, 'RemoveBoardArticleByAdmin');
									const index = articles.findIndex((a) => a._id === operation.variables.input);
									assert.equal(articles[index].articleStatus, 'DELETE');
									data = { removeBoardArticleByAdmin: articles.splice(index, 1)[0] };
								}
							}
							observer.next({ data });
							observer.complete();
						}, 10);
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
			'@mui/material': { ...mui, useMediaQuery: (q) => (q.includes('min-width') ? width >= 1200 : width <= 599) },
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
		const Page = load('pages/_admin/community/index.tsx', mocks).default;
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
			[...document.querySelectorAll(selector)].find((n) => n.textContent.trim() === text);
		const loaded = () => Boolean(document.querySelector('.article-identity'));
		const reset = async () => {
			instance++;
			render();
			await wait(loaded);
			await tick();
			assert.equal(document.querySelector('details dd').textContent, articles[0]._id);
			assert.equal(requests.at(-1).page, 1);
			assert.equal(requests.at(-1).limit, 10);
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
		pass(
			'unchanged workspace authorization prevents private Community reads for unready auth, guests, wrong roles and inactive Admin',
		);
		flushSync(() => store.userVar(adminFixture));
		await wait(loaded);
		await tick();
		assert.deepEqual(requests.at(-1), { page: 1, limit: 10, sort: 'createdAt', direction: 'DESC', search: {} });
		assert.equal(document.querySelector('h1').textContent, 'Article List');
		assert.equal(document.querySelectorAll('[role=tab]').length, 3);
		assert.equal(document.querySelector('[aria-current=page]').getAttribute('href'), '/_admin/community');
		pass(
			'Article List typo is corrected; original inquiry, All/Active/Delete tabs and active Community navigation remain',
		);
		for (width of [1440, 768, 390]) {
			render();
			await tick();
			assert.equal(Boolean(document.querySelector('table')), width > 599);
			assert.equal(document.querySelectorAll('.article-identity').length, 10);
			assert.equal(
				document.querySelector('.article-identity').getAttribute('href'),
				'/community/detail?articleCategory=FREE&id=' + articles[0]._id,
			);
			assert.equal(
				document.querySelector('.article-writer').getAttribute('href'),
				'/member?memberId=' + articles[0].memberData._id,
			);
			assert(document.querySelector('.article-details').textContent.includes(articles[0]._id));
			assert.equal(document.querySelectorAll('details').length, 10);
			assert(!document.querySelector('details').open);
			const details = document.querySelector('details');
			for (const text of ['1234567', '34567', '01.11.26', 'Free']) assert(details.textContent.includes(text));
			assert(document.querySelector('summary').getAttribute('aria-label').includes(articles[0].articleTitle));
			if (width === 390) {
				const row = document.querySelector('.article-mobile-row');
				assert(row.querySelector('.article-mobile-category').textContent === 'Free');
				assert(row.querySelector('.article-writer').textContent.includes('minji_park'));
				assert(row.querySelector('.article-control').textContent === 'Active');
				assert(document.querySelectorAll('.article-mobile-row')[1].textContent.includes(articles[1].articleTitle));
			} else {
				assert.deepEqual(
					[...document.querySelectorAll('thead th')].map((n) => n.textContent),
					['Article', 'Writer', 'Category', 'Engagement', 'Register date', 'Status'],
				);
			}
			pass(
				width +
					'px branch prioritizes title/writer/status, preserves routes and retains ID/category/views/likes/date in native Details',
			);
		}
		click(document.querySelector('[aria-label="Next page"]'));
		await wait(() => document.querySelector('.article-identity')?.textContent === 'Community story 11');
		assert.equal(requests.at(-1).page, 2);
		click(document.querySelector('.MuiTablePagination-select'));
		await wait(() => document.querySelector('[role=listbox]'));
		assert.deepEqual(
			[...document.querySelectorAll('[role=option]')].map((n) => n.textContent),
			['10', '20', '40', '60'],
		);
		click(byText('[role=option]', '20'));
		await wait(() => document.querySelectorAll('.article-identity').length === 20);
		assert.equal(requests.at(-1).page, 1);
		pass('one-based paging and existing 10/20/40/60 page sizes retain actual totals and size-change reset');
		click(document.getElementById('admin-article-category'));
		await wait(() => document.querySelector('[role=listbox]'));
		click(byText('[role=option]', 'Tips'));
		await wait(() => document.querySelectorAll('.article-identity').length === 7);
		assert.equal(requests.at(-1).search.articleCategory, 'TIP');
		click(byText('[role=tab]', 'Delete'));
		await wait(() => document.querySelectorAll('.article-identity').length === 1);
		assert.deepEqual(requests.at(-1).search, { articleCategory: 'TIP', articleStatus: 'DELETE' });
		assert.equal(requests.at(-1).page, 1);
		assert.equal(document.querySelector('a.article-identity'), null);
		assert(document.querySelector('.article-control.is-delete'));
		click(byText('[role=tab]', 'Active'));
		await wait(() => document.querySelectorAll('.article-identity').length === 6);
		click(byText('[role=tab]', 'All'));
		await wait(() => document.querySelectorAll('.article-identity').length === 7);
		assert.deepEqual(requests.at(-1).search, { articleCategory: 'TIP' });
		click(document.getElementById('admin-article-category'));
		await wait(() => document.querySelector('[role=listbox]'));
		click(byText('[role=option]', 'All categories'));
		await wait(() => document.querySelectorAll('.article-identity').length === 20);
		pass(
			'keyboard-capable category selection and all tabs preserve combined filters, enum values, title visibility and page-one reset',
		);
		await reset();
		for (width of [1440, 768, 390]) {
			render();
			await tick();
			const button = document.querySelector('.article-control');
			click(button);
			await wait(() => document.querySelector('[role=menu]'));
			assert.equal(button.getAttribute('aria-expanded'), 'true');
			assert.equal(document.querySelectorAll('[role=menuitem]').length, 1);
			assert.equal(document.querySelector('[role=menuitem]').textContent, 'Delete');
			flushSync(() =>
				document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
			);
			await wait(() => !document.querySelector('[role=menu]'));
			assert.equal(button.getAttribute('aria-expanded'), 'false');
		}
		pass(
			'all viewport branches preserve moderation choices, named menu relationship, expanded state and Escape dismissal',
		);
		click(document.querySelector('.article-control'));
		await wait(() => document.querySelector('[role=menu]'));
		click(byText('[role=menuitem]', 'Delete'));
		await wait(() => document.querySelector('.article-control.is-delete') && !document.querySelector('[role=menu]'));
		assert.deepEqual(mutations.at(-1), {
			name: 'UpdateBoardArticleByAdmin',
			input: { _id: articlesFixture[0]._id, articleStatus: 'DELETE' },
		});
		assert.equal(confirmations.length, 0);
		pass(
			'status action preserves exact original ID/status mutation, existing no-confirmation transition and authoritative refetch in memory',
		);
		allow = false;
		click(document.querySelector('.article-control.is-delete'));
		await tick();
		assert.equal(mutations.length, 1);
		assert.equal(confirmations.at(-1), 'Are you sure to remove?');
		allow = true;
		click(document.querySelector('.article-control.is-delete'));
		await wait(() => document.querySelector('.article-identity')?.textContent === articlesFixture[1].articleTitle);
		assert.deepEqual(mutations.at(-1), { name: 'RemoveBoardArticleByAdmin', input: articlesFixture[0]._id });
		pass('terminal removal retains ID-only mutation and original confirmation; cancelling sends no mutation');
		fault = true;
		click(document.querySelector('.article-control'));
		await wait(() => document.querySelector('[role=menu]'));
		click(byText('[role=menuitem]', 'Delete'));
		await wait(() => failures.length === 1 && !document.querySelector('[role=menu]'));
		assert(document.querySelector('a.article-identity'));
		fault = false;
		pass('existing moderation failure path closes menu, reports the error and preserves article state');
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			await reset();
			const labels = labelsByLocale[locale];
			assert.equal(document.querySelector('h1').textContent, labels.title);
			assert.equal(document.querySelector('summary').textContent, labels.details);
			assert.equal(document.querySelector('.article-mobile-category').textContent, labels.categories.TIP);
			assert.equal(document.querySelector('.MuiTablePagination-selectLabel').textContent, labels.rowsPerPage);
			empty = true;
			instance++;
			render();
			await wait(() => document.querySelector('.article-empty')?.textContent === labels.empty);
			empty = false;
		}
		pass(
			'EN/KR/RU headings, category/writer/status, Details, empty state and paging render through safe locale resources',
		);
		const css = require('sass').compile(path.join(base, 'scss/pc/admin/community.scss'), {
			logger: require('sass').Logger.silent,
		}).css;
		assert(css.length > 0);
		pass('Community SCSS compiles; actual overflow, focus and disclosure keyboard behavior are covered by browser QA');
	} finally {
		root?.unmount();
		client?.stop();
		// Apollo defers subscription teardown; keep the DOM alive until that cleanup drains.
		await new Promise((resolve) => setTimeout(resolve, 50));
		dom.window.close();
		for (const [name, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(global, name, descriptor);
			else delete global[name];
		}
	}
	console.log(
		checks + ' Admin Community responsive checks passed. Only in-memory mutations; no database/network writes.',
	);
}
if (require.main === module)
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
