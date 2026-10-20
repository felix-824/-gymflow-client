const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file,
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2021,
			jsx: ts.JsxEmit.React,
			esModuleInterop: true,
		},
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('.')) {
			const target = path.resolve(path.dirname(file), name);
			return loadTs(fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache);
		}
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
		localRequire,
		module,
		module.exports,
	);
	return module.exports;
}

const forms = loadTs(path.join(__dirname, '../libs/program.ts'));
require('./test-form.cjs')(loadTs, forms, { checkControlStyles: true })
	.then((checks) => console.log(checks + ' focused Program editor checks passed.'))
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
