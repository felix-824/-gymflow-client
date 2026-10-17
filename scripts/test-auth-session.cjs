// Auth/session integration uses a disposable API/database and a test-only cookie jar.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const output = console.log;
let checks = 0;
const pass = (name) => { checks++; output('PASS ' + name); };
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('.')) return loadTs(path.resolve(path.dirname(file), name) + '.ts', mocks, cache);
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}
async function until(predicate) {
	for (let attempt = 0; !predicate(); attempt++) {
		assert(attempt < 1000, 'condition did not settle');
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}
async function main() {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-auth-sessions-'));
	const previous = { fetch: global.fetch, window: global.window, localStorage: global.localStorage, navigator: Object.getOwnPropertyDescriptor(global, 'navigator'), uri: process.env.REACT_APP_API_GRAPHQL_URL, cwd: process.cwd(), now: Date.now };
	let fixture, release;
	const clients = [];
	try {
		console.log = () => {};
		process.chdir(temporary);
		fixture = await require('./test-trainer-reservations.cjs').createFixture({ multipart: true });
		process.env.REACT_APP_API_GRAPHQL_URL = fixture.uri;
		const storage = new Map(), navigation = [], requests = [];
		global.window = { location: { replace: (href) => navigation.push(href), reload: () => navigation.push('reload') } };
		global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
		let lockTail = Promise.resolve();
		Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: {
			request: (_name, action) => { const result = lockTail.then(action); lockTail = result.catch(() => {}); return result; },
		} } });
		let hold = '', held = false, fail = '', flatError = '', unauthorized = false, badReceipt = false;
		global.fetch = async (url, options) => {
			assert.equal(String(url), fixture.uri, 'Only the disposable API may receive test requests');
			const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
			const name = body?.operationName ?? body?.query.match(/\b(?:query|mutation)\s+(\w+)/)?.[1] ?? 'Upload';
			requests.push({ name, headers: options.headers });
			if (name === 'RefreshSession' && unauthorized) {
				unauthorized = false;
				return new Response('Unauthorized', { status: 401 });
			}
			if (flatError === name) {
				flatError = '';
				return new Response(JSON.stringify({ errors: [{ code: 'UNAUTHENTICATED', message: 'Please sign in with an active account' }] }), { headers: { 'Content-Type': 'application/json' } });
			}
			const response = await fixture.sessionFetch(url, options);
			if (name === 'RefreshSession' && badReceipt) {
				badReceipt = false;
				return new Response(JSON.stringify({ data: { refreshSession: { accessToken: 'malformed' } } }));
			}
			if (hold === name) {
				hold = ''; held = true;
				await new Promise((resolve) => { release = resolve; });
			}
			if (fail === name) { fail = ''; throw new Error('Uncertain transport outcome'); }
			return response;
		};
		const queries = loadTs(path.join(__dirname, '../apollo/user/query.ts'));
		const mutations = loadTs(path.join(__dirname, '../apollo/user/mutation.ts'));
		function harness() {
			let auth;
			const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
			const clientModule = loadTs(path.join(__dirname, '../apollo/client.ts'), {
				'../libs/auth': {
					ensureAccessToken: (...args) => auth.ensureAccessToken(...args), getAuthGeneration: () => auth.getAuthGeneration(),
					getJwtToken: () => auth.getJwtToken(), invalidateSession: () => auth.invalidateSession(),
					isAuthenticationError: (...args) => auth.isAuthenticationError(...args), updateUserInfo: (...args) => auth.updateUserInfo(...args),
				}, '../libs/sweetAlert': { sweetErrorAlert: () => {} },
			});
			const client = clientModule.initializeApollo();
			clients.push(client);
			auth = loadTs(path.join(__dirname, '../libs/auth/index.ts'), {
				'../../apollo/client': clientModule, '../../apollo/store': store,
				'../../apollo/user/query': queries, '../../apollo/user/mutation': mutations,
			});
			return { auth, client, store };
		}
		const count = (name) => requests.filter((request) => request.name === name).length;
		const login = async (h, account = fixture.user) => h.auth.logIn(account.memberNick, fixture.password);
		const owner = (h) => h.client.query({ query: queries.GET_MY_MEMBER, fetchPolicy: 'no-cache', context: { queryDeduplication: false, handleErrorLocally: true } });
		const advance = () => { const now = previous.now(); Date.now = () => now + 14 * 60000 + 45000; };
		const resetClock = () => { Date.now = previous.now; };
		let h = harness();
		storage.set('accessToken', 'obsolete-30-day-legacy-token');
		await h.auth.updateUserInfo();
		assert.equal(h.store.authReadyVar(), true); assert.equal(h.store.authErrorVar(), '');
		assert.equal(h.store.userVar()._id, ''); assert(!storage.has('accessToken'));
		const guestRefreshes = count('RefreshSession');
		await Promise.all([h.auth.ensureAccessToken(), h.auth.ensureAccessToken(), h.auth.updateUserInfo()]);
		assert.equal(count('RefreshSession'), guestRefreshes);
		pass('absent refresh is normal guest; legacy storage removed; no guest refresh loop');
		await login(h);
		assert.equal(h.store.userVar()._id, String(fixture.user._id)); assert(h.auth.getJwtToken());
		assert(!storage.has('accessToken'));
		assert(!JSON.stringify(h.client.cache.extract()).includes('memberPhone'));
		pass('real cookie login keeps access credential in memory and owner receipt outside Apollo cache');
		h = harness();
		await h.auth.updateUserInfo();
		assert.equal(h.store.userVar()._id, String(fixture.user._id));
		assert.equal(h.store.userVar().memberPhone, fixture.user.memberPhone);
		pass('fresh memory bootstrap uses refresh cookie followed by getMyMember');
		const identity = h.auth.getAuthSessionId(), profile = h.store.userVar(), before = count('RefreshSession');
		advance();
		await Promise.all(Array.from({ length: 12 }, () => owner(h)));
		resetClock();
		assert.equal(count('RefreshSession') - before, 1);
		assert.equal(h.auth.getAuthSessionId(), identity); assert.equal(h.store.userVar(), profile);
		pass('12 concurrent near-expiry reads share one refresh and preserve logical session/profile identity');
		for (const account of [fixture.user, fixture.trainer, fixture.admin]) {
			await login(h, account); await h.auth.updateUserInfo();
			assert.equal(h.store.userVar().memberType, account.memberType);
			assert(!JSON.stringify(h.client.cache.extract()).includes('memberPhone'));
		}
		pass('USER/TRAINER/ADMIN restore the current private owner without cache leakage');
		await login(h);
		const uploadIdentity = h.auth.getAuthSessionId();
		advance();
		const uploadToken = await h.auth.ensureAccessToken(true);
		resetClock();
		const data = new FormData();
		data.append('operations', JSON.stringify({ query: 'mutation Upload($file:Upload!,$target:String!){imageUploader(file:$file,target:$target)}', variables: { file: null, target: 'member' } }));
		data.append('map', JSON.stringify({ 0: ['variables.file'] }));
		const sharp = require('node:module').createRequire(path.join(__dirname, '../../gymflow/package.json'))('sharp');
		const fixturePng = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
		data.append('0', new Blob([fixturePng], { type: 'image/png' }), 'session.png');
		const upload = await global.fetch(fixture.uri, { method: 'POST', headers: { Authorization: 'Bearer ' + uploadToken, 'Apollo-Require-Preflight': 'true' }, body: data });
		assert(!(await upload.json()).errors); assert.equal(h.auth.getAuthSessionId(), uploadIdentity);
		pass('multipart upload dispatches once using refreshed access while logical upload identity remains stable');
		const input = { articleCategory: 'FREE', articleTitle: 'Session safety story', articleContent: '<p>A disposable story verifies one-time authenticated publication handling.</p>' };
		const create = () => h.client.mutate({ mutation: mutations.CREATE_BOARD_ARTICLE, variables: { input }, context: { handleErrorLocally: true } });
		const mutationBefore = count('CreateBoardArticle');
		fail = 'CreateBoardArticle';
		await assert.rejects(create());
		assert.equal(count('CreateBoardArticle') - mutationBefore, 1);
		assert.equal(await fixture.db.model('BoardArticle').countDocuments({ memberId: fixture.user._id }), 1);
		pass('uncertain successful publication is never automatically replayed');
		held = false; hold = 'CreateBoardArticle';
		const pendingMutation = create().then(() => null, (error) => error);
		await until(() => held);
		await h.auth.invalidateSession(); release();
		assert(await pendingMutation);
		assert.equal(Object.keys(h.client.cache.extract()).length, 0);
		pass('obsolete mutation response cannot repopulate Apollo after local invalidation');
		await login(h);
		flatError = 'GetMyMember';
		await assert.rejects(owner(h));
		assert.equal(h.auth.getJwtToken(), ''); assert.equal(h.store.userVar()._id, '');
		assert.equal(Object.keys(h.client.cache.extract()).length, 0);
		pass('actual flattened UNAUTHENTICATED shape clears memory, owner and private cache');
		await login(h); advance(); unauthorized = true;
		await assert.rejects(h.auth.ensureAccessToken(true)); resetClock();
		assert.equal(h.auth.getJwtToken(), ''); assert.equal(h.store.userVar()._id, '');
		pass('non-JSON HTTP 401 is definitive authentication rejection rather than a temporary outage');
		await login(h); advance(); badReceipt = true;
		await assert.rejects(h.auth.ensureAccessToken(true)); resetClock();
		assert.equal(h.auth.getJwtToken(), ''); assert.equal(h.store.userVar()._id, '');
		pass('invalid refresh receipt clears rejected credentials and cannot retain a writable session');
		await login(h);
		await h.client.query({ query: queries.GET_MY_MEMBER, fetchPolicy: 'no-cache', context: {
			headers: { authorization: 'Bearer obsolete-credential' }, handleErrorLocally: true,
		} });
		assert(new Headers(requests.at(-1).headers).get('authorization') === 'Bearer ' + h.auth.getJwtToken());
		pass('memory credential overrides obsolete request-context Authorization headers');
		await login(h);
		held = false; hold = 'RefreshSession'; advance();
		const pendingRefresh = h.auth.ensureAccessToken().then(() => null, (error) => error);
		await until(() => held);
		resetClock();
		const logout = h.auth.logOut();
		release(); await pendingRefresh; assert.equal(await logout, true);
		assert.equal(h.auth.getJwtToken(), ''); assert.equal(h.store.userVar()._id, '');
		assert(!storage.has('gymflow.logoutPending')); assert.equal(navigation.at(-1), '/');
		const reload = harness(); await reload.auth.updateUserInfo(); assert.equal(reload.store.userVar()._id, '');
		pass('logout during refresh cannot resurrect credentials; server revocation survives reload');
		await login(h);
		held = false; hold = 'RefreshSession'; advance();
		const obsolete = h.auth.ensureAccessToken().catch(() => '');
		await until(() => held); resetClock();
		const switchAccount = login(h, fixture.trainer);
		release(); await obsolete; await switchAccount;
		assert.equal(h.store.userVar()._id, String(fixture.trainer._id));
		pass('account switching during refresh fences the obsolete USER response');
		await login(h);
		const clearStore = h.client.clearStore.bind(h.client);
		let clearHeld = false, releaseClear;
		h.client.clearStore = async () => {
			await clearStore();
			if (!clearHeld) { clearHeld = true; await new Promise((resolve) => { releaseClear = resolve; }); }
		};
		const obsoleteLogout = h.auth.logOut();
		await until(() => releaseClear);
		await login(h, fixture.trainer);
		releaseClear(); await obsoleteLogout;
		h.client.clearStore = clearStore;
		const restoredSwitch = harness(); await restoredSwitch.auth.updateUserInfo();
		assert.equal(restoredSwitch.store.userVar()._id, String(fixture.trainer._id));
		pass('obsolete logout waiting for cache cleanup cannot revoke a newer account session');
		const stableIdentity = h.auth.getAuthSessionId(), stableOwner = h.store.userVar();
		advance(); fail = 'RefreshSession';
		await assert.rejects(h.auth.ensureAccessToken(true));
		resetClock();
		assert.equal(h.auth.getAuthSessionId(), stableIdentity); assert.equal(h.store.userVar(), stableOwner);
		assert.equal(h.store.authErrorVar(), '');
		pass('temporary refresh transport failure preserves established owner/form identity');
		await login(h);
		const tab = harness();
		const start = count('RefreshSession');
		await Promise.all([h.auth.updateUserInfo(), tab.auth.updateUserInfo()]);
		assert.equal(tab.store.userVar()._id, String(fixture.user._id));
		assert.equal(count('RefreshSession') - start, 1);
		advance();
		await Promise.all([h.auth.ensureAccessToken(true), tab.auth.ensureAccessToken(true)]);
		resetClock();
		assert(h.auth.getJwtToken() && tab.auth.getJwtToken());
		pass('shared native-lock semantics serialize same-origin tab refresh without reuse revocation');
		for (const file of ['WriteArticle','EditArticle','MyArticles','MyPrograms','AddNewProgram','MyProfile']) {
			const source = fs.readFileSync(path.join(__dirname,'../libs/components/mypage',file+'.tsx'),'utf8');
			assert(!source.includes('getJwtToken'));
			assert(source.includes('getAuthSessionId'));
		}
		assert(!fs.readFileSync(path.join(__dirname,'../libs/components/community/Teditor.tsx'),'utf8').includes('getJwtToken'));
		pass('form/editor scopes use logical session identity while uploads obtain fresh credentials');
	} finally {
		release?.(); clients.forEach((client) => client.stop());
		Date.now = previous.now;
		global.fetch = previous.fetch; global.window = previous.window; global.localStorage = previous.localStorage;
		if (previous.navigator) Object.defineProperty(global,'navigator',previous.navigator); else delete global.navigator;
		if (previous.uri === undefined) delete process.env.REACT_APP_API_GRAPHQL_URL; else process.env.REACT_APP_API_GRAPHQL_URL = previous.uri;
		if (fixture) await fixture.stop();
		process.chdir(previous.cwd); console.log = output;
		assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
		fs.rmSync(temporary,{recursive:true,force:true});
	}
	output(checks+' auth session checks passed.');
}
main().catch((error) => { console.error(error); process.exitCode=1; });
