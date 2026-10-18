const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../libs/config.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
function load(env) {
	const module = { exports: {} };
	vm.runInNewContext(code, { module, exports: module.exports, process: { env }, URL }, { filename });
	return module.exports;
}
const production = {
	NODE_ENV: 'production',
	REACT_APP_API_URL: 'https://gymflow.example',
	REACT_APP_API_GRAPHQL_URL: 'https://gymflow.example/graphql',
};
let checks = 0;
function check(name, action) {
	action();
	checks++;
	console.log('PASS ' + name);
}
check('production uses configured HTTPS media and GraphQL endpoints without legacy WS', () => {
	const config = load({ ...production });
	assert.equal(config.REACT_APP_API_URL, production.REACT_APP_API_URL);
	assert.equal(config.getApiGraphqlUrl(), production.REACT_APP_API_GRAPHQL_URL);
	assert.equal(load({ ...production, REACT_APP_API_URL: 'https://gymflow.example/' }).REACT_APP_API_URL, production.REACT_APP_API_URL);
	assert.equal(load({ ...production, REACT_APP_API_GRAPHQL_URL: 'https://api.gymflow.example/api/graphql' }).getApiGraphqlUrl(), 'https://api.gymflow.example/api/graphql');
});
for (const name of ['REACT_APP_API_URL', 'REACT_APP_API_GRAPHQL_URL']) {
	for (const value of [undefined, '', 'undefined'])
		check(name + ' fails clearly when missing', () => {
			assert.throws(() => load({ ...production, [name]: value }), new RegExp(name + ' is required'));
		});
	for (const value of ['not-a-url', '/graphql', 'https:/gymflow.example/graphql', 'http://gymflow.example/graphql', ' https://gymflow.example/graphql'])
		check(name + ' rejects malformed, relative or insecure production URLs', () => {
			assert.throws(() => load({ ...production, [name]: value }), new RegExp(name + ' must be a valid absolute HTTPS URL'));
		});
	for (const value of ['https://user:password@gymflow.example/graphql', 'https://gymflow.example/graphql?token=example', 'https://gymflow.example/graphql#fragment'])
		check(name + ' rejects credentials, query strings and fragments', () => {
			assert.throws(() => load({ ...production, [name]: value }), new RegExp(name + ' must not contain'));
		});
	for (const host of ['localhost', '127.0.0.1', '[::1]', '0.0.0.0', 'api.localhost'])
		check(name + ' rejects production loopback hosts', () => {
			assert.throws(() => load({ ...production, [name]: 'https://' + host + '/graphql' }), new RegExp(name + ' must not use a loopback'));
		});
}
check('production GraphQL configuration requires an endpoint path', () => {
	assert.throws(() => load({ ...production, REACT_APP_API_GRAPHQL_URL: 'https://gymflow.example' }), /GraphQL endpoint path/);
});
check('development retains local defaults and explicitly configured fixture endpoints', () => {
	const env = { NODE_ENV: 'development' };
	const config = load(env);
	assert.equal(config.REACT_APP_API_URL, 'http://localhost:3007');
	assert.equal(config.getApiGraphqlUrl(), 'http://localhost:3007/graphql');
	env.REACT_APP_API_GRAPHQL_URL = 'http://127.0.0.1:45678/graphql';
	assert.equal(config.getApiGraphqlUrl(), env.REACT_APP_API_GRAPHQL_URL);
});
console.log(checks + ' production configuration checks passed.');
