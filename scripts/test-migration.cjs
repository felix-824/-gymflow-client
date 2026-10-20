const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('.')) return loadTs(path.resolve(path.dirname(file), name + '.ts'), mocks, cache);
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + output + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}
const forms = loadTs(path.join(__dirname, '../libs/program.ts'));
const { ProgramType, ProgramCategory, ProgramLocation } = loadTs(path.join(__dirname, '../libs/enums/program.enum.ts'));
const valid = {
	programName: 'Strength training', programType: ProgramType.PT_1ON1, programCategory: ProgramCategory.MUSCLE_GAIN,
	programLocation: ProgramLocation.SEOUL, programPrice: 0, programDuration: 60, programCapacity: 1,
	programImages: ['uploads/program/a.png'], programAddress: 'Seoul gym',
};
const { formatterStr } = loadTs(path.join(__dirname, '../libs/utils.ts'), { './sweetAlert': { sweetMixinErrorAlert: () => {} } });
check('free pricing renders as zero rather than an empty price', () => assert.equal(formatterStr(0), '0'));
check('malformed URL JSON is safe', () => assert.equal(forms.readProgramsInquiry('{').page, 1));
check('array and null URL values are safe', () => { assert.equal(forms.readProgramsInquiry(null).limit, 9); assert.equal(forms.readProgramsInquiry([]).page, 1); });
check('URL input drops legacy and administrative fields', () => {
	const result = forms.readProgramsInquiry({ page: 2, sort: 'programPrice', search: { programRooms: [1], programStatus: 'DELETE', text: ' yoga ', categoryList: ['YOGA', 'APARTMENT'], locationList: ['SEOUL', 'JEJU'], pricesRange: { start: 0, end: 1000 } } });
	assert.deepEqual(JSON.parse(JSON.stringify(result.search)), { categoryList: ['YOGA'], locationList: ['SEOUL'], text: 'yoga', pricesRange: { start: 0, end: 1000 } });
	assert.equal(result.page, 2);
});
check('pagination and sorting are bounded to backend fields', () => {
	const result = forms.readProgramsInquiry({ page: 2147483648, limit: 10000, sort: 'programRent', direction: 'INVALID' });
	assert.equal(result.page, 1); assert.equal(result.limit, 9); assert.equal(result.sort, 'createdAt'); assert.equal(result.direction, 'DESC');
});
check('invalid price and createdAt ranges are omitted', () => {
	for (const range of [{ start: -1, end: 1 }, { start: 10, end: 1 }, { start: 0.5, end: 1 }, { start: 0, end: Infinity }]) assert.equal(forms.readProgramsInquiry({ search: { pricesRange: range } }).search.pricesRange, undefined);
	assert.equal(forms.readProgramsInquiry({ search: { periodsRange: { start: 'bad', end: 'bad' } } }).search.periodsRange, undefined);
});
check('trainer management allows paused but excludes deleted', () => {
	assert.equal(forms.readTrainerProgramsInquiry('{"page":2,"search":{"programStatus":"PAUSED"}}').search.programStatus, 'PAUSED');
	assert.equal(forms.readTrainerProgramsInquiry({ search: { programStatus: 'DELETE' } }).search.programStatus, undefined);
});
check('trainer URL search keeps only allowed fields', () => {
	const result = forms.readTrainersInquiry({ page: -1, sort: 'memberProperties', search: { text: ' trainer ', memberType: 'ADMIN' } }, { page: 1, limit: 9, sort: 'createdAt', search: {} });
	assert.equal(result.page, 1); assert.equal(result.sort, 'createdAt'); assert.deepEqual(JSON.parse(JSON.stringify(result.search)), { text: 'trainer' });
});
check('Trainer search preserves literal text and bounds normalized queries', () => {
	const fallback = { page: 1, limit: 9, search: {} };
	assert.equal(forms.readTrainersInquiry({ search: { text: ' gym.* ' } }, fallback).search.text, 'gym.*');
	assert.equal(forms.readTrainersInquiry({ search: { text: 'x'.repeat(101) } }, fallback).search.text.length, 100);
	assert.equal(Object.hasOwn(forms.readTrainersInquiry({ search: { text: '   ' } }, fallback).search, 'text'), false);
});
const trainerPageSource = fs.readFileSync(path.join(__dirname, '../pages/trainer/index.tsx'), 'utf8');
const adminPageSource = fs.readFileSync(path.join(__dirname, '../pages/_admin/users/index.tsx'), 'utf8');
check('existing Trainer and Admin search inputs expose a native 100-character bound', () => {
	assert.match(trainerPageSource, /type=\{'search'\}\s+maxLength=\{100\}/);
	assert.match(adminPageSource, /<OutlinedInput\s+inputProps=\{\{ maxLength: 100 \}\}/);
});
check('Admin member dispatch trims literal text and omits blanks without changing filters', () => {
	const source = ts.createSourceFile('admin-users.tsx', adminPageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	let handler;
	const visit = (node) => {
		if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'searchTextHandler') handler = node.initializer.getText(source);
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.ok(handler, 'exercise the actual Admin dispatch handler');
	const output = ts.transpileModule('(' + handler + ')()', { compilerOptions: { target: ts.ScriptTarget.ES2019 } }).outputText;
	for (const [searchText, expected] of [[' gym.* ', 'gym.*'], ['gym  studio', 'gym  studio'], ['   ', undefined], ['', undefined]]) {
		const original = { page: 2, limit: 10, search: { text: 'previous', memberType: 'TRAINER', memberStatus: 'ACTIVE' } };
		let dispatched;
		vm.runInNewContext(output, { searchText, membersInquiry: original, setMembersInquiry: (value) => { dispatched = value; }, console });
		assert.equal(dispatched.search.text, expected);
		assert.equal(Object.hasOwn(dispatched.search, 'text'), expected !== undefined);
		assert.equal(dispatched.search.memberType, 'TRAINER');
		assert.equal(dispatched.search.memberStatus, 'ACTIVE');
		assert.equal(dispatched.page, original.page);
		assert.equal(original.search.text, 'previous');
	}
});
check('a free program is valid', () => assert.equal(forms.programFormError(valid), ''));
check('numeric fields reject fractions, overflow and missing values', () => {
	for (const patch of [{ programPrice: -1 }, { programPrice: 1.2 }, { programPrice: NaN }, { programDuration: 0 }, { programCapacity: 0 }, { programDuration: 2147483648 }]) assert.ok(forms.programFormError({ ...valid, ...patch }));
});
check('PT capacity and online pairing are enforced', () => {
	assert.ok(forms.programFormError({ ...valid, programCapacity: 2 }));
	assert.ok(forms.programFormError({ ...valid, programType: 'ONLINE' }));
	assert.ok(forms.programFormError({ ...valid, programLocation: 'ONLINE' }));
	assert.equal(forms.programFormError({ ...valid, programType: 'ONLINE', programLocation: 'ONLINE', programAddress: '' }), '');
});
check('offline address, name, description and images have boundaries', () => {
	for (const patch of [{ programAddress: '' }, { programAddress: 'ab' }, { programName: 'ab' }, { programName: 'a'.repeat(101) }, { programDesc: 'abcd' }, { programDesc: 'a'.repeat(501) }, { programImages: [] }, { programImages: [''] }]) assert.ok(forms.programFormError({ ...valid, ...patch }));
	assert.equal(forms.programFormError({ ...valid, programName: 'a'.repeat(100), programDesc: 'a'.repeat(500) }), '');
});
check('create payload whitelists fields and omits blank optional values', () => {
	const result = forms.programPayload({ ...valid, _id: 'untrusted', memberId: 'owner', programRank: 9, programAddress: '', programDesc: '   ' });
	assert.equal(result._id, undefined); assert.equal(result.memberId, undefined); assert.equal(result.programRank, undefined);
	assert.equal(Object.hasOwn(result, 'programAddress'), false); assert.equal(Object.hasOwn(result, 'programDesc'), false);
});
check('update payload uses null to clear optional fields', () => {
	const result = forms.programPayload({ ...valid, programAddress: '', programDesc: '' }, true);
	assert.equal(result.programAddress, null); assert.equal(result.programDesc, null);
});

const createVar = (initial) => { let state = initial; return (...args) => { if (args.length) state = args[0]; return state; }; };
function authHarness() {
	const storage = new Map(), calls = [], refreshCalls = [];
	const store = { emptyUser: { _id: '', memberType: '' }, userVar: createVar({ _id: '', memberType: '' }), authReadyVar: createVar(false), authErrorVar: createVar('') };
	const member = { _id: 'a'.repeat(24), memberNick: 'trainer', memberType: 'TRAINER', memberStatus: 'ACTIVE', memberPrograms: 2, memberImage: null };
	const token = JSON.stringify({ sub: member._id, sid: 'b'.repeat(24), purpose: 'access', exp: Math.floor(Date.now() / 1000) + 900 });
	member.accessToken = token;
	const client = { clearStore: async () => {}, query: async (request) => { calls.push(request); return client.respond(request); }, respond: async () => ({ data: { getMyMember: member } }), mutate: async () => ({ data: { login: member, signup: member } }) };
	global.window = { location: { reload() {}, replace() {} } };
	global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
	const refresh = { guest: false, failure: false };
	global.fetch = async (...args) => {
		refreshCalls.push(args);
		if (refresh.failure) throw new Error('Network unavailable');
		return { ok: true, json: async () => refresh.guest ? { errors: [{ code: 'UNAUTHENTICATED' }] } : { data: { refreshSession: { accessToken: token } } } };
	};
	const auth = loadTs(path.join(__dirname, '../libs/auth/index.ts'), {
		'jwt-decode': (value) => JSON.parse(value), 'graphql': { print: (value) => value }, '../../apollo/client': { initializeApollo: () => client },
		'../../apollo/store': store, '../../apollo/user/mutation': { LOGIN: 'LOGIN', SIGN_UP: 'SIGN_UP', REFRESH_SESSION: 'REFRESH_SESSION', LOGOUT_SESSION: 'LOGOUT_SESSION' }, '../../apollo/user/query': { GET_MY_MEMBER: 'GET_MY_MEMBER' },
	});
	return { auth, storage, store, client, calls, member, token, refresh, refreshCalls };
}
async function authChecks() {
	const previousFetch = global.fetch;
	try {
		let h = authHarness();
		await h.auth.logIn('trainer', 'password');
		check('login applies owner receipt and keeps credentials only in memory', () => {
			assert.equal(h.store.userVar().memberNick, 'trainer'); assert.equal(h.store.userVar().memberPrograms, 2);
			assert.equal(h.auth.getJwtToken(), h.token); assert.equal(h.storage.has('accessToken'), false);
		});
		for (const role of ['USER', 'TRAINER', 'ADMIN']) {
			h = authHarness();
			h.member.memberType = 'USER';
			let request;
			h.client.mutate = async (value) => { request = value; return { data: { signup: h.member } }; };
			// Simulate untyped callers injecting role data into the context or using the removed role argument.
			for (const context of [undefined, { memberType: role, type: role, handleErrorLocally: true }, role]) {
				await h.auth.signUp('member', 'password', 'phone', context);
				assert.deepEqual(request.variables.input, { memberNick: 'member', memberPassword: 'password', memberPhone: 'phone', memberType: 'USER' });
				assert.equal(h.store.userVar().memberType, 'USER');
				assert.equal(h.store.authReadyVar(), true);
				assert.equal(h.auth.getJwtToken(), h.token);
				assert.equal(h.storage.has('accessToken'), false);
			}
		}
		check('signup always sends USER despite injected TRAINER/ADMIN roles and establishes the memory-only USER session', () => {});
		h = authHarness(); h.storage.set('accessToken', 'obsolete-long-lived-token');
		const first = h.auth.updateUserInfo(), duplicate = h.auth.updateUserInfo();
		assert.equal(first, duplicate); await first;
		check('bootstrap deduplicates cookie refresh then loads the owner without caching', () => {
			assert.equal(h.refreshCalls.length, 1); assert.deepEqual(h.calls.map((call) => call.query), ['GET_MY_MEMBER']);
			assert.equal(h.calls[0].variables, undefined); assert.equal(h.calls[0].fetchPolicy, 'no-cache');
			assert.equal(h.calls[0].context.queryDeduplication, false); assert.equal(h.store.authReadyVar(), true);
			assert.equal(h.storage.has('accessToken'), false);
		});
		h = authHarness(); h.storage.set('accessToken', 'expired-legacy-token'); h.refresh.guest = true; await h.auth.updateUserInfo();
		check('legacy storage is removed and absent refresh session resolves as guest', () => {
			assert.equal(h.storage.has('accessToken'), false); assert.equal(h.calls.length, 0);
			assert.equal(h.store.userVar()._id, ''); assert.equal(h.store.authErrorVar(), '');
		});
		h = authHarness(); h.refresh.failure = true; await h.auth.updateUserInfo();
		check('temporary bootstrap failure exposes Retry without storing credentials', () => {
			assert.equal(h.storage.has('accessToken'), false); assert.ok(h.store.authErrorVar());
		});
		h = authHarness(); h.client.respond = async () => { throw { graphQLErrors: [{ code: 'UNAUTHENTICATED' }] }; }; await h.auth.updateUserInfo();
		check('actual flattened unauthenticated response clears memory and owner state', () => {
			assert.equal(h.auth.getJwtToken(), ''); assert.equal(h.store.userVar()._id, '');
		});
		h = authHarness(); h.member.memberStatus = 'BLOCK'; await h.auth.updateUserInfo();
		check('blocked owner cannot restore', () => assert.equal(h.store.userVar()._id, ''));
		h = authHarness(); h.member.memberType = 'USER'; await h.auth.updateUserInfo();
		check('restoration applies current server role', () => assert.equal(h.store.userVar().memberType, 'USER'));
		check('ownership and role denial do not mean logout', () => assert.equal(h.auth.isAuthenticationError({ graphQLErrors: [{ code: 'FORBIDDEN' }] }), false));
		h = authHarness(); let resume;
		h.client.respond = () => new Promise((resolve) => { resume = resolve; });
		const pending = h.auth.updateUserInfo();
		while (!resume) await new Promise((resolve) => setTimeout(resolve, 0));
		await h.auth.invalidateSession(); resume({ data: { getMyMember: h.member } }); await pending;
		check('obsolete owner response cannot restore a logged-out generation', () => assert.equal(h.store.userVar()._id, ''));
	} finally { global.fetch = previousFetch; delete global.window; delete global.localStorage; }
}
const watchdog = setTimeout(() => { console.error('Migration unit tests did not settle'); process.exitCode = 1; }, 60000);
authChecks().then(async () => {
	checks += await require('./test-form.cjs')(loadTs, forms);
	console.log(checks + ' migration unit checks passed.');
}).catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
