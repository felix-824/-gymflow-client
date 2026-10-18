const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let checks = 0;
const pass = (name) => {
	checks++;
	console.log('PASS ' + name);
};
const base = path.resolve(__dirname, '..');
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(base, file);
	if (cache.has(file)) return cache.get(file);
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
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('.')) {
			const resolved = path.resolve(path.dirname(file), name);
			return loadTs(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '.tsx', mocks, cache);
		}
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
		localRequire,
		module,
		module.exports,
	);
	cache.set(file, module.exports);
	return module.exports;
}
const resources = Object.fromEntries(
	['en', 'kr', 'ru'].map((locale) => [
		locale,
		{
			common: JSON.parse(fs.readFileSync(path.join(base, 'public/locales', locale, 'common.json'), 'utf8')),
		},
	]),
);
function keys(value, prefix = '') {
	return Object.entries(value)
		.flatMap(([key, item]) => (typeof item === 'string' ? [prefix + key] : keys(item, prefix + key + '.')))
		.sort();
}
async function main() {
	const i18n = require('i18next').createInstance();
	await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	const { HELP_TOPICS, HELP_SHORTCUTS, readHelpTopics, filterHelpTopics } = loadTs('libs/help.ts');
	assert.equal(HELP_TOPICS.length, 8);
	assert.deepEqual(
		HELP_TOPICS.map(({ id }) => id),
		['programs', 'booking', 'account', 'favorites', 'trainer-programs', 'schedule', 'community', 'images'],
	);
	const ids = HELP_TOPICS.flatMap((topic) => topic.questions);
	assert.equal(ids.length, 27);
	assert.equal(new Set(ids).size, 27);
	for (const shortcut of HELP_SHORTCUTS) assert(ids.includes(shortcut.questionId));
	assert.equal(HELP_SHORTCUTS.length, 5);
	assert.deepEqual(
		HELP_SHORTCUTS.map(({ questionId }) => questionId),
		['book-session', 'my-bookings', 'find-trainer', 'create-program', 'set-availability'],
	);
	pass('8 topics, 27 unique questions and five valid shortcut targets');
	for (const locale of ['en', 'kr', 'ru']) {
		const data = resources[locale].common['Help center'];
		assert.deepEqual(keys(data), keys(resources.en.common['Help center']));
		const t = i18n.getFixedT(locale);
		for (const key of keys(data)) assert.equal(typeof t('Help center.' + key), 'string');
		const topics = readHelpTopics(t);
		assert.equal(topics.flatMap((topic) => topic.questions).length, 27);
		assert(
			topics.every(
				(topic) =>
					topic.title &&
					topic.description &&
					topic.questions.every((q) => q.answer && q.question && !q.question.startsWith('Help center.')),
			),
		);
		assert.equal(filterHelpTopics(topics, '  '), topics);
		for (const topic of topics) {
			assert(topic.audience && !topic.audience.startsWith('Help center.'));
			assert.deepEqual(
				filterHelpTopics(topics, topic.description).find((item) => item.id === topic.id),
				topic,
			);
			assert.deepEqual(
				filterHelpTopics(topics, '  ' + topic.title.toUpperCase() + '  ').find((item) => item.id === topic.id),
				topic,
			);
			for (const question of topic.questions)
				assert(
					filterHelpTopics(topics, question.question).some((item) => item.questions.some((q) => q.id === question.id)),
				);
		}
		const answerOnly = topics[7].questions[0].answer;
		assert.equal(filterHelpTopics(topics, answerOnly)[0].questions[0].id, 'image-formats');
		for (const query of ['[', '(a+)+$', 'a-topic-that-does-not-exist'])
			assert.deepEqual(filterHelpTopics(topics, query), []);
		pass(locale + ' translated keys, topic/question/answer search, trimming, case and literal metacharacters');
	}
	const redirect = loadTs('pages/cs/index.tsx').getServerSideProps;
	for (const locale of ['en', 'kr', 'ru'])
		for (const tab of [undefined, 'faq', 'notice']) {
			const result = await redirect({ locale, defaultLocale: 'en', query: { tab } });
			assert.deepEqual(result.redirect, {
				destination: locale === 'en' ? '/help' : '/' + locale + '/help',
				permanent: true,
			});
		}
	pass('permanent /cs redirects retain locales and discard obsolete queries');
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/help' });
	const previous = Object.fromEntries(
		['window', 'document', 'navigator', 'HTMLElement', 'DocumentFragment'].map((key) => [
			key,
			Object.getOwnPropertyDescriptor(global, key),
		]),
	);
	for (const key of Object.keys(previous))
		Object.defineProperty(global, key, { configurable: true, value: dom.window[key] });
	let scrolled;
	dom.window.HTMLElement.prototype.scrollIntoView = function () {
		scrolled = this.id;
	};
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { flushSync } = require('react-dom');
	let mobile = false;
	const mocks = {
		'@mui/material': { ...require('@mui/material'), useMediaQuery: () => mobile },
		'next/head': { __esModule: true, default: () => null },
		'next/link': {
			__esModule: true,
			default: ({ children, passHref, ...props }) => React.createElement('a', props, children),
		},
		'next-i18next': { useTranslation: () => ({ t: i18n.getFixedT(i18n.language), i18n }) },
		'next-i18next/serverSideTranslations': {
			serverSideTranslations: async (locale, namespaces) => ({ locale, namespaces }),
		},
		'../../libs/components/layout/LayoutBasic': { __esModule: true, default: (component) => component },
	};
	const page = loadTs('pages/help/index.tsx', mocks);
	const Help = page.default;
	const root = createRoot(document.getElementById('root'));
	const render = () => flushSync(() => root.render(React.createElement(Help)));
	const click = (selector) => flushSync(() => document.querySelector(selector).click());
	const input = (value) =>
		flushSync(() => {
			const element = document.querySelector('#help-search');
			Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
			element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		});
	try {
		for (const locale of ['en', 'kr', 'ru']) {
			await i18n.changeLanguage(locale);
			for (mobile of [false, true]) {
				render();
				assert.equal(document.querySelectorAll('.help-topic').length, 8);
				assert.equal(document.querySelectorAll('.help-question').length, 27);
				assert.equal(document.querySelectorAll('.help-column').length, mobile ? 1 : 2);
				assert.equal(document.querySelectorAll('.help-audience').length, 8);
				const order = [...document.querySelectorAll('.help-topic h3')].map((heading) =>
					heading.id.replace('help-topic-', ''),
				);
				assert.deepEqual(
					order,
					mobile
						? ['programs', 'booking', 'account', 'favorites', 'trainer-programs', 'schedule', 'community', 'images']
						: ['programs', 'account', 'trainer-programs', 'community', 'booking', 'favorites', 'schedule', 'images'],
				);
				assert.equal(document.querySelector('.help-actions a').getAttribute('href'), '/program');
				assert.equal(document.querySelectorAll('.help-actions a')[1].getAttribute('href'), '/trainer');
				assert(!document.querySelector('textarea, iframe, [data-qa]'));
			}
			const props = await page.getStaticProps({ locale });
			assert.deepEqual(props.props, { locale, namespaces: ['common'] });
		}
		pass('actual Help component renders both layouts/all locales and canonical CTAs with normal static translations');
		await i18n.changeLanguage('en');
		render();
		click('#help-question-find-program');
		click('#help-question-find-trainer');
		assert.equal(document.querySelector('#help-question-find-program').getAttribute('aria-expanded'), 'true');
		assert.equal(document.querySelector('#help-question-find-trainer').getAttribute('aria-expanded'), 'true');
		assert.equal(
			document.querySelector('#help-question-find-trainer').getAttribute('aria-controls'),
			'help-answer-find-trainer',
		);
		click('#help-question-find-program');
		assert.equal(document.querySelector('#help-question-find-program').getAttribute('aria-expanded'), 'false');
		pass('independent accordion open/close with explicit accessible controls');
		input('not-a-help-answer');
		assert(document.querySelector('.help-empty[role="status"]'));
		click('.help-empty button');
		assert.equal(document.querySelectorAll('.help-topic').length, 8);
		assert.equal(document.activeElement.id, 'help-search');
		input('  JPEG  ');
		assert(document.querySelector('#help-question-image-formats'));
		assert(!document.querySelector('#help-question-book-session'));
		flushSync(() =>
			document
				.querySelector('#help-search')
				.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
		);
		assert.equal(document.querySelector('#help-search').value, '');
		assert.equal(document.activeElement.id, 'help-search');
		pass('actual search input, no-results feedback, clear and Escape retain focus');
		for (const [index, shortcut] of HELP_SHORTCUTS.entries()) {
			input('JPEG');
			click('.help-shortcut-strip button:nth-child(' + (index + 1) + ')');
			assert.equal(document.querySelector('#help-search').value, '');
			assert.equal(document.activeElement.id, 'help-question-' + shortcut.questionId);
			assert.equal(scrolled, document.activeElement.id);
			assert.equal(document.activeElement.getAttribute('aria-expanded'), 'true');
		}
		pass('all shortcuts reveal filtered-out targets, expand, scroll and focus');
		for (const file of [
			'libs/components/Top.tsx',
			'libs/components/Footer.tsx',
			'libs/components/program/ProgramsNavigation.tsx',
			'pages/account/join.tsx',
			'pages/about/index.tsx',
		]) {
			const source = fs.readFileSync(path.join(base, file), 'utf8');
			assert(source.includes('/help'));
			assert(!source.includes("'/cs'") && !source.includes('"/cs"'));
		}
		pass('approved existing Help entry points use the canonical route');
	} finally {
		root.unmount();
		dom.window.close();
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(global, key, descriptor);
			else delete global[key];
		}
	}
	console.log(checks + ' Help checks passed.');
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
