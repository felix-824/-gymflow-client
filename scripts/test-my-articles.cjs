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
		url: 'http://localhost/mypage?category=myArticles',
	});
	global.window = dom.window;
	global.document = dom.window.document;
	global.IS_REACT_ACT_ENVIRONMENT = true;
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { act, Simulate } = require('react-dom/test-utils');
	const dictionary = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/locales/en/common.json'), 'utf8'));
	const copy = dictionary['My articles'];
	const t = (key, variables = {}) => {
		let value = key.split('.').reduce((data, name) => data?.[name], dictionary);
		assert.equal(typeof value, 'string', 'Missing translation: ' + key);
		for (const [name, item] of Object.entries(variables)) value = value.replaceAll('{{' + name + '}}', String(item));
		return value;
	};
	const owner = 'a'.repeat(24);
	const article = (id = 1, patch = {}) => ({
		_id: id.toString(16).padStart(24, '0'),
		memberId: owner,
		articleStatus: 'ACTIVE',
		articleCategory: 'TIP',
		articleTitle: 'A training story ' + id,
		articleContent: '<p>First paragraph.</p><p>Second paragraph.</p>',
		articleImage: null,
		articleRevision: 0,
		articleViews: 0,
		articleLikes: 0,
		articleComments: 0,
		createdAt: '2026-10-16T03:00:00.000Z',
		updatedAt: '2026-10-17T03:00:00.000Z',
		...patch,
	});
	let user = { _id: owner, memberStatus: 'ACTIVE', memberType: 'USER' },
		ready = true,
		authError = '',
		token = 'fixture-token',
		language = 'en';
	let root;
	const state = {
		rows: [],
		queries: [],
		mutations: [],
		confirmations: [],
		navigation: [],
		read: null,
		write: null,
		confirm: true,
		authRetries: 0,
		invalidations: 0,
	};
	const events = new Map();
	const router = {
		isReady: true,
		query: { category: 'myArticles' },
		events: {
			on: (name, callback) => events.set(name, callback),
			off: (name, callback) => {
				if (events.get(name) === callback) events.delete(name);
			},
		},
		push: async (url, _as, options) => navigate('push', url, options),
		replace: async (url, _as, options) => navigate('replace', url, options),
	};
	async function navigate(method, url, options) {
		state.navigation.push({ method, url, options });
		events.get('routeChangeStart')?.();
		router.query = { ...url.query, ...(url.query.page ? { page: String(url.query.page) } : {}) };
		root.render(React.createElement(Page));
		return true;
	}
	const client = {
		query: async (request) => {
			state.queries.push(request);
			if (state.read) return await state.read(request);
			const { page, limit } = request.variables.input;
			return {
				data: {
					getMyBoardArticles: {
						list: state.rows.slice((page - 1) * limit, page * limit),
						metaCounter: state.rows.length ? [{ total: state.rows.length }] : [],
					},
				},
			};
		},
	};
	const Pagination = (props) =>
		React.createElement(
			'nav',
			{ 'aria-label': props['aria-label'], 'data-pagination': true },
			Array.from({ length: props.count }, (_, index) =>
				React.createElement(
					'button',
					{
						key: index,
						disabled: props.disabled,
						'aria-label': props.getItemAriaLabel('page', index + 1, props.page === index + 1),
						'aria-current': props.page === index + 1 ? 'page' : undefined,
						onClick: (event) => props.onChange(event, index + 1),
					},
					index + 1,
				),
			),
		);
	const mocks = {
		'next/router': { useRouter: () => router },
		'next/link': ({ children, href, passHref, shallow, scroll, ...props }) =>
			React.createElement(
				'a',
				{
					...props,
					href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
				},
				children,
			),
		'next-i18next': { useTranslation: () => ({ t, i18n: { language } }) },
		'@mui/material': { Pagination },
		'@apollo/client': {
			useReactiveVar: (variable) => variable(),
			useApolloClient: () => client,
			useMutation: (operation) => [
				async (request) => {
					assert.equal(operation, 'UPDATE_BOARD_ARTICLE', 'Only owner update may delete');
					state.mutations.push({ operation, ...request });
					if (state.write) return await state.write(request);
					const input = request.variables.input;
					state.rows = state.rows.filter((row) => row._id !== input._id);
					return {
						data: {
							updateBoardArticle: {
								_id: input._id,
								articleStatus: 'DELETE',
								articleRevision: input.expectedRevision + 1,
							},
						},
					};
				},
			],
		},
		'../../../apollo/store': { userVar: () => user, authReadyVar: () => ready, authErrorVar: () => authError },
		'../../../apollo/user/query': { GET_MY_BOARD_ARTICLES: 'GET_MY_BOARD_ARTICLES' },
		'../../../apollo/user/mutation': { UPDATE_BOARD_ARTICLE: 'UPDATE_BOARD_ARTICLE' },
		'../../auth': {
			getJwtToken: () => token, getAuthSessionId: () => token, ensureAccessToken: async () => token,
			invalidateSession: () => {
				state.invalidations++;
				user = { ...user, _id: '' };
				token = '';
			},
			updateUserInfo: async () => {
				state.authRetries++;
			},
		},
		'../../config': { REACT_APP_API_URL: 'http://localhost:3007' },
		'../../sweetAlert': {
			sweetConfirmAlert: async (message) => {
				state.confirmations.push(message);
				return typeof state.confirm === 'function' ? await state.confirm() : state.confirm;
			},
		},
	};
	// Load the actual DOMPurify boundary; excerpts are never tested against an identity sanitizer.
	const Page = load('libs/components/mypage/MyArticles.tsx', mocks).default;
	dom.window.HTMLElement.prototype.scrollIntoView = () => {};
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	async function settle() {
		await act(async () => {
			await tick();
			await tick();
		});
	}
	async function mount(options = {}) {
		if (root) await act(async () => root.unmount());
		user = { _id: owner, memberStatus: 'ACTIVE', memberType: 'USER', ...options.user };
		ready = options.ready ?? true;
		authError = options.authError ?? '';
		token = options.token ?? 'fixture-token';
		language = options.language ?? 'en';
		router.isReady = options.routerReady ?? true;
		router.query = { category: 'myArticles', ...(options.page !== undefined ? { page: options.page } : {}) };
		Object.assign(state, {
			rows: options.rows ?? [article()],
			queries: [],
			mutations: [],
			confirmations: [],
			navigation: [],
			read: options.read ?? null,
			write: null,
			confirm: true,
			authRetries: 0,
			invalidations: 0,
		});
		root = createRoot(document.querySelector('#root'));
		await act(async () => {
			root.render(React.createElement(Page));
			await tick();
		});
		await settle();
	}
	async function render() {
		await act(async () => {
			root.render(React.createElement(Page));
			await tick();
		});
	}
	async function click(selector = '.my-article-delete') {
		await act(async () => {
			Simulate.click(document.querySelector(selector));
			await tick();
		});
		await settle();
	}
	const rows = () => [...document.querySelectorAll('.my-article-row')];
	const text = () => document.querySelector('#root').textContent;
	for (const role of ['USER', 'TRAINER', 'ADMIN']) {
		await mount({ user: { memberType: role } });
		check(role + ' uses authenticated owner query with OrdinaryInquiry only', () =>
			assert.deepEqual(state.queries[0], {
				query: 'GET_MY_BOARD_ARTICLES',
				variables: { input: { page: 1, limit: 6 } },
				fetchPolicy: 'no-cache',
				context: { queryDeduplication: false, handleErrorLocally: true },
			}),
		);
	}
	await mount({ ready: false });
	check('auth restoration makes no owner request', () => {
		assert.equal(state.queries.length, 0);
		assert(text().includes(copy.Restoring));
	});
	ready = true;
	await render();
	check('restored active account loads its own articles', () => {
		assert.equal(state.queries.length, 1);
		assert.equal(rows().length, 1);
	});
	await mount({ routerReady: false });
	check('router readiness also gates private reads', () => assert.equal(state.queries.length, 0));
	await mount({ user: { _id: '' }, token: '' });
	check('guest gets canonical login referrer and no private request', () => {
		assert.equal(state.queries.length, 0);
		assert(text().includes(copy['Login required']));
		assert(document.querySelector('a[href="/account/join?referrer=%2Fmypage%3Fcategory%3DmyArticles"]'));
	});
	for (const patch of [{ memberStatus: 'BLOCK' }, { memberStatus: 'DELETE' }, { memberType: 'UNKNOWN' }]) {
		await mount({ user: patch });
		check('inactive/unknown author cannot load private results', () => assert.equal(state.queries.length, 0));
	}
	await mount({ authError: 'offline' });
	await click('.my-articles-state button');
	check('auth failure Retry only restores authentication', () => {
		assert.equal(state.authRetries, 1);
		assert.equal(state.queries.length, 0);
		assert.equal(state.mutations.length, 0);
	});
	const loading = deferred();
	await mount({ read: () => loading.promise });
	check('pending list is loading, never empty', () => {
		assert(text().includes(copy.Loading));
		assert(!text().includes(copy['Empty title']));
		assert.equal(rows().length, 0);
	});
	await act(async () =>
		loading.resolve({ data: { getMyBoardArticles: { list: [article()], metaCounter: [{ total: 1 }] } } }),
	);
	check('owner response replaces loading', () => {
		assert.equal(rows().length, 1);
		assert(!text().includes(copy.Loading));
	});
	await mount({ rows: [] });
	check('successful empty library is intentional, with one Write CTA and no pagination', () => {
		assert(text().includes(copy['Empty title']));
		assert(!document.querySelector('[role=alert]'));
		assert.equal(document.querySelectorAll('a[href="/mypage?category=writeArticle"]').length, 1);
		assert(!document.querySelector('[data-pagination]'));
	});
	await mount({
		read: async () => {
			throw Error('offline');
		},
	});
	check('failed load is an error, not an empty library', () => {
		assert(document.querySelector('[role=alert]'));
		assert(!text().includes(copy['Empty title']));
	});
	state.read = null;
	await click('.my-articles-state button');
	check('list Retry is read-only and restores the owner list', () => {
		assert.equal(state.queries.length, 2);
		assert.equal(state.mutations.length, 0);
		assert.equal(rows().length, 1);
	});
	for (const row of [article(1, { memberId: 'c'.repeat(24) }), article(1, { articleStatus: 'DELETE' })]) {
		await mount({ rows: [row] });
		check('foreign/deleted response data fails closed', () => {
			assert.equal(rows().length, 0);
			assert(document.querySelector('[role=alert]'));
		});
	}
	await mount({
		rows: [
			article(1, {
				articleViews: 1420,
				articleLikes: 0,
				articleComments: 19,
				articleImage: 'uploads/article/existing.png',
			}),
		],
	});
	check('real nonzero and zero counters render without fake metrics', () => {
		assert(document.querySelector('.my-article-meta').textContent.includes('1,420 Views'));
		assert(document.querySelector('.my-article-meta').textContent.includes('0 Likes'));
		assert(document.querySelector('.my-article-meta').textContent.includes('19 Comments'));
	});
	check('createdAt is the publication date', () => {
		assert.equal(document.querySelector('time').dateTime, '2026-10-16T03:00:00.000Z');
	});
	check('cover uses the established API-relative upload path', () =>
		assert.equal(
			document.querySelector('.my-article-media img').src,
			'http://localhost:3007/uploads/article/existing.png',
		),
	);
	check('distinct Write/Read/Edit links have exact canonical URLs', () => {
		assert(document.querySelector('a[href="/mypage?category=writeArticle"]'));
		assert.equal(
			document.querySelector('.my-article-read').getAttribute('href'),
			'/community/detail?articleCategory=TIP&id=' + article()._id,
		);
		assert.equal(
			document.querySelector('.my-article-edit').getAttribute('href'),
			'/mypage?category=editArticle&articleId=' + article()._id,
		);
		assert.equal(document.querySelector('.my-article-delete').tagName, 'BUTTON');
	});
	await act(async () => Simulate.error(document.querySelector('.my-article-media img')));
	check('failed cover disappears without a broken slot or demo photo', () =>
		assert(!document.querySelector('.my-article-media')),
	);
	await mount();
	check('missing cover is optional', () => assert(!document.querySelector('.my-article-media')));
	await mount({
		rows: [
			article(1, {
				articleContent:
					'<p>First&nbsp;&amp; second</p><p>Third<br>line</p><ul><li>Fourth</li><li>Fifth</li></ul><script>alert(1)</script><img src=x onerror=alert(1)><p>&lt;img src=x onerror=alert(2)&gt;</p>',
			}),
		],
	});
	check('excerpt decodes entities and preserves block word boundaries', () =>
		assert(
			document.querySelector('.my-article-excerpt').textContent.startsWith('First & second Third line Fourth Fifth'),
		),
	);
	check('malicious stored HTML is never rendered as markup', () => {
		assert(!document.querySelector('.my-article-excerpt img, .my-article-excerpt script, [onerror]'));
		assert(document.querySelector('.my-article-excerpt').textContent.includes('<img src=x onerror=alert(2)>'));
		assert(!document.querySelector('.my-article-excerpt').textContent.includes('alert(1)'));
	});
	await mount({ rows: [article(1, { articleContent: '<p>' + 'Complete word. '.repeat(45) + '</p>' })] });
	check('long excerpt truncates at a word boundary with an ellipsis', () => {
		const value = document.querySelector('.my-article-excerpt').textContent;
		assert(value.endsWith('…'));
		assert(Array.from(value).length <= 221);
		assert(value.endsWith('word.…') || value.endsWith('Complete…'));
	});
	await mount({ language: 'kr' });
	check('Korean locale maps to ko for date formatting', () =>
		assert(document.querySelector('time').textContent.includes('2026년')),
	);
	await mount({ rows: Array.from({ length: 8 }, (_, index) => article(index + 1)) });
	check('six owner articles per page, with quiet numbered pagination', () => {
		assert.equal(rows().length, 6);
		assert.equal(document.querySelectorAll('[data-pagination] button').length, 2);
	});
	await click('[data-pagination] button:nth-child(2)');
	check('page navigation sends page/limit only and preserves the canonical category', () => {
		assert.deepEqual(state.queries.at(-1).variables.input, { page: 2, limit: 6 });
		assert.equal(rows().length, 2);
		assert.deepEqual(state.navigation.at(-1), {
			method: 'push',
			url: { pathname: '/mypage', query: { category: 'myArticles', page: 2 } },
			options: { shallow: true, scroll: false },
		});
	});
	router.query = { category: 'myArticles' };
	await render();
	check('Back to page one loads the first owner page', () => {
		assert.equal(rows().length, 6);
		assert.equal(state.queries.at(-1).variables.input.page, 1);
	});
	await mount({ page: '99', rows: Array.from({ length: 8 }, (_, index) => article(index + 1)) });
	check('stale page clamps using authoritative total and replaces URL', () => {
		assert.equal(state.navigation[0].method, 'replace');
		assert.equal(state.navigation[0].url.query.page, 2);
		assert.equal(rows().length, 2);
		assert.equal(state.queries.at(-1).variables.input.page, 2);
	});
	for (const value of ['0', '-1', '1.5', 'bad', '2147483648', ['2']]) {
		await mount({ page: value });
		check('invalid page ' + JSON.stringify(value) + ' uses page one', () =>
			assert.equal(state.queries[0].variables.input.page, 1),
		);
	}
	await mount();
	check('revision zero permits deletion', () => assert(!document.querySelector('.my-article-delete').disabled));
	for (const revision of [undefined, null, -1, 0.5, '0', 2147483647]) {
		await mount({ rows: [article(1, { articleRevision: revision })] });
		await click();
		check('invalid revision ' + revision + ' blocks confirmation and mutation', () => {
			assert(document.querySelector('.my-article-delete').disabled);
			assert.equal(state.confirmations.length, 0);
			assert.equal(state.mutations.length, 0);
		});
	}
	await mount();
	state.confirm = false;
	await click();
	check('confirmation names the article and cancellation never writes', () => {
		assert(state.confirmations[0].includes(article().articleTitle));
		assert.equal(state.mutations.length, 0);
		assert.equal(state.queries.length, 1);
		assert(!document.querySelector('.my-article-delete').disabled);
	});
	const confirmation = deferred();
	state.confirm = () => confirmation.promise;
	await act(async () => {
		const button = document.querySelector('.my-article-delete');
		Simulate.click(button);
		Simulate.click(button);
	});
	check('synchronous lock prevents duplicate confirmation flows', () => assert.equal(state.confirmations.length, 2));
	await act(async () => confirmation.resolve(true));
	await settle();
	check('one confirmed update deletes with the exact three-field input and revision zero', () => {
		assert.equal(state.mutations.length, 1);
		assert.deepEqual(state.mutations[0], {
			operation: 'UPDATE_BOARD_ARTICLE',
			variables: { input: { _id: article()._id, articleStatus: 'DELETE', expectedRevision: 0 } },
			fetchPolicy: 'no-cache',
			context: { handleErrorLocally: true },
		});
		assert.equal(state.queries.length, 2);
	});
	check('final deletion reaches authoritative page-one empty state', () => {
		assert(text().includes(copy.Deleted));
		assert(text().includes(copy['Empty title']));
		assert.equal(rows().length, 0);
		assert(!router.query.page);
	});
	await mount({ page: '2', rows: Array.from({ length: 7 }, (_, index) => article(index + 1)) });
	await click();
	check('deleting last row on last page clamps and fills the previous page', () => {
		assert(!router.query.page);
		assert.equal(rows().length, 6);
		assert.equal(state.mutations.length, 1);
		assert.deepEqual(state.queries.at(-1).variables.input, { page: 1, limit: 6 });
		assert(!document.querySelector('[data-pagination]'));
	});
	await mount({ rows: [article(1), article(2)] });
	state.write = async (request) => {
		state.rows = [article(2)];
		state.read = async () => {
			throw Error('refresh failed');
		};
		return {
			data: { updateBoardArticle: { _id: request.variables.input._id, articleStatus: 'DELETE', articleRevision: 1 } },
		};
	};
	await click();
	check('confirmed deletion plus refresh failure has explicit safe feedback', () => {
		assert(text().includes(copy['Sync failed']));
		assert(!text().includes(copy['Empty title']));
		assert.equal(state.mutations.length, 1);
	});
	state.read = null;
	await click('.my-articles-state button');
	check('post-delete Retry reads only and uses authoritative refreshed total', () => {
		assert(text().includes(copy.Deleted));
		assert(!text().includes(copy['Sync failed']));
		assert.equal(state.mutations.length, 1);
		assert.equal(rows().length, 1);
		assert(text().includes('of 1 articles'));
	});
	for (const error of [
		{ graphQLErrors: [{ code: 'INTERNAL_SERVER_ERROR', message: 'Article changed; reload before saving again' }] },
		{ graphQLErrors: [{ message: 'Conflict', extensions: { originalError: { statusCode: 409 } } }] },
	]) {
		await mount();
		state.write = async () => {
			state.rows = [article(1, { articleRevision: 4 })];
			throw error;
		};
		await click();
		check('conflict stays distinct and refresh does not auto-delete', () => {
			assert(text().includes(copy.Conflict));
			assert.equal(state.mutations.length, 1);
			assert.equal(state.confirmations.length, 1);
			assert.equal(state.queries.length, 2);
			assert.equal(rows().length, 1);
		});
		state.write = null;
		await click();
		check('new explicit confirmation uses the refreshed revision', () => {
			assert.equal(state.confirmations.length, 2);
			assert.equal(state.mutations[1].variables.input.expectedRevision, 4);
		});
	}
	await mount();
	state.write = async () => {
		state.read = async () => {
			throw Error('offline');
		};
		throw { graphQLErrors: [{ message: 'Article changed; reload before saving again' }] };
	};
	await click();
	check('conflict plus failed reconciliation retains conflict and blocks stale deletion', () => {
		assert(text().includes(copy.Conflict));
		assert(document.querySelector('.my-articles-state button'));
		assert.equal(state.mutations.length, 1);
	});
	state.read = null;
	state.rows = [article(1, { articleRevision: 5 })];
	await click('.my-articles-state button');
	check('conflict Retry is read-only', () => assert.equal(state.mutations.length, 1));
	for (const removed of [false, true]) {
		await mount();
		state.write = async () => {
			if (removed) state.rows = [];
			throw { networkError: Error('response lost') };
		};
		await click();
		check('uncertain outcome reconciles via owner read, removed=' + removed, () => {
			assert(text().includes(copy.Uncertain));
			assert.equal(state.mutations.length, 1);
			assert.equal(state.confirmations.length, 1);
			assert.equal(state.queries.length, 2);
			assert.equal(rows().length, removed ? 0 : 1);
		});
		if (!removed) {
			state.confirm = false;
			await click();
			check('reconciled remaining article requires new confirmation', () => {
				assert.equal(state.confirmations.length, 2);
				assert.equal(state.mutations.length, 1);
			});
		}
	}
	await mount();
	state.write = async () => {
		state.read = async () => {
			throw Error('reconciliation offline');
		};
		throw { networkError: Error('response lost') };
	};
	await click();
	check('uncertain outcome plus failed reconciliation blocks every stale delete', () => {
		assert(text().includes(copy.Uncertain));
		assert.equal(document.querySelectorAll('.my-article-delete').length, 0);
		assert.equal(state.mutations.length, 1);
	});
	state.read = null;
	await click('.my-articles-state button');
	check('uncertain reconciliation Retry only reads before enabling a new confirmation', () => {
		assert.equal(state.mutations.length, 1);
		assert.equal(state.confirmations.length, 1);
		assert(!document.querySelector('.my-article-delete').disabled);
	});
	await mount();
	state.write = async () => {
		state.rows = [];
		throw { graphQLErrors: [{ code: 'INTERNAL_SERVER_ERROR', message: 'No data found!' }] };
	};
	await click();
	check('already unavailable reconciles without replay', () => {
		assert(text().includes(copy.Unavailable));
		assert.equal(state.mutations.length, 1);
		assert.equal(rows().length, 0);
	});
	await mount();
	const pendingWrite = deferred();
	state.write = () => pendingWrite.promise;
	await click();
	await click();
	check('in-flight mutation blocks duplicate delete', () => assert.equal(state.mutations.length, 1));
	user = { ...user, _id: 'c'.repeat(24) };
	token = 'second-fixture';
	state.rows = [article(9, { memberId: user._id, articleTitle: 'Second owner story' })];
	await render();
	check('account switch immediately clears prior private content', () => {
		assert(!text().includes(article().articleTitle));
		assert(text().includes('Second owner story'));
	});
	const readsBeforeOldWrite = state.queries.length;
	await act(async () =>
		pendingWrite.resolve({
			data: { updateBoardArticle: { _id: article()._id, articleStatus: 'DELETE', articleRevision: 1 } },
		}),
	);
	check('obsolete mutation response cannot refetch or overwrite another account', () => {
		assert.equal(state.queries.length, readsBeforeOldWrite);
		assert(!text().includes(copy.Deleted));
	});
	const oldRead = deferred();
	await mount({ read: () => oldRead.promise });
	user = { ...user, _id: 'c'.repeat(24) };
	token = 'other-token';
	state.read = null;
	state.rows = [article(9, { memberId: user._id, articleTitle: 'Current owner content' })];
	await render();
	await act(async () =>
		oldRead.resolve({ data: { getMyBoardArticles: { list: [article()], metaCounter: [{ total: 1 }] } } }),
	);
	check('obsolete owner response cannot expose previous owner content', () => {
		assert(text().includes('Current owner content'));
		assert(!text().includes(article().articleTitle));
	});
	await mount();
	const pendingConfirm = deferred();
	state.confirm = () => pendingConfirm.promise;
	await click();
	events.get('routeChangeStart')();
	await act(async () => pendingConfirm.resolve(true));
	check('navigation during confirmation invalidates the action before mutation', () =>
		assert.equal(state.mutations.length, 0),
	);
	await mount();
	const beforeLogout = deferred();
	state.confirm = () => beforeLogout.promise;
	await click();
	token = '';
	user = { ...user, _id: '' };
	await act(async () => beforeLogout.resolve(true));
	await render();
	check('logout during confirmation cannot delete or retain private rows', () => {
		assert.equal(state.mutations.length, 0);
		assert.equal(rows().length, 0);
	});
	await mount();
	const obsoletePage = deferred();
	state.read = (request) =>
		request.variables.input.page === 2
			? obsoletePage.promise
			: Promise.resolve({ data: { getMyBoardArticles: { list: [article()], metaCounter: [{ total: 1 }] } } });
	router.query = { category: 'myArticles', page: '2' };
	await render();
	router.query = { category: 'myArticles' };
	await render();
	await act(async () =>
		obsoletePage.resolve({ data: { getMyBoardArticles: { list: [article(2)], metaCounter: [{ total: 7 }] } } }),
	);
	check('obsolete page response cannot replace current page content', () => {
		assert.equal(rows()[0].dataset.articleId, article()._id);
		assert(!text().includes(article(2).articleTitle));
	});
	await act(async () => root.unmount());
	root = createRoot(document.querySelector('#root'));
	const AccountNavigation = load('libs/components/mypage/UserAccountNavigation.tsx', mocks).default;
	for (const active of ['Profile', 'Favorites']) {
		await act(async () => root.render(React.createElement(AccountNavigation, { active })));
		check(active + ' account navigation exposes My Articles in the existing order', () => {
			const links = [...document.querySelectorAll('.user-account-navigation a')];
			assert.deepEqual(
				links.map((link) => link.getAttribute('href')),
				[
					'/mypage?category=myBookings',
					'/mypage?category=myFavorites',
					'/mypage?category=myArticles',
					'/mypage?category=myProfile',
				],
			);
			assert.equal(links[2].querySelector('.user-profile-desktop-copy').textContent, copy.Title);
			assert.equal(links[2].querySelector('.user-profile-mobile-copy').textContent, copy.Title);
			assert.equal(
				document.querySelector('[aria-current=page]').getAttribute('href'),
				'/mypage?category=' + (active === 'Profile' ? 'myProfile' : 'myFavorites'),
			);
		});
	}
	const Community = load('pages/community/index.tsx', {
		...mocks,
		'@apollo/client': {
			...mocks['@apollo/client'],
			useQuery: () => ({ loading: false, data: { getBoardArticles: { list: [], metaCounter: [] } } }),
		},
		'next-i18next/serverSideTranslations': {},
		'../../libs/components/layout/LayoutBasic': (component) => component,
		'../../libs/components/community/CommunityStory': () => null,
		'../../apollo/store': mocks['../../../apollo/store'],
		'../../apollo/user/query': { GET_BOARD_ARTICLES: 'GET_BOARD_ARTICLES' },
		'../../apollo/user/mutation': { LIKE_TARGET_BOARD_ARTICLE: 'LIKE_TARGET_BOARD_ARTICLE' },
		'../../libs/config': { Messages: {} },
		'../../libs/sweetAlert': {},
	}).default;
	router.query = {};
	ready = true;
	authError = '';
	for (const role of ['USER', 'TRAINER', 'ADMIN']) {
		user = { _id: owner, memberStatus: 'ACTIVE', memberType: role };
		await act(async () => root.render(React.createElement(Community)));
		check(role + ' discovers My Articles beside the existing Community Write action', () => {
			assert.equal(
				document.querySelector('.community-my-articles-link').getAttribute('href'),
				'/mypage?category=myArticles',
			);
			assert.equal(document.querySelector('.community-my-articles-link').textContent, copy.Title);
			assert.equal(
				document.querySelector('.community-author-actions .community-write-link').getAttribute('href'),
				'/mypage?category=writeArticle',
			);
		});
	}
	for (const access of ['guest', 'restoring', 'error', 'blocked']) {
		user = {
			_id: access === 'guest' ? '' : owner,
			memberStatus: access === 'blocked' ? 'BLOCK' : 'ACTIVE',
			memberType: 'USER',
		};
		ready = access !== 'restoring';
		authError = access === 'error' ? 'offline' : '';
		await act(async () => root.render(React.createElement(Community)));
		check(access + ' Community state keeps the private entry hidden and existing Write action intact', () => {
			assert(!document.querySelector('.community-my-articles-link'));
			assert(document.querySelector('.community-author-actions .community-write-link'));
		});
	}
	await act(async () => root.unmount());
	dom.window.close();
	for (const locale of ['en', 'kr', 'ru']) {
		const current = JSON.parse(
			fs.readFileSync(path.resolve(__dirname, '../public/locales/' + locale + '/common.json'), 'utf8'),
		)['My articles'];
		check(locale + ' My Articles locale complete', () => {
			assert.deepEqual(Object.keys(current), Object.keys(copy));
			assert(Object.values(current).every((value) => typeof value === 'string' && value.trim()));
		});
	}
	const css = require('sass').compile(path.resolve(__dirname, '../scss/pc/mypage/myArticles.scss')).css;
	let rules = 0;
	require('postcss')
		.parse(css)
		.walkRules((rule) => {
			assert(rule.selectors.every((selector) => selector.startsWith('#pc-wrap.community-my-articles-layout')));
			rules++;
		});
	check('compiled responsive styles are isolated to My Articles', () => {
		assert(rules > 40);
		assert(css.includes('@media (max-width: 767px)'));
		assert(css.includes('scroll-margin-bottom: calc(96px + env(safe-area-inset-bottom, 0px))'));
	});
	const shell = fs.readFileSync(path.resolve(__dirname, '../scss/pc/program/program.scss'), 'utf8');
	check('existing mobile shell supplies fixed nav bottom clearance', () =>
		assert(shell.includes('padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px))')),
	);
	console.log(checks + ' My Articles checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
