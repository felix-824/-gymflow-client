// Reviews checks use the existing owned disposable API fixture; never application connection values.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let checks = 0;
const output = console.log;
const pass = (name) => {
	checks++;
	output('PASS ' + name);
};
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
			const resolved = path.resolve(path.dirname(file), name);
			return loadTs(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '/index.ts', mocks, cache);
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
const helpers = loadTs(path.join(__dirname, '../libs/reviews.ts'));
const resources = Object.fromEntries(
	['en', 'kr', 'ru'].map((locale) => [
		locale,
		{ common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')) },
	]),
);
function unit() {
	for (const reservationStatus of ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW']) {
		for (const reviewId of [null, 'existing'])
			assert.equal(helpers.reservationReviewState({ reservationStatus, reviewId }), 'ineligible');
	}
	assert.equal(helpers.reservationReviewState({ reservationStatus: 'COMPLETED', reviewId: null }), 'eligible');
	assert.equal(helpers.reservationReviewState({ reservationStatus: 'COMPLETED', reviewId: 'existing' }), 'submitted');
	pass('only COMPLETED uses authoritative nullable reviewId eligibility');
	for (const rating of [1, 5]) assert(helpers.validReview(rating, ' Good '));
	for (const rating of [0, 6, 1.5]) assert(!helpers.validReview(rating, 'Good'));
	for (const content of ['', '  \n\t', 'x'.repeat(101)]) assert(!helpers.validReview(5, content));
	assert(helpers.validReview(5, '  ' + 'x'.repeat(100) + '  '));
	pass('rating boundaries, trimmed content boundaries and whitespace rejection');
	const id = 'a'.repeat(24),
		input = helpers.reviewInput(id, 5, ' Great ');
	assert.deepEqual(input, { reservationId: id, rating: 5, content: 'Great' });
	assert.throws(() => helpers.reviewInput('bad', 5, 'Good'));
	assert(helpers.reviewReceiptMatches({ _id: 'b'.repeat(24), programId: id, rating: 5, content: 'Great' }, input, id));
	assert(!helpers.reviewReceiptMatches(null, input, id));
	assert(
		!helpers.reviewReceiptMatches({ _id: 'b'.repeat(24), programId: 'other', rating: 5, content: 'Great' }, input, id),
	);
	pass('minimal mutation payload and authoritative response checks');
	assert.equal(helpers.reviewerName({ memberFullName: ' Name ', memberNick: 'nick' }, 'Member'), 'Name');
	assert.equal(helpers.reviewerName({ memberFullName: ' ', memberNick: ' nick ' }, 'Member'), 'nick');
	assert.equal(helpers.reviewerName(null, 'Member'), 'Member');
	assert.equal(helpers.reviewTotal({ list: [], averageRating: null, metaCounter: [{ total: 7 }] }), 7);
	assert.equal(helpers.reviewTotal({ metaCounter: [{ total: -1 }] }), 0);
	assert.equal(helpers.reviewDate('bad', 'en'), '');
	assert(helpers.reviewDate('2030-01-01T15:00:00Z', 'en').includes('2'));
	pass('reviewer name fallback, truthful totals, null/empty and Seoul dates');
	assert.equal(helpers.reviewErrorKind({ networkError: new Error('offline') }), 'Unknown');
	for (const [status, message, expected] of [
		[409, 'This reservation already has a review', 'Already reviewed'],
		[409, 'Only completed reservations can be reviewed', 'Ineligible'],
		[404, 'private details', 'Unavailable'],
		[401, 'private details', 'Unauthorized'],
		[400, 'private details', 'Invalid'],
		[500, 'private details', 'Unknown'],
	])
		assert.equal(
			helpers.reviewErrorKind({ graphQLErrors: [{ message, extensions: { originalError: { statusCode: status } } }] }),
			expected,
		);
	pass('sanitized business/auth errors and ambiguous failure classification');
	for (const locale of ['kr', 'ru'])
		assert.deepEqual(
			Object.keys(resources[locale].common.Reviews).sort(),
			Object.keys(resources.en.common.Reviews).sort(),
		);
	pass('matching EN/KR/RU Reviews keys and valid JSON');
}
async function integration() {
	const originalLog = console.log;
	console.log = () => {};
	let fixture, root, client, dom;
	try {
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		assert.equal(new URL(fixture.uri).hostname, '127.0.0.1');
		const { buildClientSchema, getIntrospectionQuery, parse, validate } = require('graphql');
		const rawSchema = await (
			await fetch(fixture.uri, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: getIntrospectionQuery() }),
			})
		).json();
		assert(!rawSchema.errors);
		const schema = buildClientSchema(rawSchema.data);
		for (const document of require('./check-graphql.cjs').collectDocuments())
			assert.deepEqual(validate(schema, parse(document.query)), [], document.name);
		pass(
			'all ' +
				require('./check-graphql.cjs').collectDocuments().length +
				' frontend documents validate against fresh full runtime schema',
		);
		const { JSDOM } = require('jsdom');
		dom = new JSDOM('<!doctype html><html><body><div id="test-root"></div></body></html>', {
			url: 'http://127.0.0.1/',
		});
		global.window = dom.window;
		global.document = dom.window.document;
		global.navigator = dom.window.navigator;
		global.HTMLElement = dom.window.HTMLElement;
		global.Image = dom.window.Image;
		global.Node = dom.window.Node;
		global.localStorage = dom.window.localStorage;
		window.matchMedia = () => ({
			matches: false,
			addListener() {},
			removeListener() {},
			addEventListener() {},
			removeEventListener() {},
		});
		const React = require('react'),
			{ createRoot } = require('react-dom/client'),
			{ Simulate } = require('react-dom/test-utils');
		const { ApolloLink, ApolloProvider, HttpLink } = require('@apollo/client');
		const i18n = require('i18next').createInstance();
		await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const query = loadTs(path.join(__dirname, '../apollo/user/query.ts'));
		const mutation = loadTs(path.join(__dirname, '../apollo/user/mutation.ts'));
		const requests = [],
			navigations = [],
			notifications = [],
			globalAlerts = [];
		let gate = null,
			dropResponse = false,
			failRead = false;
		const transport = new HttpLink({
			uri: fixture.uri,
			fetch: async (uri, options) => {
				const operation = JSON.parse(options.body);
				requests.push(operation);
				if (operation.operationName === 'GetReviews' && failRead) throw new Error('Read offline');
				if (operation.operationName === 'CreateReview' && gate) await gate;
				const response = await fetch(uri, options);
				if (operation.operationName === 'CreateReview' && dropResponse) throw new Error('Lost response');
				return response;
			},
		});
		const auth = loadTs(path.join(__dirname, '../libs/auth/index.ts'), {
			'../../apollo/client': { initializeApollo: () => client },
			'../../apollo/store': store,
		});
		client = loadTs(path.join(__dirname, '../apollo/client.ts'), {
			'../libs/auth': auth,
			'./store': store,
			'../libs/sweetAlert': { sweetErrorAlert: async (message) => globalAlerts.push(message) },
			'@apollo/client/link/ws': {
				WebSocketLink: class extends ApolloLink {
					constructor() {
						super();
					}
				},
			},
			'apollo-upload-client/public/createUploadLink.js': function () {
				return transport;
			},
		}).initializeApollo();
		const router = {
			isReady: true,
			pathname: '/mypage/review',
			locale: 'en',
			query: {},
			asPath: '',
			push: async (url) => {
				navigations.push(url);
				return true;
			},
			replace: async (url) => {
				router.query = url.query;
				return true;
			},
		};
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/head': { __esModule: true, default: () => null },
			'next/link': {
				__esModule: true,
				default: ({ href, passHref, ...props }) =>
					React.createElement('a', {
						...props,
						href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
					}),
			},
			'next-i18next': { useTranslation: () => ({ t: i18n.getFixedT(router.locale), i18n }) },
			'../../libs/components/layout/LayoutBasic': { __esModule: true, default: (component) => component },
			'../../apollo/store': store,
			'../../../apollo/store': store,
			'../../libs/auth': auth,
			'../../auth': auth,
			'../../libs/sweetAlert': { sweetTopSmallSuccessAlert: async (message) => notifications.push(message) },
		};
		const LeaveReview = loadTs(path.join(__dirname, '../pages/mypage/review.tsx'), mocks).LeaveReview;
		const ProgramReviews = loadTs(path.join(__dirname, '../libs/components/program/ProgramReviews.tsx'), mocks).default;
		const MyBookings = loadTs(path.join(__dirname, '../libs/components/mypage/MyBookings.tsx'), mocks).default;
		root = createRoot(document.getElementById('test-root'));
		const render = (component, props = {}) =>
			root.render(React.createElement(ApolloProvider, { client }, React.createElement(component, props)));
		const reset = () => {
			root.unmount();
			root = createRoot(document.getElementById('test-root'));
		};
		const until = async (predicate) => {
			const start = Date.now();
			while (!predicate()) {
				if (Date.now() - start > 15000) throw new Error('Timed out: ' + document.body.textContent);
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		};
		const text = () => document.body.textContent;
		const click = (selector) => {
			const element = document.querySelector(selector);
			assert(element, selector);
			element.click();
		};
		const change = (value) => Simulate.change(document.querySelector('#review-content'), { target: { value } });
		const record = async () =>
			fixture.reservations.create({
				memberId: fixture.user._id,
				trainerId: fixture.trainer._id,
				programId: fixture.program._id,
				reservationDate: fixture.history[0].reservationDate,
				startTime: '09:00',
				endTime: '10:00',
				reservationStatus: 'COMPLETED',
				specialRequest: 'Never show this request',
			});
		const first = await record();
		router.query = { reservationId: String(first._id), page: '1' };
		router.asPath = '/mypage/review?reservationId=' + first._id;
		auth.setJwtToken(fixture.token(fixture.user));
		store.authReadyVar(false);
		render(LeaveReview);
		await until(() => text().includes(resources.en.common.MyBookings.initializing));
		assert.equal(requests.length, 0);
		await auth.updateUserInfo();
		await until(() => document.querySelector('#review-content'));
		assert(store.authReadyVar());
		assert.equal(store.userVar()._id, String(fixture.user._id));
		assert(!text().includes('Never show this request'));
		assert(!text().includes('Fixture training room'));
		pass(
			'cold authenticated mount waits for real CheckAuth/profile restore and loads owned context without private booking fields',
		);
		assert(document.querySelector('.leave-review-submit').disabled);
		click('input[name="review-rating"][value="5"]');
		change('   ');
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert(document.querySelector('.leave-review-submit').disabled);
		change('  Helpful cues  ');
		await until(() => !document.querySelector('.leave-review-submit').disabled);
		assert(text().includes('16 / 100'));
		let release;
		gate = new Promise((resolve) => {
			release = resolve;
		});
		click('.leave-review-submit');
		click('.leave-review-submit');
		await until(() => requests.some((item) => item.operationName === 'CreateReview'));
		const createRequests = () => requests.filter((item) => item.operationName === 'CreateReview');
		assert.equal(createRequests().length, 1);
		assert.deepEqual(createRequests()[0].variables.input, {
			reservationId: String(first._id),
			rating: 5,
			content: 'Helpful cues',
		});
		assert(document.querySelector('.leave-review-submit').disabled);
		assert.equal(notifications.length, 0);
		release();
		gate = null;
		await until(() => notifications.length === 1 && navigations.length === 1);
		assert.equal(navigations[0], '/mypage?category=myBookings&period=HISTORY&page=1');
		pass(
			'invalid form blocked; counter, exact trimmed payload, synchronous duplicate lock and server-confirmed success',
		);
		reset();
		router.pathname = '/mypage';
		router.query = { category: 'myBookings', period: 'HISTORY', page: '1' };
		render(MyBookings);
		await until(() => document.querySelector('[data-reservation-id="' + first._id + '"] .my-bookings-review'));
		const card = document.querySelector('[data-reservation-id="' + first._id + '"]');
		assert(card.textContent.includes(resources.en.common.Reviews['Review submitted']));
		assert(!card.querySelector('.my-bookings-review a'));
		pass('return to My Bookings uses real backend reviewId and a non-action submitted state');
		reset();
		const stale = await record();
		router.pathname = '/mypage/review';
		router.query = { reservationId: String(stale._id) };
		render(LeaveReview);
		await until(() => document.querySelector('#review-content'));
		await client.mutate({
			mutation: mutation.CREATE_REVIEW,
			variables: { input: { reservationId: String(stale._id), rating: 3, content: 'Other tab' } },
		});
		click('input[value="1"]');
		change('Stale submission');
		await until(() => !document.querySelector('.leave-review-submit').disabled);
		click('.leave-review-submit');
		await until(() => text().includes(resources.en.common.Reviews['Review submitted']));
		assert.equal(notifications.length, 1);
		assert.equal(navigations.length, 1);
		pass('real duplicate error reconciles submitted state without claiming a new success');
		assert.equal(globalAlerts.length, 0);
		await client
			.mutate({
				mutation: mutation.CREATE_REVIEW,
				variables: { input: { reservationId: String(stale._id), rating: 3, content: 'Unflagged error check' } },
			})
			.catch(() => {});
		assert.equal(globalAlerts.pop(), 'This reservation already has a review');
		pass(
			'real shared Apollo error link suppresses raw alerts for locally handled Reviews while retaining default alerts',
		);
		reset();
		const lost = await record();
		router.query = { reservationId: String(lost._id) };
		render(LeaveReview);
		await until(() => document.querySelector('#review-content'));
		click('input[value="4"]');
		change('Lost response check');
		await until(() => !document.querySelector('.leave-review-submit').disabled);
		dropResponse = true;
		const beforeLost = createRequests().length;
		click('.leave-review-submit');
		await until(() => text().includes(resources.en.common.Reviews.Unknown));
		assert(document.querySelector('.leave-review-submit').disabled);
		assert.equal(createRequests().length, beforeLost + 1);
		assert.equal(notifications.length, 1);
		dropResponse = false;
		click('.leave-review-feedback button');
		await until(() => text().includes(resources.en.common.Reviews['Review submitted']));
		assert.equal(createRequests().length, beforeLost + 1);
		assert.equal(notifications.length, 1);
		pass('lost mutation response never fakes success or retries; read-only status check finds committed review');
		for (const status of ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW']) {
			reset();
			const item = fixture.history.find((row) => row.reservationStatus === status);
			router.query = { reservationId: String(item._id) };
			render(LeaveReview);
			await until(() => text().includes(resources.en.common.Reviews.Ineligible));
			assert(!document.querySelector('#review-content'));
		}
		pass('direct routes reject all four non-COMPLETED statuses, including elapsed CONFIRMED');
		for (const id of [fixture.missing._id, new fixture.db.base.Types.ObjectId()]) {
			reset();
			router.query = { reservationId: String(id) };
			render(LeaveReview);
			await until(() => text().includes(resources.en.common.Reviews.Unavailable));
			assert(!document.querySelector('#review-content'));
		}
		reset();
		router.query = { reservationId: String(first._id) };
		render(LeaveReview);
		await until(() => text().includes(resources.en.common.Reviews['Review submitted']));
		assert(!document.querySelector('#review-content'));
		pass('fresh submitted route and missing/foreign owned context never reopen a form');
		reset();
		router.query = { reservationId: 'invalid' };
		const beforeInvalid = requests.length;
		render(LeaveReview);
		await until(() => text().includes(resources.en.common.Reviews.Unavailable));
		assert.equal(requests.length, beforeInvalid);
		for (const actor of [null, fixture.trainer, fixture.admin]) {
			reset();
			store.userVar(actor ? { ...actor.toObject(), _id: String(actor._id) } : { ...store.emptyUser });
			router.query = { reservationId: String(first._id) };
			const before = requests.length;
			render(LeaveReview);
			await until(() => text().includes(resources.en.common.MyBookings[actor ? 'forbidden' : 'guest']));
			assert.equal(requests.length, before);
		}
		pass('malformed routes and guest/TRAINER/ADMIN screens send no owned reservation queries');
		store.userVar({ ...fixture.user.toObject(), _id: String(fixture.user._id) });
		const extra = await record();
		await client.mutate({
			mutation: mutation.CREATE_REVIEW,
			variables: { input: { reservationId: String(extra._id), rating: 1, content: 'x'.repeat(100) } },
		});
		reset();
		router.pathname = '/program/detail';
		router.query = { id: String(fixture.program._id) };
		render(ProgramReviews, { programId: String(fixture.program._id) });
		await until(() => document.querySelectorAll('.program-review').length === 3);
		assert(text().includes('4 reviews'));
		assert(document.querySelector('.program-reviews-aggregate strong').textContent === '3.3');
		assert(!text().includes('Write Review'));
		assert(!text().includes('Private booking'));
		const pageTwo = Array.from(document.querySelectorAll('.MuiPaginationItem-page')).find(
			(button) => button.textContent === '2',
		);
		assert(pageTwo);
		pageTwo.click();
		await until(() => document.querySelectorAll('.program-review').length === 1);
		assert(requests.some((item) => item.operationName === 'GetReviews' && item.variables.input.page === 2));
		assert(text().includes('4 reviews'));
		pass('real program reviews, rounded average/total, editorial rows and backend numbered pagination');
		const reviewModel = fixture.db.model('Review');
		const storedReviews = await reviewModel.collection.find({ programId: fixture.program._id }).toArray();
		await reviewModel.deleteMany({ programId: fixture.program._id, _id: { $ne: storedReviews[0]._id } });
		await client.refetchQueries({ include: [query.GET_REVIEWS] });
		await until(
			() =>
				document.querySelectorAll('.program-review').length === 1 &&
				text().includes('1 review') &&
				!document.querySelector('.program-reviews-pagination'),
		);
		assert.equal(requests.filter((item) => item.operationName === 'GetReviews').at(-1).variables.input.page, 1);
		await reviewModel.collection.insertMany(storedReviews.slice(1));
		await client.refetchQueries({ include: [query.GET_REVIEWS] });
		await until(() => document.querySelectorAll('.program-review').length === 3);
		pass('out-of-range page reconciles to the real last page from updated metaCounter');
		for (const locale of ['en', 'kr', 'ru']) {
			router.locale = locale;
			await i18n.changeLanguage(locale);
			render(ProgramReviews, { programId: String(fixture.program._id) });
			await until(() => text().includes(resources[locale].common.Reviews.Title));
			assert(!text().includes('Reviews.Count'));
			assert(!text().includes('{{'));
		}
		pass('mounted EN/KR/RU review copy and plural/count interpolation');
		reset();
		router.locale = 'en';
		render(ProgramReviews, { programId: String(fixture.program._id), key: 'fresh' });
		await until(() => document.querySelectorAll('.program-review').length === 3);
		failRead = true;
		await client.refetchQueries({ include: [query.GET_REVIEWS] }).catch(() => {});
		await until(() => text().includes(resources.en.common.Reviews['Load error']));
		failRead = false;
		click('.program-reviews-state button');
		await until(() => document.querySelector('.program-review'));
		pass('local Reviews error/retry recovers without replacing Program Detail');
		reset();
		render(ProgramReviews, { programId: String(new fixture.db.base.Types.ObjectId()), key: 'empty' });
		await until(() => text().includes(resources.en.common.Reviews.Empty));
		assert(!document.querySelector('.program-reviews-aggregate'));
		assert(!document.querySelector('.program-review'));
		assert(!text().includes('Be the first'));
		assert(!text().includes('Write Review'));
		pass('real empty program scope handles null average and has no write action');
		assert.equal(globalAlerts.length, 0);
	} finally {
		console.log = originalLog;
		root?.unmount();
		client?.stop();
		await fixture?.stop();
		dom?.window.close();
		delete global.window;
		delete global.document;
		delete global.navigator;
		delete global.HTMLElement;
		delete global.Image;
		delete global.Node;
		delete global.localStorage;
	}
}
(async () => {
	unit();
	if (process.argv.includes('--integration')) await integration();
	output(checks + ' Reviews checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
