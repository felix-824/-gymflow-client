// Real frontend documents and session restoration against the existing disposable API fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { buildClientSchema, getIntrospectionQuery, parse, validate } = require('graphql');
const { collectDocuments } = require('./check-graphql.cjs');
const output = console.log;
let checks = 0;
const pass = (name) => {
	checks++;
	output('PASS ' + name);
};
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file,
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('.')) return loadTs(path.resolve(path.dirname(file), name) + '.ts', mocks, cache);
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
		localRequire,
		module,
		module.exports,
	);
	return module.exports;
}
async function main() {
	let fixture, client, release;
	const nativeFetch = global.fetch;
	const previous = {
		window: global.window,
		localStorage: global.localStorage,
		WebSocket: global.WebSocket,
		uri: process.env.REACT_APP_API_GRAPHQL_URL,
	};
	try {
		console.log = () => {};
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const response = await nativeFetch(fixture.uri, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: getIntrospectionQuery() }),
		});
		const schema = buildClientSchema((await response.json()).data);
		const documents = collectDocuments();
		for (const document of documents) {
			assert.deepEqual(
				validate(schema, parse(document.query)).map((error) => error.message),
				[],
				document.name,
			);
		}
		pass(documents.length + ' frontend GraphQL documents validate against the implemented backend schema');
		const storage = new Map();
		const requests = [];
		let socketCount = 0,
			holdSelf = false,
			held = false;
		global.window = { location: { reload() {}, replace() {} } };
		global.localStorage = {
			getItem: (key) => storage.get(key) ?? null,
			setItem: (key, value) => storage.set(key, value),
			removeItem: (key) => storage.delete(key),
		};
		global.WebSocket = class {
			constructor() {
				socketCount++;
				throw new Error('Legacy socket must not be constructed');
			}
		};
		process.env.REACT_APP_API_GRAPHQL_URL = fixture.uri;
		global.fetch = async (url, options) => {
			const body = JSON.parse(options.body);
			requests.push(body);
			const response = await fixture.sessionFetch(url, options);
			if (holdSelf && body.operationName === 'GetMyMember') {
				holdSelf = false;
				held = true;
				await new Promise((resolve) => {
					release = resolve;
				});
			}
			return response;
		};
		let auth;
		const clientModule = loadTs(path.join(__dirname, '../apollo/client.ts'), {
			'../libs/auth': {
				getJwtToken: () => auth.getJwtToken(),
				getAuthGeneration: () => auth.getAuthGeneration(),
				ensureAccessToken: (...args) => auth.ensureAccessToken(...args),
				isAuthenticationError: (...args) => auth.isAuthenticationError(...args),
				invalidateSession: () => auth.invalidateSession(),
				updateUserInfo: (...args) => auth.updateUserInfo(...args),
			},
			'../libs/sweetAlert': { sweetErrorAlert: () => {} },
		});
		client = clientModule.initializeApollo();
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const queries = loadTs(path.join(__dirname, '../apollo/user/query.ts'));
		auth = loadTs(path.join(__dirname, '../libs/auth/index.ts'), {
			'../../apollo/client': clientModule,
			'../../apollo/store': store,
			'../../apollo/user/query': queries,
			'../../apollo/user/mutation': loadTs(path.join(__dirname, '../apollo/user/mutation.ts')),
		});
		const guest = await client.query({ query: queries.GET_MEMBER, variables: { input: String(fixture.trainer._id) } });
		assert.equal(guest.data.getMember.__typename, 'PublicMember');
		assert.equal(guest.data.getMember.memberNick, fixture.trainer.memberNick);
		assert.ok(!Object.hasOwn(guest.data.getMember, 'memberPhone'));
		assert.ok(!Object.hasOwn(guest.data.getMember, 'memberAddress'));
		pass('guest public Trainer identity loads through the real narrowed frontend document');
		const ownerRequestsStart = requests.length;
		await auth.logIn(fixture.user.memberNick, fixture.password);
		assert.equal(store.userVar().memberPhone, fixture.user.memberPhone);
		await fixture.members.updateOne({ _id: fixture.user._id }, { memberAddress: 'Owned private address' });
		store.userVar({ ...store.emptyUser });
		const viewsBefore = await fixture.db.model('View').countDocuments({});
		await auth.updateUserInfo(auth.getJwtToken());
		assert.equal(store.userVar().memberAddress, 'Owned private address');
		assert.equal(await fixture.db.model('View').countDocuments({}), viewsBefore);
		const selfRead = requests.find((request) => request.operationName === 'GetMyMember');
		assert.deepEqual(selfRead.variables, {});
		assert.ok(!requests.slice(ownerRequestsStart).some((request) => request.operationName === 'GetMember'));
		pass('USER restoration uses argument-free owner read, retains contacts and has no public view side effect');
		const assertPrivateCacheEmpty = () => {
			const cache = JSON.stringify(client.cache.extract());
			assert.ok(!cache.includes('memberPhone') && !cache.includes('memberAddress') && !cache.includes('accessToken'));
		};
		assertPrivateCacheEmpty();
		const userToken = auth.getJwtToken();
		const trainerToken = fixture.token(fixture.trainer);
		await auth.invalidateSession();
		auth.setJwtToken(trainerToken);
		await auth.updateUserInfo(trainerToken);
		assert.equal(store.userVar().memberPhone, fixture.trainer.memberPhone);
		assert.equal(store.userVar().memberAddress, '');
		assertPrivateCacheEmpty();
		pass('TRAINER restoration and account switching retain only the current owner profile');
		holdSelf = true;
		await auth.invalidateSession();
		auth.setJwtToken(userToken);
		const obsolete = auth.updateUserInfo(userToken);
		for (let attempt = 0; !held; attempt++) {
			assert.ok(attempt < 500, 'owner response was not held');
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		await auth.invalidateSession();
		auth.setJwtToken(trainerToken);
		await Promise.race([
			auth.updateUserInfo(trainerToken),
			new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error('Owner reads deduplicated across tokens')), 3000);
				timer.unref();
			}),
		]);
		release();
		await obsolete;
		assert.equal(store.userVar()._id, String(fixture.trainer._id));
		assert.equal(store.userVar().memberPhone, fixture.trainer.memberPhone);
		assertPrivateCacheEmpty();
		pass('overlapping owner reads never deduplicate across tokens or apply/cache obsolete private responses');
		await auth.invalidateSession();
		assert.equal(store.userVar().memberPhone, '');
		assert.equal(store.userVar().memberAddress, '');
		assert.equal(auth.getJwtToken(), '');
		assertPrivateCacheEmpty();
		pass('logout clears identity, contacts, token and Apollo data');
		assert.equal(socketCount, 0);
		for (const file of ['LayoutHome', 'LayoutBasic', 'LayoutFull']) {
			const source = fs.readFileSync(path.join(__dirname, '../libs/components/layout', file + '.tsx'), 'utf8');
			assert.ok(!source.includes('<Chat') && !source.includes("from '../Chat'"));
		}
		pass('real Apollo HTTP initialization/restoration creates zero legacy sockets; layouts have no Chat mount');
	} finally {
		release?.();
		client?.stop();
		global.fetch = nativeFetch;
		global.window = previous.window;
		global.localStorage = previous.localStorage;
		global.WebSocket = previous.WebSocket;
		if (previous.uri === undefined) delete process.env.REACT_APP_API_GRAPHQL_URL;
		else process.env.REACT_APP_API_GRAPHQL_URL = previous.uri;
		if (fixture) await fixture.stop();
		console.log = output;
	}
	output(checks + ' member privacy checks passed.');
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
