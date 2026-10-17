const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

// Use the installed React wrapper and editor, including its real toolbar renderer.
// Only auth, mutation completion, navigation and browser measurements are controlled.
async function testPublicationCleanup() {
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
		url: 'http://localhost/mypage?category=writeArticle',
		pretendToBeVisual: true,
	});
	for (const name of [
		'window',
		'document',
		'HTMLElement',
		'Element',
		'Node',
		'MutationObserver',
		'DOMParser',
		'getComputedStyle',
		'Range',
		'navigator',
		'innerHeight',
		'innerWidth',
	]) {
		Object.defineProperty(global, name, { value: dom.window[name], configurable: true });
	}
	global.self = window;
	global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
	global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
	global.IS_REACT_ACT_ENVIRONMENT = true;
	window.scrollBy = () => {};
	Range.prototype.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 });
	Range.prototype.getClientRects = () => [];
	HTMLElement.prototype.scrollIntoView = () => {};
	let width = 776;
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		get() {
			return this.isConnected ? width : 0;
		},
		configurable: true,
	});
	Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
		get() {
			return this.isConnected ? (this.tagName === 'BUTTON' ? 44 : width) : 0;
		},
		configurable: true,
	});
	const style = document.createElement('style');
	style.textContent = '* { margin-left: 0; margin-right: 0; }';
	document.head.appendChild(style);
	const timers = new Map();
	let timerId = 0;
	window.setTimeout = (callback, _delay, ...args) => {
		const id = ++timerId;
		timers.set(id, () => callback(...args));
		return id;
	};
	window.clearTimeout = (id) => timers.delete(id);
	const observers = [];
	global.ResizeObserver = class {
		constructor(callback) {
			this.callback = callback;
			this.connected = false;
			observers.push(this);
		}
		observe() {
			this.connected = true;
		}
		disconnect() {
			this.connected = false;
		}
	};
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { flushSync } = require('react-dom');
	const { act, Simulate } = require('react-dom/test-utils');
	const { Editor } = require('@toast-ui/react-editor');
	const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/en/common.json'), 'utf8'));
	const t = (key, variables = {}) => {
		let value = key.split('.').reduce((result, name) => result?.[name], dictionary);
		for (const [name, variable] of Object.entries(variables)) value = value.replace('{{' + name + '}}', variable);
		return value;
	};
	const events = new Map();
	let nativeEditor, editorProps, root, resolveMutation, mutationCount, successCount, navigationCount, mode;
	const article = {
		_id: 'b'.repeat(24),
		memberId: 'a'.repeat(24),
		articleCategory: 'TIP',
		articleStatus: 'ACTIVE',
		articleTitle: 'Owned training story',
		articleContent: '<p>Persisted story.</p>',
		articleImage: null,
		articleRevision: 0,
	};
	class ObservedEditor extends Editor {
		componentDidMount() {
			super.componentDidMount();
			nativeEditor = this.getInstance();
			editorProps = this.props;
		}
	}
	const router = {
		events: { on: (name, callback) => events.set(name, callback), off: (name) => events.delete(name) },
		push: async (url) => {
			assert.equal(
				url,
				mode === 'create' ? '/mypage?category=myArticles' : '/community/detail?articleCategory=TIP&id=' + article._id,
			);
			navigationCount++;
			events.get('routeChangeStart')?.();
			// Next can commit the destination before the navigation promise resolves.
			flushSync(() => root.render(React.createElement('div', { id: 'my-articles' }, 'My Articles')));
			events.get('routeChangeComplete')?.();
			return true;
		},
	};
	const mocks = {
		'next/router': { useRouter: () => router },
		'next/link': ({ children, href, ...props }) => React.createElement('a', { ...props, href }, children),
		'next-i18next': { useTranslation: () => ({ t, i18n: { language: 'en' } }) },
		'@toast-ui/react-editor': { Editor: ObservedEditor },
		'../../../apollo/user/mutation': {
			CREATE_BOARD_ARTICLE: 'CREATE_BOARD_ARTICLE',
			UPDATE_BOARD_ARTICLE: 'UPDATE_BOARD_ARTICLE',
		},
		'@apollo/client': {
			useMutation: (document) => [
				(request) => {
					assert.equal(document, mode === 'create' ? 'CREATE_BOARD_ARTICLE' : 'UPDATE_BOARD_ARTICLE');
					if (mode === 'edit') assert.equal(request.variables.input.expectedRevision, 0);
					mutationCount++;
					return new Promise((resolve) => {
						resolveMutation = resolve;
					});
				},
			],
		},
		'../../../apollo/store': {
			authReadyVar: () => true,
			authErrorVar: () => '',
			userVar: () => ({ _id: 'a'.repeat(24), memberStatus: 'ACTIVE' }),
		},
		'../../auth': { getJwtToken: () => 'test-token', isAuthenticationError: () => false },
		'../../sweetAlert': {
			// The real async helper starts Toast.fire but does not await its 700ms timer.
			sweetTopSmallSuccessAlert: async (message) => {
				assert.equal(
					message,
					mode === 'create' ? dictionary['Write article'].Published : dictionary['Edit article'].Saved,
				);
				successCount++;
			},
		},
	};
	function load(file, cache = new Map()) {
		if (cache.has(file)) return cache.get(file);
		const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
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
			if (name.endsWith('.css')) return {};
			if (name.startsWith('@mui/icons-material/')) return () => null;
			if (name.startsWith('.')) {
				const base = path.resolve(path.dirname(file), name);
				return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', cache);
			}
			return require(name);
		};
		vm.runInThisContext('(function(require,module,exports){' + output + '\n})', { filename: file })(
			localRequire,
			module,
			module.exports,
		);
		cache.set(file, module.exports);
		return module.exports;
	}
	const Form = load(path.join(__dirname, '../libs/components/community/Teditor.tsx')).default;
	try {
		for (const [currentMode, currentWidth] of [
			['create', 776],
			['create', 358],
			['edit', 776],
			['edit', 358],
		]) {
			mode = currentMode;
			width = currentWidth;
			mutationCount = successCount = navigationCount = 0;
			root = createRoot(document.querySelector('#root'));
			await act(async () =>
				root.render(
					React.createElement(
						React.StrictMode,
						null,
						React.createElement(Form, {
							memberId: 'a'.repeat(24),
							...(mode === 'edit' ? { mode, article, reloadArticle: async () => article } : {}),
						}),
					),
				),
			);
			await act(async () => {
				Simulate.change(document.querySelector('#write-title'), { target: { value: 'Disposable lifecycle test' } });
				nativeEditor.setHTML('<p>Real editor publication lifecycle.</p>');
			});
			await act(async () => Simulate.submit(document.querySelector('form')));
			const observer = observers.findLast((item) => item.connected);
			assert(observer, 'native toolbar observer is active');
			const earlierTimers = new Set(timers.keys());
			observer.callback();
			observer.callback();
			const resizeTimers = [...timers.keys()].filter((id) => !earlierTimers.has(id));
			assert(resizeTimers.length > 0, 'real toolbar has a pending throttled resize before mutation completion');
			const staleChange = editorProps.onChange;
			await act(async () =>
				resolveMutation({
					data:
						mode === 'create'
							? { createBoardArticle: { _id: 'b'.repeat(24) } }
							: { updateBoardArticle: { _id: article._id, articleRevision: 1 } },
				}),
			);
			assert.equal(mutationCount, 1);
			assert.equal(successCount, 1);
			assert.equal(navigationCount, 1);
			assert(document.querySelector('#my-articles'));
			assert(!observer.connected, 'editor observer is disconnected');
			assert(
				resizeTimers.every((id) => !timers.has(id)),
				'teardown cancels the queued toolbar tick',
			);
			assert.doesNotThrow(() => {
				for (const [id, callback] of [...timers]) {
					timers.delete(id);
					callback();
				}
			}, 'pending native toolbar work must never rerender destroyed DOM');
			assert.doesNotThrow(() => staleChange(), 'a late editor callback cannot read a disposed editor');
			console.log(
				'PASS native Toast UI ' +
					width +
					'px: one confirmed ' +
					mode +
					', immediate route unmount, canceled resize and inert stale callback',
			);
			await act(async () => root.unmount());
		}
	} finally {
		dom.window.close();
	}
}

module.exports = testPublicationCleanup;
if (require.main === module)
	testPublicationCleanup().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
