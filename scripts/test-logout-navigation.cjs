// Controlled React commits and deferred transports; no API or database connections.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
function load(file, mocks = {}, cache = new Map()) {
	file = path.resolve(__dirname, '..', file);
	if (cache.has(file)) return cache.get(file);
	if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
		module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
	} }).outputText;
	const module = { exports: {} }; cache.set(file, module.exports);
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })((name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (/\.(s?css)$/.test(name)) return {};
		if (!name.startsWith('.')) return require(name);
		const target = path.resolve(path.dirname(file), name);
		return load(name.endsWith('.json') ? target : fs.existsSync(target + '.ts') ? target + '.ts' : fs.existsSync(target + '.tsx') ? target + '.tsx' : path.join(target, 'index.ts'), mocks, cache);
	}, module, module.exports);
	return module.exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(predicate) { for (let n = 0; n < 100; n++) { if (predicate()) return; await tick(); } assert.fail('State did not settle'); }
let checks = 0;
const pass = (message) => { checks++; console.log('PASS ' + message); };
async function main() {
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/_admin/profile' });
	const names = ['window', 'document', 'HTMLElement', 'DocumentFragment', 'Image', 'navigator', 'localStorage', 'fetch'];
	const previous = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(global, name)]));
	for (const name of names.filter((name) => name !== 'fetch')) Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
	let root;
	try {
		const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
		const apollo = require('@apollo/client');
		const store = load('apollo/store.ts');
		const client = new apollo.ApolloClient({ cache: new apollo.InMemoryCache(), link: apollo.ApolloLink.empty() });
		let cacheGate, serverGate, navigationGate, failServer = false, failCache = false, failNavigation = false;
		const requests = [], navigation = [], frames = [], history = ['/program', '/_admin/profile'];
		const router = { isReady: true, pathname: '/_admin/profile', asPath: '/_admin/profile', query: {}, locale: 'en',
			events: new (require('node:events').EventEmitter)(),
			replace: async (href) => {
				navigation.push(href);
				if (navigationGate) await navigationGate.promise;
				if (failNavigation === 'cancel') return false;
				if (failNavigation) throw new Error('Owned navigation failure');
				history[history.length - 1] = href; router.pathname = router.asPath = href; render(); return true;
			},
		};
		const clearing = client.clearStore.bind(client);
		client.clearStore = async () => { if (cacheGate) await cacheGate.promise; if (failCache) throw new Error('Owned cache failure'); await clearing(); };
		global.fetch = async (url, options) => {
			assert.equal(url, 'https://qa.invalid/graphql');
			assert.equal(options.credentials, 'include');
			assert.equal(options.headers['Apollo-Require-Preflight'], 'true');
			assert.match(JSON.parse(options.body).query, /mutation LogoutSession/);
			requests.push(options);
			if (serverGate) await serverGate.promise;
			if (failServer) throw new Error('Owned logout transport failure');
			return { ok: true, json: async () => ({ data: { logoutSession: true } }) };
		};
		const auth = load('libs/auth/index.ts', {
			'next/router': { __esModule: true, default: router },
			'../../apollo/store': store, '../../apollo/client': { initializeApollo: () => client },
			'../config': { getApiGraphqlUrl: () => 'https://qa.invalid/graphql' },
		});
		const noop = { __esModule: true, default: () => null };
		const mocks = {
			'next/router': { useRouter: () => router }, 'next/head': noop,
			'next/link': { __esModule: true, default: ({ href, children, legacyBehavior, passHref, ...props }) => legacyBehavior ? React.cloneElement(children, { ...props, href }) : React.createElement('a', { ...props, href: typeof href === 'string' ? href : href.pathname }, children) },
			'../../../apollo/store': store, '../../auth': auth,
			'../libs/auth': { updateUserInfo: () => Promise.resolve(), handleAuthStorage: auth.handleAuthStorage },
			'../apollo/client': { useApollo: () => client },
			'next-i18next': { appWithTranslation: (component) => component, useTranslation: () => ({ i18n: {} }) },
		};
		const Admin = load('libs/components/layout/LayoutAdmin.tsx', mocks).default(() => React.createElement('div', null, 'PRIVATE ADMIN CONTENT'));
		const App = load('pages/_app.tsx', mocks).default;
		let role = 'ADMIN';
		function MemberPage() {
			const user = apollo.useReactiveVar(store.userVar);
			return user._id && user.memberStatus === 'ACTIVE' && user.memberType === role
				? React.createElement('button', { onClick: () => void auth.logOut() }, 'PRIVATE ' + role + ' CONTENT')
				: React.createElement('p', { role: 'alert' }, 'MEMBER ACCESS DENIED');
		}
		const Home = () => React.createElement('div', null, store.userVar()._id ? 'INVALID AUTHENTICATED HOME' : 'ANONYMOUS HOME');
		root = createRoot(document.getElementById('root'));
		function render() { flushSync(() => root.render(React.createElement(React.Profiler, { id: 'app', onRender: () => frames.push(document.body.textContent) }, React.createElement(App, { Component: router.pathname === '/' || router.pathname === '/program' ? Home : role === 'ADMIN' ? Admin : MemberPage, pageProps: {} })))); }
		async function signIn(nextRole) {
			role = nextRole;
			const id = 'a'.repeat(24), sid = 'b'.repeat(24);
			auth.setJwtToken(['e30', Buffer.from(JSON.stringify({ sub: id, sid, purpose: 'access', exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url'), 'signature'].join('.'));
			store.userVar({ ...store.emptyUser, _id: id, memberType: role, memberStatus: 'ACTIVE', memberNick: 'QA' });
			store.authReadyVar(true); store.authErrorVar('');
			localStorage.setItem('accessToken', 'legacy');
			client.cache.writeQuery({ query: apollo.gql`query PrivateFixture { privateFixture }`, data: { privateFixture: 'private' } });
			router.pathname = router.asPath = role === 'ADMIN' ? '/_admin/profile' : '/mypage';
			history.splice(0, history.length, '/program', router.pathname);
			render(); await until(() => document.body.textContent.includes('PRIVATE ' + role)); frames.length = 0;
		}
		for (const nextRole of ['ADMIN', 'USER', 'TRAINER']) {
			await signIn(nextRole);
			cacheGate = deferred(); serverGate = deferred(); navigationGate = deferred();
			const before = requests.length;
			// The real Admin button uses its real handler; member roles share the same helper.
			flushSync(() => (nextRole === 'ADMIN' ? document.querySelector('.workspace-account button') : document.querySelector('button')).click());
			await until(() => document.querySelector('[aria-busy="true"]'));
			assert.equal(auth.getJwtToken(), ''); assert.equal(auth.getAuthSessionId(), ''); assert.equal(store.userVar()._id, '');
			assert.equal(localStorage.getItem('accessToken'), null); assert.equal(localStorage.getItem('gymflow.logoutPending'), '1');
			assert.equal(requests.length, before); assert(!document.body.textContent.includes('PRIVATE'));
			assert.equal(await auth.logOut(), false, 'Repeated logout cannot start a second operation');
			cacheGate.resolve(); await until(() => requests.length === before + 1);
			assert.equal(Object.keys(client.cache.extract()).length, 0);
			assert(store.logoutInProgressVar()); assert(!document.querySelector('[role="alert"]'));
			serverGate.resolve(); await until(() => navigation.at(-1) === '/' && localStorage.getItem('gymflow.logoutPending') === null);
			assert(store.logoutInProgressVar()); assert(!document.body.textContent.includes('Sign in'));
			navigationGate.resolve(); await until(() => !store.logoutInProgressVar());
			await until(() => document.body.textContent === 'ANONYMOUS HOME');
			assert.deepEqual(history, ['/program', '/']);
			assert(frames.length > 1); assert(frames.every((frame) => !/active administrator|Sign in|MEMBER ACCESS DENIED|PRIVATE|INVALID AUTHENTICATED/.test(frame)), frames.join('\n'));
			cacheGate = serverGate = navigationGate = null;
			// Back reaches the preceding public entry; an older protected entry/deep link still denies.
			router.pathname = router.asPath = history[0]; render();
			assert.equal(document.body.textContent, 'ANONYMOUS HOME');
			router.pathname = router.asPath = nextRole === 'ADMIN' ? '/_admin/profile' : '/mypage'; render();
			await until(() => document.querySelector('[role="alert"]'));
			assert(!document.body.textContent.includes('PRIVATE'));
			pass(nextRole + ': real cleanup, delayed cache/server/navigation, every committed frame, replace history and protected revisit');
		}
		role = 'ADMIN'; router.pathname = router.asPath = '/_admin/profile'; render();
		await until(() => document.body.textContent.includes('An active administrator account is required.'));
		assert(document.querySelector('a[href="/account/join"]'));
		pass('Anonymous direct Admin access retains the actual guard and Sign in link');
		for (const failure of ['server', 'cache', 'navigation', 'cancel']) {
			await signIn('ADMIN'); failServer = failure === 'server'; failCache = failure === 'cache'; failNavigation = failure === 'cancel' ? 'cancel' : failure === 'navigation';
			let pending; flushSync(() => { pending = auth.logOut(); });
			assert.equal(await pending, false); await tick();
			assert.equal(store.logoutInProgressVar(), false); assert.equal(auth.getJwtToken(), ''); assert.equal(store.userVar()._id, '');
			assert(!document.body.textContent.includes('PRIVATE')); assert(document.querySelector('[role="alert"]'));
			assert.equal(localStorage.getItem('gymflow.logoutPending'), failure === 'server' ? '1' : null);
			if (failure === 'server') await assert.rejects(auth.ensureAccessToken(true), /awaiting confirmation/);
			if (failure === 'navigation' || failure === 'cancel') assert.match(store.authErrorVar(), /Could not open Home/);
			failServer = failCache = failNavigation = false; await clearing();
			pass(failure + ' failure exits transition, clears credentials and fails closed');
		}
		client.stop();
	} finally {
		root?.unmount(); dom.window.close();
		for (const [name, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(global, name, descriptor); else delete global[name]; }
	}
	console.log(checks + ' logout navigation checks passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
