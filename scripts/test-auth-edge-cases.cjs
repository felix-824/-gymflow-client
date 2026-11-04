// Actual frontend auth/Apollo and backend contracts; owned disposable database only.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const { gql } = require('@apollo/client');
const output = console.log;
let checks = 0;
const pass = message => { checks++; output('PASS ' + message); };
function load(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
		module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true,
	} }).outputText;
	const module = { exports: {} }; cache.set(file, module.exports);
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })((name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		return name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts', mocks, cache) : require(name);
	}, module, module.exports);
	return module.exports;
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function until(test) {
	for (let n = 0; !test(); n++) { assert(n < 1000, 'Condition did not settle'); await new Promise(done => setTimeout(done, 5)); }
}
async function main() {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-auth-edge-'));
	const previous = { cwd: process.cwd(), fetch: global.fetch, now: Date.now, window: global.window,
		storage: global.localStorage, navigator: Object.getOwnPropertyDescriptor(global, 'navigator'), uri: process.env.REACT_APP_API_GRAPHQL_URL };
	let fixture, hold, expiry, synthetic, drop;
	const clients = [], subscriptions = [], requests = [], storage = new Map();
	// Access-expiry scenarios move the JWT clock only; preserve native Date/Mongoose serialization.
	const at = ms => { Date.now = () => ms; };
	const realTime = () => { Date.now = previous.now; };
	const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
	try {
		console.log = () => {}; process.chdir(temporary);
		fixture = await require('./test-trainer-reservations.cjs').createFixture({ productionErrors: true });
		process.env.REACT_APP_API_GRAPHQL_URL = fixture.uri;
		global.window = {};
		global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) };
		let tail = Promise.resolve();
		const locks = { request: (_name, action) => { const result = tail.then(action); tail = result.catch(() => {}); return result; } };
		Object.defineProperty(global, 'navigator', { configurable: true, value: { locks } });
		const queries = load(path.join(__dirname, '../apollo/user/query.ts'));
		const mutations = load(path.join(__dirname, '../apollo/user/mutation.ts'));
		const policy = load(path.join(__dirname, '../apollo/auth-policy.ts'));
		const count = name => requests.filter(r => r.name === name).length;
		global.fetch = async (url, options) => {
			assert.equal(String(url), fixture.uri, 'No application database/API requests allowed');
			const body = JSON.parse(options.body), name = body.operationName || body.query.match(/(?:query|mutation)\s+(\w+)/)?.[1];
			requests.push({ name, bearer: Boolean(new Headers(options.headers).get('Authorization')) });
			if (synthetic?.name === name) {
				const result = synthetic.result; synthetic = null;
				return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
			}
			const cycle = expiry?.name === name ? expiry : null;
			if (cycle) {
				cycle.started++;
				if (cycle.started === cycle.total) { expiry = null; at(Date.now() + 901000); cycle.ready.resolve(); }
				await cycle.ready.promise;
			}
			if (drop?.name === name) {
				const lost = drop; drop = null;
				const headers = new Headers(options.headers); headers.set('Cookie', lost.cookie);
				const response = await previous.fetch(url, { ...options, headers }); await response.text();
				throw new Error('Disposable response lost before cookie delivery');
			}
			const response = await fixture.sessionFetch(url, options);
			if (cycle) {
				cycle.finished++;
				if (cycle.finished === cycle.total) cycle.responses.resolve();
				await cycle.responses.promise;
			}
			if (hold?.name === name) {
				const held = hold; hold = null; held.started.resolve(); await held.release.promise;
			}
			return response;
		};
		function harness() {
			let auth;
			const store = load(path.join(__dirname, '../apollo/store.ts'));
			const clientModule = load(path.join(__dirname, '../apollo/client.ts'), {
				'../libs/auth': Object.fromEntries(['ensureAccessToken','getAuthGeneration','getJwtToken','invalidateSession','isAuthenticationError','renewExpiredAccessToken','updateUserInfo'].map(name => [name, (...args) => auth[name](...args)])),
				'../libs/sweetAlert': { sweetErrorAlert: () => {} },
			});
			const client = clientModule.initializeApollo(); clients.push(client);
			auth = load(path.join(__dirname, '../libs/auth/index.ts'), {
				'next/router': { __esModule: true, default: { replace: async () => true } },
				'../../apollo/client': clientModule, '../../apollo/store': store,
				'../../apollo/user/query': queries, '../../apollo/user/mutation': mutations,
			});
			return { auth, client, store };
		}
		const login = async (h, account = fixture.user) => { realTime(); await h.auth.logIn(account.memberNick, fixture.password); };
		const owner = h => h.client.query({ query: queries.GET_MY_MEMBER, fetchPolicy: 'no-cache', context: { queryDeduplication: false, handleErrorLocally: true } });
		const expire = (name, total = 1) => { expiry = { name, total, started: 0, finished: 0, ready: deferred(), responses: deferred() }; };
		const pause = name => { const held = { name, started: deferred(), release: deferred() }; hold = held; return held; };
		const expiredError = { message: 'Please sign in with an active account', extensions: { code: 'UNAUTHENTICATED', reason: 'ACCESS_TOKEN_EXPIRED' } };
		assert(policy.isPublicQuery(gql('query{alias:getPrograms(input:{page:1,limit:1,search:{}}){list{_id}}}')));
		assert(!policy.isPublicQuery(gql('query{getMyMember{_id} getPrograms(input:{page:1,limit:1,search:{}}){list{_id}}}')));
		assert(!policy.isPublicQuery(gql('query{...Private} fragment Private on Query{getMyMember{_id}}')));
		assert(!policy.isRetryableQuery(mutations.CREATE_PROGRAM)); assert(!policy.isRetryableQuery(queries.GET_MEMBER));
		assert(!policy.isAccessExpiry([expiredError, { extensions: { code: 'FORBIDDEN' } }]));
		pass('AST policies deny mixed private/public roots, root fragments, mutations and view-recording retries; mixed errors are not expiry-only');
		let h = harness();
		for (const account of [fixture.user, fixture.trainer, fixture.admin]) {
			await login(h, account); expire('GetMyMember', 12);
			const refreshes = count('RefreshSession'), reads = count('GetMyMember'), identity = h.auth.getAuthSessionId();
			const results = await Promise.all(Array.from({ length: 12 }, () => owner(h)));
			assert(results.every(result => result.data.getMyMember._id === String(account._id)));
			assert.equal(count('RefreshSession') - refreshes, 1); assert.equal(count('GetMyMember') - reads, 24);
			assert.equal(h.auth.getAuthSessionId(), identity); assert.equal(h.store.userVar().memberType, account.memberType);
			pass(account.memberType + ': 12 actual post-dispatch expiry responses share one refresh and each query retries once');
		}
		await login(h); expire('GetMyMember');
		const firstCount = count('GetMyMember'), refreshCount = count('RefreshSession');
		const originalFetch = global.fetch;
		let arrivals = 0;
		global.fetch = async (url, options) => {
			if (JSON.parse(options.body).query.includes('getMyMember') && ++arrivals === 2) expire('GetMyMember');
			return originalFetch(url, options);
		};
		await assert.rejects(owner(h), /session was renewed/); global.fetch = originalFetch;
		assert.equal(count('GetMyMember') - firstCount, 2); assert.equal(count('RefreshSession') - refreshCount, 1);
		pass('A second expiry response terminates after one retry, without a refresh loop');
		await login(h); const sid = claims(h.auth.getJwtToken()).sid;
		await fixture.db.model('AuthSession').updateOne({ _id: sid }, { $set: { revokedAt: new Date() } });
		expire('GetMyMember'); const beforeRevoked = count('GetMyMember');
		await assert.rejects(owner(h)); assert.equal(h.store.userVar()._id, ''); assert.equal(count('GetMyMember') - beforeRevoked, 1);
		pass('Expired access plus revoked refresh fails closed without retrying the private query');
		await login(h); expire('UpdateMember');
		const mutationCount = count('UpdateMember');
		await assert.rejects(h.client.mutate({ mutation: mutations.UPDATE_MEMBER, variables: { input: { memberFullName: 'Never duplicated' } } }), /Check the result/);
		assert.equal(count('UpdateMember') - mutationCount, 1); assert(h.store.userVar()._id);
		assert.notEqual((await fixture.db.model('Member').findById(fixture.user._id).lean()).memberFullName, 'Never duplicated');
		pass('Ordinary mutation expires before execution: access renews, original action is surfaced, no automatic business write/replay');
		await login(h, fixture.trainer); expire('CreateProgram');
		const input = { createRequestId: randomUUID(), programType: 'ONLINE', programCategory: 'YOGA', programLocation: 'ONLINE', programName: 'Auth edge idempotency', programPrice: 0, programDuration: 30, programCapacity: 1, programImages: ['fixture.jpg'] };
		const creates = count('CreateProgram');
		await assert.rejects(h.client.mutate({ mutation: mutations.CREATE_PROGRAM, variables: { input } }), /Check the result/);
		assert.equal(count('CreateProgram') - creates, 1); assert.equal(await fixture.db.model('Program').countDocuments({ programName: input.programName }), 0);
		const a = await h.client.mutate({ mutation: mutations.CREATE_PROGRAM, variables: { input } });
		const b = await h.client.mutate({ mutation: mutations.CREATE_PROGRAM, variables: { input } });
		assert.equal(a.data.createProgram._id, b.data.createProgram._id); assert.equal(await fixture.db.model('Program').countDocuments({ programName: input.programName }), 1);
		pass('Even keyed createProgram is never automatically replayed; explicit retries retain createRequestId and create exactly one Program');
		await login(h); synthetic = { name: 'GetMyMember', result: { data: { checkAuth: 'partial' }, errors: [expiredError] } };
		const partialCount = count('GetMyMember'); await assert.rejects(owner(h), /Check the result/);
		assert.equal(count('GetMyMember') - partialCount, 1);
		pass('Partial GraphQL results never trigger automatic replay');
		await login(h); expire('GetMyMember'); const held = pause('RefreshSession');
		const pending = owner(h).catch(error => error); await held.started.promise;
		const signingOut = h.auth.logOut(); assert.equal(h.store.userVar()._id, '');
		held.release.resolve(); await pending; await signingOut;
		const afterLogout = harness(); await afterLogout.auth.updateUserInfo(); assert.equal(afterLogout.store.userVar()._id, '');
		pass('Logout during post-dispatch recovery fences the retry and prevents restart resurrection');
		await login(h);
		await fixture.db.model('Like').create({ memberId: fixture.user._id, likeRefId: fixture.program._id, likeGroup: 'PROGRAM' });
		h = harness(); const slow = pause('RefreshSession'); const restoring = h.auth.updateUserInfo(); await slow.started.promise;
		const snapshots = [];
		const watch = h.client.watchQuery({ query: queries.GET_PROGRAMS, variables: { input: { page: 1, limit: 10, search: {} } }, fetchPolicy: 'network-only' });
		subscriptions.push(watch.subscribe({ next: result => snapshots.push(result), error: error => { throw error; } }));
		await Promise.all([
			h.client.query({ query: queries.GET_GYMS, variables: { input: { page: 1, limit: 3, search: {} } }, fetchPolicy: 'no-cache' }),
			h.client.query({ query: queries.GET_BOARD_ARTICLES, variables: { input: { page: 1, limit: 3, search: {} } }, fetchPolicy: 'no-cache' }),
			h.client.query({ query: queries.GET_TRAINERS, variables: { input: { page: 1, limit: 3, search: {} } }, fetchPolicy: 'no-cache' }),
		]);
		await until(() => snapshots.some(snapshot => snapshot.data?.getPrograms));
		assert.equal(h.store.authReadyVar(), false);
		assert(requests.slice(-4).every(request => !request.bearer));
		const privateBefore = count('GetMyMember'); let privateDone = false;
		const privateRead = owner(h).then(() => { privateDone = true; });
		await new Promise(resolve => setImmediate(resolve)); assert.equal(privateDone, false); assert.equal(count('GetMyMember'), privateBefore);
		pass('Home/Program, Gym, Community and Trainer reads load anonymously while refresh is held; private read remains blocked');
		slow.release.resolve(); await restoring; await privateRead;
		await until(() => snapshots.some(snapshot => snapshot.data?.getPrograms?.list.some(program => program._id === String(fixture.program._id) && program.meLiked?.[0]?.myFavorite)));
		pass('Restored owner refetches active public personalization without refetching private forms');
		// A late anonymous response must not repopulate guest personalization after restoration.
		await login(h); h = harness(); const late = pause('GetPrograms');
		const lateRead = h.client.query({ query: queries.GET_PROGRAMS, variables: { input: { page: 1, limit: 10, search: {} } }, fetchPolicy: 'network-only' });
		await late.started.promise; await h.auth.updateUserInfo(); late.release.resolve();
		const personalized = await lateRead;
		assert(personalized.data.getPrograms.list.find(program => program._id === String(fixture.program._id)).meLiked[0].myFavorite);
		pass('Late anonymous discovery response is replaced by current identity personalization before reaching Apollo');
		h = harness(); const availableFetch = global.fetch;
		global.fetch = (url, options) => JSON.parse(options.body).query.includes('refreshSession')
			? Promise.resolve(new Response(JSON.stringify({ errors: [{ extensions: { code: 'INTERNAL_SERVER_ERROR' } }] }), { status: 503 }))
			: availableFetch(url, options);
		await h.auth.updateUserInfo(); assert(h.store.authErrorVar());
		const publicDuringOutage = await h.client.query({ query: queries.GET_GYMS, variables: { input: { page: 1, limit: 3, search: {} } }, fetchPolicy: 'no-cache' });
		assert(publicDuringOutage.data.getGyms); await assert.rejects(owner(h)); assert.equal(h.store.userVar()._id, '');
		global.fetch = availableFetch;
		pass('A refresh-service outage leaves public discovery usable and private requests unauthenticated');
		// Simulate response loss before Set-Cookie: retain the old cookie deliberately.
		let cookie = ''; const capture = global.fetch;
		global.fetch = async (...args) => { const response = await capture(...args); cookie = response.headers.get('set-cookie')?.split(';')[0] || cookie; return response; };
		await login(h); global.fetch = capture;
		at(Date.now() + 14 * 60000 + 45000); drop = { name: 'RefreshSession', cookie };
		await assert.rejects(h.auth.ensureAccessToken(true)); assert(h.store.userVar()._id);
		assert.equal(await h.auth.ensureAccessToken(), ''); assert.equal(h.store.userVar()._id, '');
		pass('Accepted lost-cookie response behavior remains strict reuse revocation and explicit re-login');
		realTime(); await login(h);
		const tab = harness(); await tab.auth.updateUserInfo(); at(Date.now() + 14 * 60000 + 45000);
		await Promise.all([h.auth.ensureAccessToken(true), tab.auth.ensureAccessToken(true)]);
		assert(h.auth.getJwtToken() && tab.auth.getJwtToken());
		pass('Coordinated tabs retain rotating shared-session authority');
		// Without native locks, force both calls to capture one cookie before either response is delivered.
		realTime(); await login(h); const tabA = harness(), tabB = harness();
		const unlockedCookieResponse = await fixture.sessionFetch(fixture.uri, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'mutation Login($input:LoginInput!){login(input:$input){_id}}', variables: { input: { memberNick: fixture.user.memberNick, memberPassword: fixture.password } } }) });
		const unlockedCookie = unlockedCookieResponse.headers.get('set-cookie').split(';')[0]; await unlockedCookieResponse.text();
		Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
		const transport = global.fetch;
		global.fetch = (url, options) => {
			const headers = new Headers(options.headers); headers.set('Cookie', unlockedCookie);
			return previous.fetch(url, { ...options, headers });
		};
		const raced = await Promise.allSettled([tabA.auth.ensureAccessToken(true), tabB.auth.ensureAccessToken(true)]);
		assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
		const session = await fixture.db.model('AuthSession').findById(claims(raced.find(result => result.status === 'fulfilled').value).sid).lean(); assert(session.revokedAt);
		global.fetch = transport;
		pass('Without Web Locks, simultaneous old-cookie refresh fails closed by revoking the family; no grace introduced');
		realTime(); await login(h); const otherTab = harness(), pausedRefresh = pause('RefreshSession');
		const restoringOther = otherTab.auth.updateUserInfo(); await pausedRefresh.started.promise;
		const loggingOut = h.auth.logOut();
		otherTab.auth.handleAuthStorage({ key: 'gymflow.auth', newValue: storage.get('gymflow.auth') });
		await loggingOut; pausedRefresh.release.resolve(); await restoringOther;
		assert.equal(otherTab.store.userVar()._id, ''); assert.equal(otherTab.auth.getJwtToken(), '');
		const restarted = harness(); await restarted.auth.updateUserInfo(); assert.equal(restarted.store.userVar()._id, '');
		pass('Without Web Locks, logout/storage invalidation fences another tab\'s late refresh and restart remains anonymous');
	} finally {
		hold?.release.resolve(); realTime(); subscriptions.forEach(sub => sub.unsubscribe()); clients.forEach(client => client.stop());
		global.fetch = previous.fetch; global.window = previous.window; global.localStorage = previous.storage;
		if (previous.navigator) Object.defineProperty(global, 'navigator', previous.navigator); else delete global.navigator;
		if (previous.uri === undefined) delete process.env.REACT_APP_API_GRAPHQL_URL; else process.env.REACT_APP_API_GRAPHQL_URL = previous.uri;
		await fixture?.stop(); process.chdir(previous.cwd); console.log = output;
		assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(temporary, { recursive: true, force: true });
	}
	output(checks + ' auth edge-case checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
