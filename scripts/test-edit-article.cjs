const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
let checks = 0;
function check(name, fn) {
	fn();
	checks++;
	console.log('PASS ' + name);
}
function deferred() {
	let resolve, reject;
	const promise = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function load(file, mocks, cache = new Map()) {
	file = path.resolve(__dirname, '..', file);
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
		if (name.endsWith('.css') || name.includes('/dist/i18n/')) return {};
		if (name.startsWith('@mui/icons-material/')) return () => null;
		if (name.startsWith('.')) {
			const base = path.resolve(path.dirname(file), name);
			return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks, cache);
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

(async () => {
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
		url: 'http://localhost/mypage?category=editArticle',
	});
	global.window = dom.window;
	global.document = dom.window.document;
	global.FormData = dom.window.FormData;
	global.IS_REACT_ACT_ENVIRONMENT = true;
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { act, Simulate } = require('react-dom/test-utils');
	const dictionary = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/locales/en/common.json'), 'utf8'));
	const t = (key, variables = {}) => {
		let value = key.split('.').reduce((data, name) => data?.[name], dictionary);
		assert.equal(typeof value, 'string', key);
		for (const [name, item] of Object.entries(variables)) value = value.replace('{{' + name + '}}', item);
		return value;
	};
	const original = {
		_id: 'b'.repeat(24),
		memberId: 'a'.repeat(24),
		articleCategory: 'TIP',
		articleStatus: 'ACTIVE',
		articleTitle: 'Original training story',
		articleContent: '<p>Original story.</p>',
		articleImage: 'uploads/article/existing.png',
		articleRevision: 0,
	};
	let user = { _id: original.memberId, memberStatus: 'ACTIVE' },
		ready = true,
		authError = '',
		token = 'fixture-token';
	const state = {
		html: '',
		editor: null,
		seeds: [],
		queries: [],
		mutations: [],
		uploads: [],
		navigation: [],
		confirmations: [],
		success: [],
		queryResult: null,
		mutationResult: null,
		uploadResult: null,
		confirm: true,
		navigationFailure: false,
	};
	const events = new Map();
	const router = {
		isReady: true,
		query: { category: 'editArticle', articleId: original._id },
		events: { on: (name, callback) => events.set(name, callback), off: (name) => events.delete(name) },
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
	const client = {
		query: async (request) => {
			state.queries.push(request);
			return state.queryResult ? await state.queryResult() : { data: { getMyBoardArticle: { ...original } } };
		},
	};
	dom.window.HTMLElement.prototype.scrollIntoView = () => {};
	const FakeEditor = React.forwardRef(function FakeEditor(props, ref) {
		state.editor = props;
		const api = React.useRef({
			getHTML: () => state.html,
			setHTML: (html) => {
				state.seeds.push(html);
				const container = document.createElement('div');
				container.innerHTML = html;
				state.html = container.innerHTML;
			},
			destroy: () => {},
		}).current;
		React.useImperativeHandle(ref, () => ({ getInstance: () => api }), [api]);
		return React.createElement(
			'div',
			{ className: 'toastui-editor-ww-container' },
			React.createElement('div', { contentEditable: true, suppressContentEditableWarning: true, tabIndex: 0 }),
		);
	});
	let Form;
	const mocks = {
		'next/router': { useRouter: () => router },
		'next/link': ({ children, href, passHref, ...props }) =>
			React.createElement(
				'a',
				{ ...props, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) },
				children,
			),
		'next-i18next': { useTranslation: () => ({ t, i18n: { language: 'en' } }) },
		'next/dynamic': () => (props) => React.createElement(Form, props),
		'@toast-ui/react-editor': { Editor: FakeEditor },
		'@apollo/client': {
			useReactiveVar: (variable) => variable(),
			useApolloClient: () => client,
			useMutation: (operation) => [
				async (request) => {
					state.mutations.push({ operation, ...request });
					assert.equal(operation, 'UPDATE_BOARD_ARTICLE', 'Edit mode must never create');
					return state.mutationResult
						? await state.mutationResult(request)
						: {
								data: {
									updateBoardArticle: {
										_id: original._id,
										articleRevision: request.variables.input.expectedRevision + 1,
									},
								},
						  };
				},
			],
		},
		'../../../apollo/store': { userVar: () => user, authReadyVar: () => ready, authErrorVar: () => authError },
		'../../../apollo/user/query': { GET_MY_BOARD_ARTICLE: 'GET_MY_BOARD_ARTICLE' },
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
		'../../config': { ...load('libs/config.ts', {}), REACT_APP_API_URL: 'http://localhost:3007' },
		'../../sweetAlert': {
			sweetTopSmallSuccessAlert: async (message) => state.success.push(message),
			sweetConfirmAlert: async (message) => {
				state.confirmations.push(message);
				return state.confirm;
			},
		},
		axios: {
			post: async (...args) => {
				state.uploads.push(args);
				return state.uploadResult
					? await state.uploadResult()
					: { data: { data: { imageUploader: 'uploads/article/replacement.png' } } };
			},
		},
	};
	const helpers = load('libs/article.ts', mocks);
	Form = load('libs/components/community/Teditor.tsx', mocks).default;
	const Page = load('libs/components/mypage/EditArticle.tsx', mocks).default;
	const rootElement = document.querySelector('#root');
	let root;
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	async function mount({ article = original, page = true, queryResult = null } = {}) {
		if (root) await act(async () => root.unmount());
		Object.assign(state, {
			html: '',
			seeds: [],
			queries: [],
			mutations: [],
			uploads: [],
			navigation: [],
			confirmations: [],
			success: [],
			queryResult,
			mutationResult: null,
			uploadResult: null,
			confirm: true,
			navigationFailure: false,
		});
		root = createRoot(rootElement);
		await act(async () => {
			root.render(
				React.createElement(
					page ? Page : Form,
					page ? {} : { mode: 'edit', memberId: user._id, article, reloadArticle: async () => article },
				),
			);
			await tick();
		});
	}
	async function rerenderPage() {
		await act(async () => {
			root.render(React.createElement(Page));
			await tick();
		});
	}
	async function title(value) {
		await act(async () => Simulate.change(document.querySelector('#write-title'), { target: { value } }));
	}
	async function story(html) {
		state.html = html;
		await act(async () => state.editor.onChange());
	}
	async function submit() {
		await act(async () => {
			Simulate.submit(document.querySelector('form'));
			await tick();
		});
	}
	async function click(selector) {
		await act(async () => {
			Simulate.click(document.querySelector(selector));
			await tick();
		});
	}
	async function upload(inline = false) {
		const file = new dom.window.File(['image'], 'image.png', { type: 'image/png' });
		await act(async () => {
			if (inline)
				await state.editor.hooks.addImageBlobHook(file, (url) => {
					state.html += '<img src="' + url + '">';
					state.editor.onChange();
				});
			else {
				Simulate.change(document.querySelector('input[type=file]'), { target: { files: [file], value: '' } });
				await tick();
			}
		});
	}
	const productionConflict = {
		graphQLErrors: [{ code: 'INTERNAL_SERVER_ERROR', message: 'Article changed; reload before saving again' }],
	};
	const structuredConflict = {
		graphQLErrors: [{ message: 'Stale write', extensions: { originalError: { statusCode: 409 } } }],
	};
	const unavailable = { graphQLErrors: [{ code: 'INTERNAL_SERVER_ERROR', message: 'No data found!' }] };
	check('production-shaped conflict recognized', () =>
		assert.equal(helpers.articleUpdateError(productionConflict), 'conflict'),
	);
	check('structured conflict recognized', () =>
		assert.equal(helpers.articleUpdateError(structuredConflict), 'conflict'),
	);
	check('unrelated internal server failure is uncertain', () =>
		assert.equal(
			helpers.articleUpdateError({
				graphQLErrors: [{ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' }],
			}),
			'unknown',
		),
	);
	for (const revision of [undefined, null, -1, 0.5, '0', 2147483647, NaN])
		check('invalid revision ' + revision + ' blocked', () =>
			assert.equal(helpers.readOwnedArticle({ ...original, articleRevision: revision }, original._id, user._id), null),
		);
	check('revision zero accepted', () => assert(helpers.readOwnedArticle(original, original._id, user._id)));
	for (const id of [undefined, '', 'invalid', ['b'.repeat(24)]]) {
		router.query.articleId = id;
		await mount();
		check('invalid/missing URL id ' + JSON.stringify(id) + ' never queries or edits', () => {
			assert.equal(state.queries.length, 0);
			assert(!document.querySelector('form'));
			assert(document.querySelector('[role=alert]'));
		});
	}
	router.query.articleId = original._id;
	ready = false;
	await mount();
	check('auth restoration gates owner query', () => {
		assert.equal(state.queries.length, 0);
		assert(!document.querySelector('form'));
	});
	ready = true;
	user = { ...user, _id: '' };
	await rerenderPage();
	check('guest login retains canonical edit referrer', () => {
		assert.equal(state.queries.length, 0);
		assert(document.querySelector('a[href*="referrer="]'));
	});
	user = { _id: original.memberId, memberStatus: 'BLOCK' };
	await rerenderPage();
	check('inactive account never loads editor', () => assert(!document.querySelector('form')));
	user.memberStatus = 'ACTIVE';
	authError = 'offline';
	await rerenderPage();
	check('auth read failure shows safe Retry', () => {
		assert(document.querySelector('[role=alert]'));
		assert.equal(state.queries.length, 0);
	});
	authError = '';
	const pendingLoad = deferred();
	await mount({ queryResult: () => pendingLoad.promise });
	check('initial owner loading is accessible and noneditable', () => {
		assert(document.querySelector('[role=status][aria-busy=true]'));
		assert(!document.querySelector('form'));
	});
	await act(async () => pendingLoad.resolve({ data: { getMyBoardArticle: original } }));
	check('owner lookup is no-cache authenticated document with local errors', () =>
		assert.deepEqual(state.queries[0], {
			query: 'GET_MY_BOARD_ARTICLE',
			variables: { input: original._id },
			fetchPolicy: 'no-cache',
			context: { queryDeduplication: false, handleErrorLocally: true },
		}),
	);
	check('owned title/story/cover prefilled', () => {
		assert.equal(document.querySelector('#write-title').value, original.articleTitle);
		assert.equal(state.html, original.articleContent);
		assert(document.querySelector('.write-cover img').src.endsWith(original.articleImage));
	});
	check('category is read-only with lock helper', () => {
		assert(!document.querySelector('input[type=radio]'));
		assert(document.querySelector('.write-category-readonly').textContent.includes('Category cannot be changed'));
	});
	check('initial HTML loaded exactly once', () => assert.equal(state.seeds.length, 1));
	await title('Unsaved owner changes');
	state.queryResult = async () => ({
		data: { getMyBoardArticle: { ...original, articleTitle: 'Background values', articleRevision: 1 } },
	});
	await rerenderPage();
	check('background rerender never resets dirty state', () => {
		assert.equal(state.queries.length, 1);
		assert.equal(state.seeds.length, 1);
		assert.equal(document.querySelector('#write-title').value, 'Unsaved owner changes');
	});
	for (const record of [
		null,
		{ ...original, memberId: 'c'.repeat(24) },
		{ ...original, articleStatus: 'DELETE' },
		{ ...original, articleRevision: undefined },
	]) {
		await mount({ queryResult: async () => ({ data: { getMyBoardArticle: record } }) });
		check('missing/foreign/deleted/invalid-revision owner data blocks form', () => {
			assert(!document.querySelector('form'));
			assert(rootElement.textContent.includes(dictionary['Edit article'].Unavailable));
		});
	}
	await mount({
		queryResult: async () => {
			throw unavailable;
		},
	});
	check('backend unavailable result exposes no editable form', () => assert(!document.querySelector('form')));
	await mount({
		queryResult: async () => {
			throw Error('offline');
		},
	});
	check('load failure has Retry and cannot create', () => {
		assert(!document.querySelector('form'));
		assert(document.querySelector('.write-auth-state button'));
		assert.equal(state.mutations.length, 0);
	});
	state.queryResult = null;
	await click('.write-auth-state button');
	check('read-only Retry loads owner before enabling form', () => {
		assert.equal(state.queries.length, 2);
		assert(document.querySelector('form'));
		assert.equal(state.mutations.length, 0);
	});
	const obsolete = deferred();
	await mount({ queryResult: () => obsolete.promise });
	router.query.articleId = 'd'.repeat(24);
	state.queryResult = async () => ({
		data: { getMyBoardArticle: { ...original, _id: 'd'.repeat(24), articleTitle: 'Current article' } },
	});
	await rerenderPage();
	await act(async () => obsolete.resolve({ data: { getMyBoardArticle: original } }));
	check('obsolete owner lookup cannot replace current article', () =>
		assert.equal(document.querySelector('#write-title').value, 'Current article'),
	);
	router.query.articleId = original._id;
	await mount({ page: false, article: undefined });
	// Explicit malformed edit props are also checked below with an absent record.
	await act(async () =>
		root.render(
			React.createElement(Form, {
				mode: 'edit',
				memberId: user._id,
				article: { ...original, articleRevision: undefined },
				reloadArticle: async () => null,
				key: 'invalid-edit',
			}),
		),
	);
	await submit();
	check('invalid edit data cannot fall through to CREATE', () => assert.equal(state.mutations.length, 0));
	await mount({
		page: false,
		article: {
			...original,
			articleContent: '<p>Safe story</p><img src="x" onerror="alert(1)"><script>alert(1)</script>',
		},
	});
	check('stored HTML sanitized before native setHTML parses it', () => {
		assert(!/onerror|<script/i.test(state.seeds[0]));
		assert(state.seeds[0].includes('Safe story'));
	});
	await mount();
	await click('.write-cancel');
	check('clean Cancel returns to public Detail without confirmation or mutation', () => {
		assert.deepEqual(state.confirmations, []);
		assert.equal(state.navigation[0], '/community/detail?articleCategory=TIP&id=' + original._id);
		assert.equal(state.mutations.length, 0);
	});
	await mount();
	await title('Dirty title');
	state.confirm = false;
	await click('.write-cancel');
	check('dirty Cancel can retain draft', () => {
		assert.equal(state.confirmations.length, 1);
		assert.equal(state.navigation.length, 0);
		assert.equal(document.querySelector('#write-title').value, 'Dirty title');
	});
	state.confirm = true;
	await click('.write-cancel');
	check('confirmed discard only navigates', () => {
		assert.equal(state.navigation.length, 1);
		assert.equal(state.mutations.length, 0);
	});
	await mount();
	await story('<p>Changed story.</p>');
	state.confirm = false;
	await click('.write-cancel');
	check('story HTML participates in dirty detection', () => assert.equal(state.confirmations.length, 1));
	await mount();
	await upload();
	state.confirm = false;
	await click('.write-cancel');
	check('cover participates in dirty detection', () => assert.equal(state.confirmations.length, 1));
	for (const action of ['preserve', 'replace', 'remove', 'inline']) {
		await mount();
		if (action === 'replace') await upload();
		if (action === 'remove') await click('[aria-label="Remove cover image"]');
		if (action === 'inline') await upload(true);
		await submit();
		check('update cover ' + action + ' preserves exact update contract', () => {
			const input = state.mutations[0].variables.input;
			assert.deepEqual(
				Object.keys(input).sort(),
				['_id', 'expectedRevision', 'articleTitle', 'articleContent', 'articleImage'].sort(),
			);
			assert.equal(input._id, original._id);
			assert.equal(input.expectedRevision, 0);
			assert.equal(
				input.articleImage,
				action === 'replace' ? 'uploads/article/replacement.png' : action === 'remove' ? null : original.articleImage,
			);
			if (action === 'inline')
				assert(input.articleContent.includes('http://localhost:3007/uploads/article/replacement.png'));
			assert.equal(state.mutations.length, 1);
			assert.equal(state.mutations[0].operation, 'UPDATE_BOARD_ARTICLE');
			assert.equal(state.success.length, 1);
			assert.equal(state.navigation.length, 1);
			assert(!rootElement.textContent.includes(dictionary['Edit article'].Unconfirmed));
		});
	}
	await mount();
	await title(' ');
	await submit();
	check('invalid title focuses field without mutation', () => {
		assert.equal(state.mutations.length, 0);
		assert.equal(document.activeElement.id, 'write-title');
	});
	await title('Valid title');
	await story('<p><br></p>');
	await submit();
	check('invalid content focuses visible story without mutation', () => {
		assert.equal(state.mutations.length, 0);
		assert(document.activeElement.closest('.toastui-editor-ww-container'));
	});
	await mount();
	const pending = deferred();
	state.mutationResult = () => pending.promise;
	await act(async () => {
		Simulate.submit(document.querySelector('form'));
		Simulate.submit(document.querySelector('form'));
	});
	await upload(true);
	await upload();
	await click('.write-cancel');
	check('pending save blocks duplicate saves, cover/inline uploads and Cancel', () => {
		assert.equal(state.mutations.length, 1);
		assert.equal(state.uploads.length, 0);
		assert.equal(state.navigation.length, 0);
		assert(document.querySelector('.write-publish').disabled);
	});
	await act(async () =>
		pending.reject({
			graphQLErrors: [{ code: 'BAD_USER_INPUT', message: 'Article title must contain meaningful characters' }],
		}),
	);
	check('definitive rejection preserves draft and allows correction', () => {
		assert.equal(document.querySelector('#write-title').value, original.articleTitle);
		assert(!document.querySelector('.write-publish').disabled);
		assert(rootElement.textContent.includes(dictionary['Edit article']['Save failed']));
	});
	state.mutationResult = null;
	await title('Corrected title');
	await submit();
	check('manual corrected save uses original revision once', () => {
		assert.equal(state.mutations.length, 2);
		assert.equal(state.mutations[1].variables.input.expectedRevision, 0);
	});
	for (const error of [productionConflict, structuredConflict]) {
		await mount();
		await title('My unsaved conflict draft');
		state.mutationResult = async () => {
			throw error;
		};
		await submit();
		await submit();
		check('conflict preserves draft and blocks obsolete resubmission', () => {
			assert.equal(state.mutations.length, 1);
			assert.equal(state.queries.length, 1);
			assert(document.querySelector('.write-publish').disabled);
			assert.equal(document.querySelector('#write-title').value, 'My unsaved conflict draft');
			assert(document.querySelector('.write-feedback[role=alert]'));
		});
		state.confirm = false;
		await click('.write-feedback button');
		check('Reload latest asks before any lookup/discard', () => {
			assert.equal(state.queries.length, 1);
			assert.equal(state.confirmations.length, 1);
		});
		state.confirm = true;
		state.queryResult = async () => {
			throw Error('offline');
		};
		await click('.write-feedback button');
		check('failed conflict refresh preserves draft and save lock', () => {
			assert.equal(document.querySelector('#write-title').value, 'My unsaved conflict draft');
			assert(document.querySelector('.write-publish').disabled);
			assert(rootElement.textContent.includes(dictionary['Edit article']['Reload failed']));
			assert.equal(state.mutations.length, 1);
		});
		state.queryResult = async () => ({
			data: {
				getMyBoardArticle: {
					...original,
					articleTitle: 'Latest owner title',
					articleContent: '<p>Latest story.</p>',
					articleRevision: 7,
				},
			},
		});
		await click('.write-feedback button');
		check('confirmed successful reload replaces draft and revision without saving', () => {
			assert.equal(document.querySelector('#write-title').value, 'Latest owner title');
			assert.equal(state.html, '<p>Latest story.</p>');
			assert(!document.querySelector('.write-publish').disabled);
			assert.equal(state.mutations.length, 1);
		});
		state.mutationResult = null;
		await submit();
		check('next manual update uses freshly loaded revision', () =>
			assert.equal(state.mutations[1].variables.input.expectedRevision, 7),
		);
	}
	await mount();
	state.mutationResult = async () => {
		throw productionConflict;
	};
	await submit();
	state.queryResult = async () => {
		throw unavailable;
	};
	await click('.write-feedback button');
	check('deleted during conflict refresh shows unavailable and blocks editing', () => {
		assert(rootElement.textContent.includes(dictionary['Edit article'].Unavailable));
		assert(document.querySelector('#write-title').disabled);
		assert(document.querySelector('.write-publish').disabled);
		assert.equal(state.mutations.length, 1);
	});
	await mount();
	await title('Uncertain draft');
	state.mutationResult = async () => {
		throw { networkError: Error('connection lost') };
	};
	await submit();
	await submit();
	check('uncertain outcome preserves draft and never blindly repeats', () => {
		assert.equal(state.mutations.length, 1);
		assert(document.querySelector('.write-publish').disabled);
		assert.equal(document.querySelector('#write-title').value, 'Uncertain draft');
	});
	await click('.write-feedback a');
	await submit();
	check('viewing published article cannot unlock uncertain save', () => assert.equal(state.mutations.length, 1));
	state.queryResult = null;
	await click('.write-feedback button');
	check('explicit verified reload is required to allow a new manual save', () => {
		assert.equal(state.mutations.length, 1);
		assert(!document.querySelector('.write-publish').disabled);
	});
	await mount();
	state.navigationFailure = true;
	await submit();
	check('post-save navigation failure cannot change confirmed success', () => {
		assert(rootElement.textContent.includes(dictionary['Edit article'].Saved));
		assert(!rootElement.textContent.includes(dictionary['Edit article'].Unconfirmed));
		assert(document.querySelector('.write-publish').disabled);
	});
	const savedCounter = document.querySelector('.write-story-count').textContent;
	await story('<p>Stale callback.</p>');
	await submit();
	check('confirmed save ignores late editor work and duplicate submission', () => {
		assert.equal(state.mutations.length, 1);
		assert.equal(document.querySelector('.write-story-count').textContent, savedCounter);
	});
	await mount();
	const retained = deferred();
	state.mutationResult = () => retained.promise;
	await submit();
	await act(async () => {
		events.get('routeChangeStart')();
		events.get('routeChangeComplete')();
	});
	await click('.write-feedback button');
	await submit();
	check('retained route navigation cannot unlock unresolved save', () => {
		assert.equal(state.mutations.length, 1);
		assert.equal(state.queries.length, 1);
	});
	await act(async () => retained.resolve({ data: { updateBoardArticle: { _id: original._id, articleRevision: 1 } } }));
	check('retained-route late confirmation is successful without obsolete navigation', () => {
		assert(rootElement.textContent.includes(dictionary['Edit article'].Saved));
		assert(!rootElement.textContent.includes(dictionary['Edit article'].Unconfirmed));
		assert.equal(state.navigation.length, 0);
	});
	await mount({ page: false });
	await title('Keep this local draft');
	await act(async () =>
		root.render(
			React.createElement(Form, {
				mode: 'edit',
				memberId: user._id,
				article: {
					...original,
					articleTitle: 'Later response',
					articleContent: '<p>Later HTML</p>',
					articleRevision: 5,
				},
				reloadArticle: async () => original,
			}),
		),
	);
	check('later article props never reinitialize an existing draft', () => {
		assert.equal(state.seeds.length, 1);
		assert.equal(document.querySelector('#write-title').value, 'Keep this local draft');
		assert.equal(state.html, original.articleContent);
	});
	await mount();
	const pendingUpload = deferred();
	state.uploadResult = () => pendingUpload.promise;
	await act(async () => {
		void state.editor.hooks.addImageBlobHook(
			new dom.window.File(['image'], 'image.png', { type: 'image/png' }),
			() => {},
		);
	});
	await submit();
	check('unresolved inline upload blocks update', () => assert.equal(state.mutations.length, 0));
	await act(async () => pendingUpload.resolve({ data: { data: { imageUploader: 'uploads/article/inline.png' } } }));
	await mount();
	await title('Draft before refresh');
	state.mutationResult = async () => {
		throw productionConflict;
	};
	await submit();
	const firstReload = deferred(),
		secondReload = deferred();
	state.queryResult = () => firstReload.promise;
	await click('.write-feedback button');
	check('pending reload preserves draft until owner lookup succeeds', () =>
		assert.equal(document.querySelector('#write-title').value, 'Draft before refresh'),
	);
	await act(async () => {
		events.get('routeChangeStart')();
		events.get('routeChangeComplete')();
	});
	state.queryResult = () => secondReload.promise;
	await click('.write-feedback button');
	await act(async () =>
		firstReload.resolve({
			data: { getMyBoardArticle: { ...original, articleTitle: 'Obsolete reload', articleRevision: 3 } },
		}),
	);
	await click('.write-feedback button');
	check('obsolete reload cannot replace draft or unlock a newer reload', () => {
		assert.equal(document.querySelector('#write-title').value, 'Draft before refresh');
		assert.equal(state.queries.length, 3);
	});
	await act(async () =>
		secondReload.resolve({
			data: { getMyBoardArticle: { ...original, articleTitle: 'Current reload', articleRevision: 4 } },
		}),
	);
	check('retained locale navigation resumes read-only conflict recovery', () => {
		assert.equal(document.querySelector('#write-title').value, 'Current reload');
		assert(!document.querySelector('.write-publish').disabled);
	});
	await act(async () => root.unmount());
	dom.window.close();
	for (const locale of ['en', 'kr', 'ru']) {
		const dict = JSON.parse(
			fs.readFileSync(path.resolve(__dirname, '../public/locales/' + locale + '/common.json'), 'utf8'),
		)['Edit article'];
		check(locale + ' edit locale complete', () => {
			assert.deepEqual(Object.keys(dict), Object.keys(dictionary['Edit article']));
			assert(Object.values(dict).every((value) => typeof value === 'string' && value.trim()));
		});
	}
	console.log(checks + ' Edit Article checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
