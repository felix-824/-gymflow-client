// Real React/MUI/Apollo Users page; all queries and writes use owned in-memory fixtures.
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
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
		module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
	} }).outputText;
	const module = { exports: {} }; cache.set(file, module.exports);
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })((name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (!name.startsWith('.')) return require(name);
		const target = path.resolve(path.dirname(file), name);
		return load(name.endsWith('.json') ? target : fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache);
	}, module, module.exports);
	return module.exports;
}
let checks = 0;
const pass = (name) => { checks++; console.log('PASS ' + name); };
async function main() {
	const messages = ['en', 'kr', 'ru'].map((locale) => load('public/locales/' + locale + '/admin-users.json'));
	const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, item]) => typeof item === 'object' ? keys(item, prefix + key + '.') : [prefix + key]);
	for (const locale of messages) { assert.deepEqual(keys(locale), keys(messages[0])); assert(!Object.values(locale).some((value) => typeof value === 'string' && /\ufffd|\?{2,}/.test(value))); }
	pass('separate EN/KR/RU Users labels have exact key parity and intact text');
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/users' });
	const names = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'navigator', 'Image'];
	const previous = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(global, name)]));
	for (const name of names) Object.defineProperty(global, name, { value: dom.window[name], configurable: true });
	let root, client;
	try {
		const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
		const apollo = require('@apollo/client'), mui = require('@mui/material');
		let width = 1440, fault = false, hold = false, pendingQuery, holdMutation = false, pendingMutation;
		const admin = { _id: 'a'.repeat(24), memberType: 'ADMIN', memberStatus: 'ACTIVE', memberNick: 'Fixture Admin' };
		const store = { userVar: apollo.makeVar({}), authReadyVar: apollo.makeVar(false), authErrorVar: apollo.makeVar('') };
		const router = { isReady: true, pathname: '/_admin/users', asPath: '/_admin/users', locale: 'en', events: new (require('node:events').EventEmitter)(), push: async () => true };
		const requests = [], mutations = [], failures = [];
		const members = Array.from({ length: 26 }, (_, index) => ({
			_id: String(index + 1).padStart(24, '0'), memberType: index % 3 === 1 ? 'TRAINER' : index % 3 === 2 ? 'ADMIN' : 'USER',
			memberStatus: index % 5 === 4 ? 'BLOCK' : index % 7 === 6 ? 'DELETE' : 'ACTIVE', memberAuthType: 'PHONE',
			memberNick: (index % 3 === 1 ? 'trainer_' : 'member_') + index, memberFullName: index === 0 ? 'A long full name that should remain fully available on narrow screens' : 'Member ' + index,
			memberImage: '', memberPhone: '010-1234-5678', memberAddress: '', memberDesc: '', memberWarnings: index % 3, memberBlocks: index % 2,
			memberPrograms: 0, memberArticles: 0, memberComments: 0, memberFollowers: 0, memberFollowings: 0, memberRank: 0, memberPoints: 0, memberLikes: 0, memberViews: 0,
			deletedAt: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
		}));
		client = new apollo.ApolloClient({ cache: new apollo.InMemoryCache(), link: new apollo.ApolloLink((operation) => new apollo.Observable((observer) => {
			const complete = () => {
				if (operation.operationName === 'GetAllMembersByAdmin') {
					if (fault) return observer.error(new Error('private connection details'));
					const input = operation.variables.input, search = input.search;
					const list = members.filter((member) => (!search.memberType || member.memberType === search.memberType) && (!search.memberStatus || member.memberStatus === search.memberStatus) && (!search.text || member.memberNick.includes(search.text)));
					observer.next({ data: { getAllMembersByAdmin: { list: list.slice((input.page - 1) * input.limit, input.page * input.limit), metaCounter: [{ total: list.length }] } } });
				} else {
					assert.equal(operation.operationName, 'UpdateMemberByAdmin');
					const member = members.find((item) => item._id === operation.variables.input._id);
					Object.assign(member, operation.variables.input); observer.next({ data: { updateMemberByAdmin: member } });
				}
				observer.complete();
			};
			if (operation.operationName === 'GetAllMembersByAdmin') { requests.push(JSON.parse(JSON.stringify(operation.variables.input))); if (hold) { pendingQuery = complete; return () => {}; } }
			else { mutations.push(JSON.parse(JSON.stringify(operation.variables.input))); if (holdMutation) { pendingMutation = complete; return () => {}; } }
			const timer = setTimeout(complete, 10); return () => clearTimeout(timer);
		})) });
		const mocks = {
			'next/router': { useRouter: () => router }, 'next/head': { __esModule: true, default: () => null },
			'next/link': { __esModule: true, default: React.forwardRef(({ href, children, legacyBehavior, passHref, ...props }, ref) => legacyBehavior ? React.cloneElement(children, { href, ref, ...props }) : React.createElement('a', { ...props, ref, href: typeof href === 'string' ? href : href.pathname }, children)) },
			'@mui/material': { ...mui, useMediaQuery: (query) => query.includes('min-width') ? width >= 1200 : width <= 599 },
			'../../../apollo/store': store, '../../auth': { logOut: async () => true },
			'../../../libs/sweetAlert': { sweetErrorHandling: async (error) => failures.push(error) },
		};
		const Page = load('pages/_admin/users/index.tsx', mocks).default;
		root = createRoot(document.getElementById('root'));
		const render = () => flushSync(() => root.render(React.createElement(mui.ThemeProvider, { theme: mui.createTheme() }, React.createElement(apollo.ApolloProvider, { client }, React.createElement(Page)))));
		const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
		const wait = async (condition) => { for (let n = 0; n < 120; n++) { if (condition()) return; await tick(); } assert.fail('DOM timeout: ' + document.body.textContent); };
		const click = (node) => { assert(node); const type = node.matches('.MuiSelect-select') ? 'mousedown' : 'click'; flushSync(() => node.dispatchEvent(new window.MouseEvent(type, { bubbles: true, button: 0 }))); };
		const byText = (selector, text) => [...document.querySelectorAll(selector)].find((node) => node.textContent.trim() === text);
		const input = (value) => { const node = document.getElementById('admin-member-search'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value); flushSync(() => node.dispatchEvent(new window.Event('input', { bubbles: true }))); };
		const submit = () => flushSync(() => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
		const ready = () => !document.querySelector('.member-feedback') && document.querySelector('.admin-users');
		render(); await tick(); assert.equal(requests.length, 0); assert(document.querySelector('[role="status"]'));
		for (const account of [{}, { ...admin, memberType: 'USER' }, { ...admin, memberType: 'TRAINER' }, { ...admin, memberStatus: 'BLOCK' }]) {
			flushSync(() => { store.authReadyVar(true); store.userVar(account); }); await tick(); assert.equal(requests.length, 0); assert(!document.querySelector('.admin-users'));
		}
		flushSync(() => { store.userVar(admin); store.authErrorVar('private auth failure'); }); await tick(); assert.equal(requests.length, 0);
		pass('unchanged Admin shell gates unresolved/error auth, guests, USER/TRAINER and inactive Admin before any member query');
		flushSync(() => store.authErrorVar('')); await wait(ready);
		assert.deepEqual(requests.at(-1), { page: 1, limit: 10, sort: 'createdAt', search: {} });
		for (width of [1440, 768, 390]) {
			render(); await tick();
			assert.equal(Boolean(document.querySelector('table')), width > 599);
			assert.equal(Boolean(document.querySelector('.member-mobile-list')), width <= 599);
			assert.equal(document.querySelectorAll('.member-identity').length, 10);
			assert(document.querySelector('.member-identity').textContent.includes(members[0].memberFullName));
			assert.equal(document.querySelector('.member-identity').getAttribute('href'), '/member?memberId=' + members[0]._id);
			assert(document.querySelector('button[id$="memberType"]')); assert(document.querySelector('button[id$="memberStatus"]'));
			assert(document.querySelector('details .member-technical-id').textContent === members[0]._id);
			assert(!document.querySelector('details').open);
			pass(width + 'px branch preserves member identity, contact, type/state controls, secondary ID and moderation counts');
		}
		click(document.querySelector('button[aria-label="Next page"]')); await wait(() => ready() && requests.at(-1).page === 2);
		click(document.querySelector('.MuiTablePagination-select')); await wait(() => document.querySelector('[role="listbox"]'));
		click(byText('[role="option"]', '20')); await wait(() => ready() && requests.at(-1).limit === 20); assert.equal(requests.at(-1).page, 1);
		pass('next page uses one-based query paging; all existing page sizes remain and size changes reset to page one');
		click(document.getElementById('admin-member-type')); await wait(() => document.querySelector('[role="listbox"]'));
		click(byText('[role="option"]', 'TRAINER')); await wait(() => ready() && requests.at(-1).search.memberType === 'TRAINER');
		input(' trainer_1 '); submit(); await wait(() => ready() && requests.at(-1).search.text === 'trainer_1'); assert.equal(requests.at(-1).page, 1);
		click(byText('[role="tab"]', 'Blocked')); await wait(() => ready() && requests.at(-1).search.memberStatus === 'BLOCK');
		assert.equal(requests.at(-1).search.memberType, 'TRAINER'); assert(!requests.at(-1).search.text); assert.equal(document.getElementById('admin-member-search').value, '');
		pass('role filter and trimmed search work; changing status clears search and retains the selected role with page-one reset');
		for (const [tab, status] of [['Deleted', 'DELETE'], ['Active', 'ACTIVE'], ['All', undefined]]) {
			click(byText('[role="tab"]', tab)); await wait(() => ready() && requests.at(-1).search.memberStatus === status);
		}
		click(document.getElementById('admin-member-type')); await wait(() => document.querySelector('[role="listbox"]')); click(byText('[role="option"]', 'All types'));
		await wait(() => ready() && !requests.at(-1).search.memberType);
		pass('All/Active/Blocked/Deleted tabs and clearing the type filter preserve backend enum semantics');
		input('no-such-member'); submit(); await wait(() => document.querySelector('.member-empty')); assert.equal(document.querySelector('.member-empty').textContent, messages[0].empty);
		click(document.querySelector('[aria-label="Clear search"]')); await wait(() => ready() && !requests.at(-1).search.text);
		pass('empty results and accessible clear-search recover to the current filters');
		const roleButton = document.querySelector('button[id$="memberType"]'); click(roleButton); await wait(() => document.querySelector('[role="menu"]'));
		assert(!byText('[role="menuitem"]', 'TRAINER')); assert(byText('[role="menuitem"]', 'ADMIN'));
		holdMutation = true; const promote = byText('[role="menuitem"]', 'ADMIN'); click(promote); click(promote); await wait(() => pendingMutation);
		assert.deepEqual(mutations, [{ _id: members[0]._id, memberType: 'ADMIN' }]); assert(document.querySelector('button[id$="memberType"]').disabled);
		holdMutation = false; pendingMutation(); await wait(() => ready() && document.querySelector('button[id$="memberType"]')?.textContent.includes('ADMIN') && !document.querySelector('[role="menu"]'));
		pass('mobile role action keeps USER-to-TRAINER restriction, exact Admin mutation payload and duplicate-write protection');
		click(document.querySelector('button[id$="memberStatus"]')); await wait(() => document.querySelector('[role="menu"]'));
		click(byText('[role="menuitem"]', 'BLOCK')); await wait(() => ready() && document.querySelector('button[id$="memberStatus"]')?.textContent.includes('BLOCK') && !document.querySelector('[role="menu"]'));
		assert.deepEqual(mutations.at(-1), { _id: members[0]._id, memberStatus: 'BLOCK' }); assert.equal(failures.length, 0);
		pass('mobile state menu uses the original moderation mutation and refreshes the authoritative list');
		for (width of [1440, 768]) {
			render(); await tick(); click(document.querySelector('button[id$="memberType"]')); await wait(() => document.querySelector('[role="menu"]'));
			assert(byText('[role="menuitem"]', 'USER')); assert(byText('[role="menuitem"]', 'TRAINER'));
			flushSync(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
			await wait(() => !document.querySelector('[role="menu"]'));
		}
		pass('desktop/tablet retain all existing Admin role choices and keyboard-dismissable action menus');
		for (const locale of ['kr', 'ru']) { router.locale = locale; render(); await tick(); const labels = load('public/locales/' + locale + '/admin-users.json'); assert.equal(document.querySelector('h1').textContent, labels.title); assert.equal(document.querySelector('summary').textContent, labels.details); }
		pass('KR/RU headings, details, filter/action labels and pagination render through the new namespace');
		router.locale = 'en'; width = 390; hold = true; render(); input('held'); submit(); await wait(() => pendingQuery); assert(document.querySelector('[role="status"]'));
		hold = false; fault = true; pendingQuery(); await wait(() => document.querySelector('.member-feedback[role="alert"]')); assert(!document.body.textContent.includes('private connection'));
		fault = false; click(byText('button', 'Try again')); await wait(() => document.querySelector('.member-empty'));
		pass('loading and sanitized query failure have an accessible retry path without exposing private error details');
		const sass = require('sass').compile(path.join(base, 'scss/pc/admin/users.scss'), { logger: require('sass').Logger.silent }).css;
		assert.match(sass, /table-layout: fixed/); assert.match(sass, /max-width: 1199px/); assert.match(sass, /max-width: 599px/); assert.match(sass, /min-height: 44px/);
		assert(!fs.readFileSync(path.join(base, 'libs/components/admin/users/MemberList.tsx'), 'utf8').includes('minWidth: 750'));
		pass('Users-only SCSS compiles with tablet metadata disclosure, mobile layout, practical targets and no fixed desktop minimum');
	} finally {
		root?.unmount(); client?.stop(); dom.window.close();
		for (const [name, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(global, name, descriptor); else delete global[name]; }
	}
	console.log(checks + ' Admin Users checks passed. No database writes.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
