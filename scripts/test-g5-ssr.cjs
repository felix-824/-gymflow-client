// Exercise the real next-i18next wrapper; unrelated app providers have no SSR effects here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToString } = require('react-dom/server');
const translations = require('next-i18next');
const { serverSideTranslations } = require('next-i18next/serverSideTranslations');

const root = path.resolve(__dirname, '..');
const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
function loadApp(translationOverrides = {}) {
	const file = path.join(root, 'pages/_app.tsx');
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file,
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.React, esModuleInterop: true },
	}).outputText;
	const mocks = {
		'@mui/material/styles': { ThemeProvider: passthrough, createTheme: () => ({}) },
		'@mui/material': { CssBaseline: () => null },
		'../libs/auth': {}, '../scss/MaterialTheme': { light: {} },
		'@apollo/client': { ApolloProvider: passthrough }, '../apollo/client': { useApollo: () => ({}) },
		'next-i18next': { ...translations, ...translationOverrides },
	};
	const module = { exports: {} };
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.endsWith('.scss')) return {};
		if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), name), 'utf8'));
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports.default;
}

async function main() {
	let checks = 0;
	const pass = (name) => { checks++; console.log('PASS ' + name); };
	const Fallback = () => React.createElement('main', null, 'Fallback page');
	const props = { Component: Fallback, pageProps: {}, router: { locale: 'en' } };
	// Must run before any serverSideTranslations call creates an i18next instance.
	assert.equal(renderToString(React.createElement(loadApp(), props)), '<main>Fallback page</main>');
	pass('cold/error SSR without translation props or an i18next instance renders safely');
	assert.equal(renderToString(React.createElement(loadApp({ useTranslation: () => ({ i18n: { hasResourceBundle: () => false } }) }), props)), '<main>Fallback page</main>');
	pass('an incomplete translation instance cannot trigger namespace registration');
	const registrationError = new Error('Namespace registration failed');
	assert.throws(() => renderToString(React.createElement(loadApp({ useTranslation: () => ({ i18n: {
		hasResourceBundle: () => false, addResourceBundle: () => { throw registrationError; },
	} }) }), props)), (error) => error === registrationError);
	pass('legitimate namespace registration failures propagate');
	const App = loadApp();
	for (const locale of ['en', 'kr', 'ru']) {
		const pageProps = await serverSideTranslations(locale, ['common']);
		assert.deepEqual(pageProps._nextI18Next.ns, ['common']);
		const messages = JSON.parse(fs.readFileSync(path.join(root, 'public/locales', locale, 'gyms.json'), 'utf8'));
		const Navigation = () => React.createElement('nav', null, translations.useTranslation('gyms').t('navigation'));
		assert.equal(renderToString(React.createElement(App, { Component: Navigation, pageProps, router: { locale } })), '<nav>' + messages.navigation + '</nav>');
		pass(locale + ' common-only SSR resolves the shared Gym namespace');
	}
	console.log(checks + ' G5 SSR regression checks passed. No server or database used.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
