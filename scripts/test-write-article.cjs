const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let checks = 0;
function check(name, fn) {
	fn();
	checks++;
	console.log('PASS ' + name);
}
function load(file, mocks = {}, cache = new Map()) {
	file = path.resolve(__dirname, '..', file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2019,
			jsx: ts.JsxEmit.React,
			esModuleInterop: true,
		},
	}).outputText;
	const module = { exports: {} };
	const localRequire = (name) => {
		if (name in mocks) return mocks[name];
		if (/\.(css)$/.test(name) || name.includes('/dist/i18n/')) return {};
		if (name.startsWith('@mui/icons-material/')) return () => null;
		if (name.startsWith('.')) {
			const base = path.resolve(path.dirname(file), name);
			return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks, cache);
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
const rules = load('libs/article.ts');
for (const [name, value, valid] of [
	['below 3', 'ab', false],
	['minimum', 'abc', true],
	['50', 'a'.repeat(50), true],
	['51', 'a'.repeat(51), false],
	['whitespace', '   ', false],
	['invisible', '\u200b\u2060\ufeff', false],
	['Unicode', '😀😀😀', true],
	['meaningful minimum', 'a\u200bb', false],
])
	check('title ' + name, () => assert.equal(rules.isArticleTitle(value), valid));
for (const [name, value, valid] of [
	['below 3', 'ab', false],
	['minimum', 'abc', true],
	['5000', 'a'.repeat(5000), true],
	['5001', 'a'.repeat(5001), false],
	['whitespace', '   ', false],
	['invisible', '\u200b\u2060\ufeff', false],
	['empty HTML', '<p><br></p>', false],
	['space entities', '<p>&nbsp;&#x200B;&ZeroWidthSpace;</p>', false],
	['only image', '<img src="uploads/article/a.png">', false],
	['rich HTML', '<h2>Story</h2><p><strong>Training</strong> matters.</p>', true],
	['one visible letter in valid HTML', '<p>a</p>', true],
	['script-only', '<script>not story text</script>', false],
	['comment-only', '<!-- story -->', false],
])
	check('content ' + name, () => assert.equal(rules.isArticleContent(value), valid));
check('counter measures submitted code points including formatting', () =>
	assert.equal(rules.articleCharacterCount('<p>😀</p>'), 8),
);

(async () => {
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
	global.window = dom.window;
	global.document = dom.window.document;
	global.FormData = dom.window.FormData;
	global.IS_REACT_ACT_ENVIRONMENT = true;
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { act, Simulate } = require('react-dom/test-utils');
	const dictionary = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/locales/en/common.json'), 'utf8'));
	const t = (key, variables = {}) => {
		let text = key.split('.').reduce((value, key) => value?.[key], dictionary);
		assert.equal(typeof text, 'string', key);
		for (const [name, value] of Object.entries(variables)) text = text.replace('{{' + name + '}}', String(value));
		return text;
	};
	let user = { _id: 'a'.repeat(24), memberType: 'USER', memberStatus: 'ACTIVE' },
		token = 'fixture-token',
		ready = true,
		authError = '';
	const events = new Map();
	const state = {
		html: '',
		mutations: [],
		uploads: [],
		navigation: [],
		success: [],
		uploadResult: null,
		mutationResult: null,
		editor: null,
		scrolls: 0,
	};
	const router = {
		isReady: true,
		query: { category: 'writeArticle' },
		events: { on: (name, fn) => events.set(name, fn), off: (name) => events.delete(name) },
		push: async (url) => {
			state.navigation.push(url);
			events.get('routeChangeStart')?.();
			if (state.navigationFailure) {
				events.get('routeChangeError')?.();
				throw Error('Navigation failed');
			}
			events.get('routeChangeComplete')?.();
			return true;
		},
	};
	const vars = { userVar: () => user, authReadyVar: () => ready, authErrorVar: () => authError };
	dom.window.HTMLElement.prototype.scrollIntoView = function () {
		state.scrolls++;
	};
	const FakeEditor = React.forwardRef(function FakeEditor(props, ref) {
		state.editor = props;
		const api = { getHTML: () => state.html, destroy: () => {} };
		React.useImperativeHandle(ref, () => ({ getInstance: () => api }));
		return React.createElement(
			React.Fragment,
			null,
			React.createElement(
				'div',
				{ className: 'toastui-editor-md-container', style: { display: 'none' } },
				React.createElement('div', { contentEditable: true, suppressContentEditableWarning: true, tabIndex: 0 }),
			),
			React.createElement(
				'div',
				{ className: 'toastui-editor-ww-container' },
				React.createElement('div', { contentEditable: true, suppressContentEditableWarning: true, tabIndex: 0 }),
			),
		);
	});
	const Link = ({ href, children, passHref, ...props }) =>
		React.createElement(
			'a',
			{ ...props, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) },
			children,
		);
	const mocks = {
		'next/router': { useRouter: () => router },
		'next/link': Link,
		'next-i18next': { useTranslation: () => ({ t, i18n: { language: 'en' } }) },
		'@toast-ui/react-editor': { Editor: FakeEditor },
		'@apollo/client': {
			useReactiveVar: (variable) => variable(),
			useMutation: (document) => [
				async (request) => {
					assert.equal(document, 'CREATE_BOARD_ARTICLE', 'Write Article must only create');
					state.mutations.push(request);
					return state.mutationResult
						? await state.mutationResult()
						: { data: { createBoardArticle: { _id: 'published' } } };
				},
			],
		},
		'../../../apollo/store': vars,
		'../../../apollo/user/mutation': {
			CREATE_BOARD_ARTICLE: 'CREATE_BOARD_ARTICLE',
			UPDATE_BOARD_ARTICLE: 'UPDATE_BOARD_ARTICLE',
		},
		'../../auth': {
			getJwtToken: () => token, getAuthSessionId: () => token, ensureAccessToken: async () => token,
			isAuthenticationError: () => false,
			invalidateSession: () => {
				user = { ...user, _id: '' };
			},
			updateUserInfo: async () => {},
		},
		'../../config': { REACT_APP_API_URL: 'http://localhost:3007' },
		'../../article-html': { sanitizeArticleHtml: (html) => html, articleHtmlPlugin: () => ({}) },
		'../../sweetAlert': { sweetTopSmallSuccessAlert: async (message) => state.success.push(message) },
		axios: {
			post: async (url, data, config) => {
				state.uploads.push({ url, data, config });
				return state.uploadResult
					? await state.uploadResult()
					: { data: { data: { imageUploader: 'uploads/article/cover.png' } } };
			},
		},
		'next/dynamic':
			() =>
			({ memberId }) =>
				React.createElement('div', { 'data-author': memberId }, 'Author form'),
	};
	const Form = load('libs/components/community/Teditor.tsx', mocks).default;
	const Page = load('libs/components/mypage/WriteArticle.tsx', mocks).default;
	const rootElement = document.querySelector('#root');
	let root;
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	async function mount(Component = Form) {
		if (root) await act(async () => root.unmount());
		state.html = '';
		state.mutations = [];
		state.uploads = [];
		state.navigation = [];
		state.success = [];
		state.mutationResult = null;
		state.uploadResult = null;
		state.navigationFailure = false;
		root = createRoot(rootElement);
		await act(async () => root.render(React.createElement(Component, { memberId: user._id })));
	}
	async function rerender(Component = Page) {
		await act(async () => root.render(React.createElement(Component, { memberId: user._id })));
	}
	async function title(value) {
		await act(async () => Simulate.change(document.querySelector('#write-title'), { target: { value } }));
	}
	async function story(value) {
		state.html = value;
		await act(async () => state.editor.onChange());
	}
	async function submit() {
		await act(async () => {
			Simulate.submit(document.querySelector('form'));
			await tick();
		});
	}
	async function upload() {
		const file = new dom.window.File(['png'], 'photo.png', { type: 'image/png' });
		await act(async () => {
			Simulate.change(document.querySelector('input[type=file]'), { target: { files: [file], value: 'photo.png' } });
			await tick();
		});
	}
	const deferred = () => {
		let resolve, reject;
		const promise = new Promise((yes, no) => {
			resolve = yes;
			reject = no;
		});
		return { promise, resolve, reject };
	};

	ready = false;
	await mount(Page);
	check('restoration never exposes an actionable form', () => {
		assert(!document.querySelector('[data-author]'));
		assert(rootElement.textContent.includes('Restoring your session'));
	});
	ready = true;
	user = { ...user, _id: '' };
	await rerender();
	check('guest receives login link with Write Article referrer', () =>
		assert(document.querySelector('a[href*="referrer="]')),
	);
	for (const role of ['USER', 'TRAINER', 'ADMIN']) {
		user = { _id: 'a'.repeat(24), memberType: role, memberStatus: 'ACTIVE' };
		await rerender();
		check('ACTIVE ' + role + ' can author', () => assert(document.querySelector('[data-author]')));
	}
	user.memberStatus = 'BLOCK';
	await rerender();
	check('inactive account cannot author', () => assert(!document.querySelector('[data-author]')));
	user.memberStatus = 'ACTIVE';
	authError = 'offline';
	await rerender();
	check('restoration failure exposes Retry without editor', () => {
		assert(document.querySelector('[role=alert]'));
		assert(!document.querySelector('[data-author]'));
	});
	authError = '';
	await mount();
	await submit();
	check('invalid submission focuses title and does not mutate', () => {
		assert.equal(document.activeElement.id, 'write-title');
		assert(state.scrolls);
		assert.equal(state.mutations.length, 0);
		assert.equal(document.querySelector('#write-title').getAttribute('aria-invalid'), 'true');
	});
	await title('Valid title');
	await story('<p><br></p>');
	await submit();
	check('empty HTML focuses story and exposes nearby error', () => {
		assert.equal(document.activeElement.getAttribute('contenteditable'), 'true');
		assert(document.querySelector('#write-story-error[role=alert]'));
		assert.equal(state.mutations.length, 0);
	});
	check('story validation focuses the visible WYSIWYG surface instead of hidden Markdown', () =>
		assert(document.activeElement.closest('.toastui-editor-ww-container')),
	);
	for (const category of ['FREE', 'TIP', 'SUCCESS_STORY', 'NEWS']) {
		await mount();
		await title('A real story');
		await story('<p>Training matters.</p>');
		await act(async () => Simulate.change(document.querySelector('input[value="' + category + '"]')));
		await submit();
		check('create ' + category + ' uses exact fields, optional cover and authenticated ownership', () => {
			assert.deepEqual(state.mutations[0].variables.input, {
				articleCategory: category,
				articleTitle: 'A real story',
				articleContent: '<p>Training matters.</p>',
			});
			assert.equal(state.mutations[0].fetchPolicy, 'no-cache');
			assert.deepEqual(state.navigation, ['/mypage?category=myArticles']);
			assert.equal(state.success.length, 1);
		});
	}
	await mount();
	await title('Cover story');
	await story('<p>My training story.</p>');
	await upload();
	check('cover upload uses authenticated article multipart and shows preview', () => {
		const upload = state.uploads[0];
		assert.equal(upload.config.headers.Authorization, 'Bearer fixture-token');
		assert.equal(JSON.parse(upload.data.get('operations')).variables.target, 'article');
		assert.deepEqual(JSON.parse(upload.data.get('map')), { 0: ['variables.file'] });
		assert(document.querySelector('.write-cover img').src.endsWith('/uploads/article/cover.png'));
	});
	state.uploadResult = async () => ({ data: { data: { imageUploader: 'uploads/article/replacement.png' } } });
	await upload();
	check('Replace updates the cover preview', () =>
		assert(document.querySelector('.write-cover img').src.endsWith('/replacement.png')),
	);
	let inlineUrl;
	state.uploadResult = async () => ({ data: { data: { imageUploader: 'uploads/article/inline.png' } } });
	await act(async () => {
		await state.editor.hooks.addImageBlobHook(
			new dom.window.File(['png'], 'inline.png', { type: 'image/png' }),
			(url) => {
				inlineUrl = url;
				state.html += '<img src="' + url + '">';
				state.editor.onChange();
			},
		);
	});
	await submit();
	check('inline upload inserts URL without replacing independent cover', () => {
		assert.equal(inlineUrl, 'http://localhost:3007/uploads/article/inline.png');
		assert.equal(state.mutations[0].variables.input.articleImage, 'uploads/article/replacement.png');
		assert(state.mutations[0].variables.input.articleContent.includes(inlineUrl));
	});
	await mount();
	await upload();
	await act(async () => Simulate.click(document.querySelector('[aria-label="Remove cover image"]')));
	check('Remove clears optional cover', () => assert(!document.querySelector('.write-cover img')));
	await upload();
	state.uploadResult = async () => {
		throw Error('offline');
	};
	await upload();
	check('upload failure preserves existing cover and draft', () => {
		assert(document.querySelector('.write-cover img'));
		assert(rootElement.textContent.includes('Your draft is preserved'));
	});
	const oldUpload = deferred();
	state.uploadResult = () => oldUpload.promise;
	await upload();
	check('pending upload blocks publish and duplicate upload', () => {
		assert(document.querySelector('.write-publish').disabled);
		assert(document.querySelector('input[type=file]').disabled);
	});
	const before = state.uploads.length;
	await upload();
	assert.equal(state.uploads.length, before);
	await act(async () => Simulate.click(document.querySelector('[aria-label="Remove cover image"]')));
	state.uploadResult = async () => ({ data: { data: { imageUploader: 'uploads/article/newest.png' } } });
	await upload();
	await act(async () => oldUpload.resolve({ data: { data: { imageUploader: 'uploads/article/stale.png' } } }));
	check('late replaced upload cannot overwrite newer cover', () =>
		assert(document.querySelector('.write-cover img').src.endsWith('/newest.png')),
	);
	await mount();
	await title('Single publication');
	await story('<p>Single publication.</p>');
	const pending = deferred();
	state.mutationResult = () => pending.promise;
	await act(async () => {
		Simulate.submit(document.querySelector('form'));
		Simulate.submit(document.querySelector('form'));
	});
	check('same-tick duplicate submission is protected synchronously', () => {
		assert.equal(state.mutations.length, 1);
		assert(document.querySelector('.write-publish').disabled);
	});
	await act(async () => pending.reject(Error('network failure')));
	check('uncertain outcome preserves draft and never automatically retries', () => {
		assert.equal(state.mutations.length, 1);
		assert.equal(document.querySelector('#write-title').value, 'Single publication');
		assert(rootElement.textContent.includes('Publication could not be confirmed'));
		assert(document.querySelector('.write-publish').disabled);
		assert(document.querySelector('a[href="/mypage?category=myArticles"][target="_blank"]'));
	});
	await mount();
	const late = deferred();
	state.uploadResult = () => late.promise;
	await upload();
	token = 'another-session';
	await act(async () => late.resolve({ data: { data: { imageUploader: 'uploads/article/foreign-session.png' } } }));
	check('account/token change ignores late upload completion', () =>
		assert(!document.querySelector('.write-cover img')),
	);
	token = 'fixture-token';
	await mount();
	const leaving = deferred();
	state.uploadResult = () => leaving.promise;
	await upload();
	await act(async () => events.get('routeChangeStart')());
	await act(async () => leaving.resolve({ data: { data: { imageUploader: 'uploads/article/old-route.png' } } }));
	check('route change aborts upload and ignores stale completion', () => {
		assert(state.uploads[0].config.signal.aborted);
		assert(!document.querySelector('.write-cover img'));
	});
	await act(async () => events.get('routeChangeComplete')());
	state.uploadResult = null;
	await upload();
	await title('Retained form');
	await story('<p>Still editable after locale navigation.</p>');
	await submit();
	check('successful retained-form navigation resumes uploads and publication', () => {
		assert(document.querySelector('.write-cover img'));
		assert.equal(state.mutations.length, 1);
		assert.equal(document.querySelector('#write-title').value, 'Retained form');
	});
	check('confirmed create navigation never reports Unconfirmed or permits duplicate publication', () => {
		assert(!rootElement.textContent.includes('Publication could not be confirmed'));
		assert(rootElement.textContent.includes('Article published successfully'));
		assert(document.querySelector('.write-publish').disabled);
	});
	await act(async () => Simulate.click(document.querySelector('.write-feedback a')));
	await submit();
	check('My Articles link cannot unlock an already-confirmed publication', () =>
		assert.equal(state.mutations.length, 1),
	);
	await mount();
	await title('Published before navigation error');
	await story('<p>Confirmed publication.</p>');
	state.navigationFailure = true;
	await submit();
	check('failed post-create navigation keeps confirmed success and submission protection', () => {
		assert(rootElement.textContent.includes('Article published successfully'));
		assert(!rootElement.textContent.includes('Publication could not be confirmed'));
		assert(document.querySelector('.write-publish').disabled);
		assert.equal(state.mutations.length, 1);
	});
	const confirmedCounter = document.querySelector('.write-story-count').textContent;
	await story('<p>A stale callback must not change the confirmed form.</p>');
	check('confirmed publication ignores late editor changes', () =>
		assert.equal(document.querySelector('.write-story-count').textContent, confirmedCounter),
	);
	await mount();
	await title('Pending while changing locale');
	await story('<p>Keep this draft.</p>');
	const inFlight = deferred();
	state.mutationResult = () => inFlight.promise;
	await submit();
	await act(async () => {
		events.get('routeChangeStart')();
		events.get('routeChangeComplete')();
	});
	await act(async () => Simulate.click(document.querySelector('.write-feedback a')));
	await submit();
	check('My Articles link cannot unlock an unresolved publication after retained navigation', () => {
		assert.equal(state.mutations.length, 1);
		assert(document.querySelector('.write-publish').disabled);
	});
	await act(async () => inFlight.resolve({ data: { createBoardArticle: { _id: 'confirmed-later' } } }));
	check('retained-form late create confirmation clears uncertainty without obsolete navigation', () => {
		assert(rootElement.textContent.includes('Article published successfully'));
		assert(!rootElement.textContent.includes('Publication could not be confirmed'));
		assert.deepEqual(state.navigation, []);
		assert(document.querySelector('.write-publish').disabled);
	});
	await act(async () => root.unmount());
	dom.window.close();
	for (const locale of ['en', 'kr', 'ru']) {
		const data = JSON.parse(
			fs.readFileSync(path.resolve(__dirname, '../public/locales/' + locale + '/common.json'), 'utf8'),
		)['Write article'];
		check(locale + ' locale has matching keys and interpolation', () => {
			assert.deepEqual(Object.keys(data), Object.keys(dictionary['Write article']));
			assert.equal(data['Character count'].match(/{{count}}/g).length, 1);
			assert(Object.values(data).every((value) => typeof value === 'string' && value.trim()));
		});
	}
	console.log(checks + ' Write Article checks passed.');
	await require('./test-write-article-lifecycle.cjs')();
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
