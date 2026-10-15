// My Bookings checks; writes are restricted to a disposable replica set.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
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
		if (name.endsWith('.css') || name.endsWith('.scss')) return {};
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
	return module.exports;
}
const helpers = loadTs(path.join(__dirname, '../libs/my-bookings.ts'));
const booking = loadTs(path.join(__dirname, '../libs/booking.ts'));
function unit() {
	for (const value of [undefined, ['2'], '0', '-1', '2.5', '1e2', '2147483648', '9007199254740992', {}, 'bad'])
		assert.deepEqual(helpers.readMyBookingsQuery({ period: 'bad', page: value }), { period: 'UPCOMING', page: 1 });
	assert.deepEqual(helpers.readMyBookingsQuery({ period: 'HISTORY', page: '2' }), { period: 'HISTORY', page: 2 });
	pass('safe URL defaults and valid History/page');
	const now = new Date('2026-12-31T15:00:00Z');
	assert.deepEqual(helpers.seoulNow(now), { date: '2027-01-01', time: '00:00' });
	const reservation = {
		_id: 'one',
		reservationDate: '2027-01-01',
		startTime: '00:01',
		endTime: '01:00',
		reservationStatus: 'PENDING',
	};
	for (const status of ['PENDING', 'CONFIRMED'])
		assert.ok(helpers.canCancelReservation({ ...reservation, reservationStatus: status }, now));
	for (const status of ['CANCELLED', 'COMPLETED', 'NO_SHOW'])
		assert.ok(!helpers.canCancelReservation({ ...reservation, reservationStatus: status }, now));
	for (const startTime of ['00:00', '24:00', 'bad'])
		assert.ok(!helpers.canCancelReservation({ ...reservation, startTime }, now));
	assert.ok(!helpers.canCancelReservation({ ...reservation, reservationDate: '2026-12-31' }, now));
	assert.ok(!helpers.canCancelReservation({ ...reservation, reservationDate: '2027-02-29' }, now));
	pass('Seoul midnight/year boundary; exact start, running, past and terminal status cancel protection');
	const localPage = { list: [reservation], metaCounter: [{ total: 19 }] };
	const global = {
		list: [{ ...reservation, _id: 'global', reservationStatus: 'CONFIRMED' }],
		metaCounter: [{ total: 8 }],
	};
	const hero = helpers.nextConfirmedReservation(global);
	assert.equal(hero._id, 'global');
	assert.equal(helpers.nextConfirmedReservation(localPage), null);
	assert.deepEqual(
		helpers.secondaryReservations([reservation, hero, { ...hero, _id: 'later' }], hero).map((r) => r._id),
		['one', 'later'],
	);
	assert.equal(helpers.reservationTotal(localPage), 19);
	assert.equal(helpers.reservationTotal({ list: [], metaCounter: [] }), 0);
	assert.equal(helpers.lastReservationPage(0), 1);
	assert.equal(helpers.lastReservationPage(7), 2);
	assert.equal(helpers.lastReservationPage(6), 1);
	pass(
		'global confirmed source, hero de-duplication, retained secondary records, meta totals and last-page correction',
	);
	const user = { _id: 'user', memberType: 'USER', memberStatus: 'ACTIVE' };
	assert.equal(helpers.myBookingsAccess(false, '', user), 'initializing');
	assert.equal(helpers.myBookingsAccess(true, 'error', user), 'error');
	assert.equal(helpers.myBookingsAccess(true, '', { ...user, _id: '' }), 'guest');
	for (const memberType of ['TRAINER', 'ADMIN'])
		assert.equal(helpers.myBookingsAccess(true, '', { ...user, memberType }), 'forbidden');
	assert.equal(helpers.myBookingsAccess(true, '', { ...user, memberStatus: 'BLOCK' }), 'guest');
	assert.equal(helpers.myBookingsAccess(true, '', user), 'ready');
	assert.equal(helpers.cancellationErrorKind({ networkError: new Error('lost') }), 'unknown');
	for (const statusCode of [404, 409])
		assert.equal(
			helpers.cancellationErrorKind({ graphQLErrors: [{ extensions: { originalError: { statusCode } } }] }),
			'stale',
		);
	assert.equal(helpers.cancellationErrorKind({ graphQLErrors: [{ extensions: { code: 'FORBIDDEN' } }] }), 'rejected');
	pass('auth states and cancellation error classification');
	const i18next = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{ common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')) },
		]),
	);
	const keys = Object.keys(resources.en.common.MyBookings).sort();
	for (const locale of ['kr', 'ru']) assert.deepEqual(Object.keys(resources[locale].common.MyBookings).sort(), keys);
	i18next.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	for (const locale of ['en', 'kr', 'ru']) {
		assert.ok(i18next.getFixedT(locale)('MyBookings.Confirm description', { program: 'Test' }).includes('Test'));
		assert.ok(!i18next.getFixedT(locale)('MyBookings.Go to page', { page: 2 }).includes('{{'));
		assert.ok(booking.formatBookingDate('2027-01-01', locale, { month: 'long', day: 'numeric' }));
	}
	pass('EN/KR/RU JSON, matching keys, i18next interpolation and Seoul dates');
}
async function reconciliationUnit() {
	let pages = [];
	const found = await helpers.findReservation('found', async (page) => {
		pages.push(page);
		return {
			list: [{ _id: page === 2 ? 'found' : 'other', reservationStatus: 'CANCELLED' }],
			metaCounter: [{ total: 101 }],
		};
	});
	assert.equal(found.reservationStatus, 'CANCELLED');
	assert.deepEqual(pages, [1, 2]);
	assert.equal(await helpers.findReservation('absent', async () => ({ list: [], metaCounter: [] })), null);
	await assert.rejects(() =>
		helpers.findReservation('absent', async () => {
			throw new Error('network');
		}),
	);
	pass('ambiguous write reconciliation scans owned pages; absence/read failure is not success');
}
function typecheck() {
	const config = ts.readConfigFile(path.join(__dirname, '../tsconfig.json'), ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(__dirname, '..'));
	const roots = ['apollo/', 'libs/', 'pages/'];
	const files = parsed.fileNames.filter(
		(file) =>
			roots.some((root) => path.relative(path.join(__dirname, '..'), file).replaceAll('\\', '/').startsWith(root)) ||
			file.endsWith('next-env.d.ts'),
	);
	const program = ts.createProgram(files, { ...parsed.options, incremental: false, noEmit: true });
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length)
		throw new Error(
			ts.formatDiagnosticsWithColorAndContext(diagnostics, {
				getCurrentDirectory: ts.sys.getCurrentDirectory,
				getNewLine: () => '\n',
				getCanonicalFileName: (file) => file,
			}),
		);
	pass('application TypeScript without skills examples; no config changes or output');
}
async function integration() {
	const backend = path.resolve(__dirname, '../../gymflow');
	const backendRequire = Module.createRequire(path.join(backend, 'package.json'));
	const originalResolve = Module._resolveFilename,
		originalTs = require.extensions['.ts'];
	Module._resolveFilename = function (name, ...args) {
		return originalResolve.call(this, name.startsWith('apps/') ? path.join(backend, name) : name, ...args);
	};
	require.extensions['.ts'] = (module, filename) =>
		module._compile(
			backendRequire('typescript').transpileModule(fs.readFileSync(filename, 'utf8'), {
				fileName: filename,
				compilerOptions: {
					module: ts.ModuleKind.CommonJS,
					target: ts.ScriptTarget.ES2021,
					esModuleInterop: true,
					experimentalDecorators: true,
					emitDecoratorMetadata: true,
				},
			}).outputText,
			filename,
		);
	backendRequire('reflect-metadata');
	const { Test } = backendRequire('@nestjs/testing');
	const { ValidationPipe } = backendRequire('@nestjs/common');
	const { MongooseModule, getConnectionToken } = backendRequire('@nestjs/mongoose');
	const { GraphQLModule } = backendRequire('@nestjs/graphql');
	const { ApolloDriver } = backendRequire('@nestjs/apollo');
	const { JwtService } = backendRequire('@nestjs/jwt');
	const { MongoMemoryReplSet } = backendRequire('mongodb-memory-server');
	const { ComponentsModule } = require(path.join(backend, 'apps/gymflow-api/src/components/components.module.ts'));
	const operations = Object.fromEntries(
		require('./check-graphql.cjs')
			.collectDocuments()
			.map((d) => [d.name, d.query]),
	);
	const log = console.log,
		previousDownload = process.env.MONGOMS_RUNTIME_DOWNLOAD;
	let mongo, app, root, client, dom;
	try {
		console.log = () => {};
		process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
		mongo = await MongoMemoryReplSet.create({
			replSet: { count: 1, storageEngine: 'wiredTiger' },
			instanceOpts: [{ ip: '127.0.0.1' }],
			binary: { version: '8.2.6', downloadDir: path.join(backend, '.tmp/mongodb-binaries') },
		});
		const module = await Test.createTestingModule({
			imports: [
				MongooseModule.forRoot(mongo.getUri()),
				ComponentsModule,
				GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true, context: ({ req }) => ({ req }) }),
			],
		})
			.overrideProvider(JwtService)
			.useValue(new JwtService({ secret: 'my-bookings-disposable', signOptions: { expiresIn: '1h' } }))
			.compile();
		app = module.createNestApplication({ logger: false });
		app.useGlobalPipes(new ValidationPipe());
		await app.listen(0, '127.0.0.1');
		const uri = (await app.getUrl()) + '/graphql',
			db = module.get(getConnectionToken());
		await Promise.all(Object.values(db.models).map((m) => m.init()));
		const members = db.model('Member'),
			programs = db.model('Program'),
			reservations = db.model('Reservation');
		const trainer = await members.create({
			memberNick: 'Trainer fixture',
			memberFullName: 'Fixture Trainer',
			memberPhone: 'mybookings100',
			memberPassword: 'fixture',
			memberType: 'TRAINER',
			memberImage: 'uploads/member/broken-avatar.jpg',
		});
		const user = await members.create({
			memberNick: 'User fixture',
			memberPhone: 'mybookings101',
			memberPassword: 'fixture',
			memberType: 'USER',
		});
		const other = await members.create({
			memberNick: 'Other fixture',
			memberPhone: 'mybookings102',
			memberPassword: 'fixture',
			memberType: 'USER',
		});
		const program = await programs.create({
			memberId: trainer._id,
			programType: 'GROUP_CLASS',
			programCategory: 'MUSCLE_GAIN',
			programLocation: 'SEOUL',
			programAddress: 'Fixture room',
			programPrice: 0,
			programDuration: 60,
			programCapacity: 20,
			programImages: ['uploads/program/broken-fixture.jpg'],
			programName: 'Disposable program',
		});
		const online = await programs.create({
			...program.toObject(),
			_id: undefined,
			programType: 'ONLINE',
			programLocation: 'ONLINE',
			programName: 'Online fixture',
			programAddress: 'Must not render',
		});
		const token = (member) => module.get(JwtService).sign({ sub: member._id.toString() });
		const tomorrow = booking.addBookingDays(booking.seoulToday(), 1),
			yesterday = booking.addBookingDays(booking.seoulToday(), -1);
		const base = {
			memberId: user._id,
			trainerId: trainer._id,
			programId: program._id,
			reservationDate: tomorrow,
			startTime: '09:00',
			endTime: '10:00',
		};
		const pending = [];
		for (let i = 0; i < 7; i++)
			pending.push(
				await reservations.create({
					...base,
					reservationDate: booking.addBookingDays(tomorrow, i),
					specialRequest: i === 0 ? '  ' : undefined,
				}),
			);
		const confirmed = await reservations.create({
			...base,
			reservationDate: booking.addBookingDays(tomorrow, 8),
			reservationStatus: 'CONFIRMED',
			specialRequest: 'Keep real request',
		});
		const history = [];
		for (const status of ['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'])
			history.push(
				await reservations.create({
					...base,
					reservationDate: status === 'CANCELLED' ? tomorrow : yesterday,
					reservationStatus: status,
				}),
			);
		const missing = await reservations.create({
			...base,
			reservationDate: yesterday,
			programId: new db.base.Types.ObjectId(),
			trainerId: new db.base.Types.ObjectId(),
			reservationStatus: 'COMPLETED',
		});
		await reservations.create({ ...base, programId: online._id, reservationStatus: 'COMPLETED' });
		const realFetch = global.fetch;
		async function gql(name, input, member = user) {
			const response = await realFetch(uri, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(member ? { Authorization: 'Bearer ' + token(member) } : {}),
				},
				body: JSON.stringify({ query: operations[name], variables: { input } }),
			});
			return response.json();
		}
		const upcoming = (await gql('GET_MY_RESERVATIONS', { page: 1, limit: 6, search: { period: 'UPCOMING' } })).data
			.getMyReservations;
		assert.equal(helpers.reservationTotal(upcoming), 8);
		assert.equal(upcoming.list.length, 6);
		assert.ok(!upcoming.list.some((r) => r._id === confirmed._id.toString()));
		const next = (
			await gql('GET_MY_RESERVATIONS', {
				page: 1,
				limit: 1,
				search: { period: 'UPCOMING', reservationStatus: 'CONFIRMED' },
			})
		).data.getMyReservations;
		assert.equal(next.list[0]._id, confirmed._id.toString());
		const past = (await gql('GET_MY_RESERVATIONS', { page: 1, limit: 100, search: { period: 'HISTORY' } })).data
			.getMyReservations;
		assert.equal(helpers.reservationTotal(past), 7);
		assert.deepEqual([...new Set(past.list.map((r) => r.reservationStatus))].sort(), [
			'CANCELLED',
			'COMPLETED',
			'CONFIRMED',
			'NO_SHOW',
			'PENDING',
		]);
		assert.ok(past.list.find((r) => r._id === history[4]._id.toString()));
		assert.equal(past.list.find((r) => r._id === missing._id.toString()).programData, null);
		assert.equal(past.list.find((r) => r._id === missing._id.toString()).trainerData, null);
		assert.ok((await gql('GET_MY_RESERVATIONS', { page: 1, limit: 6, search: {} }, trainer)).errors);
		assert.ok((await gql('CANCEL_RESERVATION', pending[0]._id.toString(), other)).errors);
		const running = await reservations.create({
			...base,
			memberId: other._id,
			reservationDate: booking.seoulToday(),
			startTime: '00:00',
			endTime: '23:59',
			reservationStatus: 'CONFIRMED',
		});
		const runningResult = (
			await gql('GET_MY_RESERVATIONS', { page: 1, limit: 6, search: { period: 'UPCOMING' } }, other)
		).data.getMyReservations;
		if (helpers.seoulNow().time < '23:59') assert.ok(runningResult.list.some((r) => r._id === running._id.toString()));
		assert.ok(!helpers.canCancelReservation({ ...running.toObject(), _id: running._id.toString() }));
		assert.ok((await gql('CANCEL_RESERVATION', running._id.toString(), other)).errors);
		pass(
			'real API ownership/roles, all History statuses, future CANCELLED, null joins, totals and global confirmed beyond page 1',
		);

		const { JSDOM } = require('jsdom');
		dom = new JSDOM('<div id="test-root"></div>', { url: 'http://localhost/mypage?category=myBookings' });
		global.window = dom.window;
		global.document = dom.window.document;
		global.navigator = dom.window.navigator;
		global.HTMLElement = dom.window.HTMLElement;
		global.DocumentFragment = dom.window.DocumentFragment;
		global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
		global.cancelAnimationFrame = clearTimeout;
		const React = require('react'),
			{ createRoot } = require('react-dom/client'),
			{ flushSync } = require('react-dom');
		const { ApolloClient, ApolloProvider, InMemoryCache, HttpLink } = require('@apollo/client');
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const texts = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/en/common.json'), 'utf8'));
		const t = (key, values = {}) => {
			const value = key.split('.').reduce((a, k) => a?.[k], texts) || key;
			return value.replace(/{{(\w+)}}/g, (_, k) => values[k] ?? '');
		};
		let fault = '',
			release,
			requests = [];
		const transport = async (url, options) => {
			const body = JSON.parse(options.body);
			requests.push(body);
			if (fault === 'read-error' && body.operationName === 'GetMyReservations') throw new Error('Read transport test');
			if (fault === 'before-write' && body.operationName === 'CancelReservation') {
				fault = '';
				throw new Error('Transport stopped before write');
			}
			const response = await realFetch(url, {
				...options,
				headers: { ...options.headers, Authorization: 'Bearer ' + token(user) },
			});
			if (fault === 'read-hold' && body.operationName === 'GetMyReservations' && body.variables.input.limit === 6)
				await new Promise((resolve) => {
					release = resolve;
				});
			if (fault === 'cancel-hold' && body.operationName === 'CancelReservation')
				await new Promise((resolve) => {
					release = resolve;
				});
			if (fault === 'lost-write' && body.operationName === 'CancelReservation') {
				fault = '';
				await response.text();
				throw new Error('Real write response lost');
			}
			if (fault === 'lost-write-read-fail' && body.operationName === 'CancelReservation') {
				fault = 'read-error';
				await response.text();
				throw new Error('Real write response and reconciliation reads interrupted');
			}
			return response;
		};
		client = new ApolloClient({ cache: new InMemoryCache(), link: new HttpLink({ uri, fetch: transport }) });
		const router = {
			isReady: true,
			query: { category: 'myBookings' },
			asPath: '/mypage?category=myBookings',
			locale: 'en',
		};
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/link': {
				__esModule: true,
				default: ({ href, children, passHref, ...props }) =>
					React.createElement(
						'a',
						{ ...props, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) },
						children,
					),
			},
			'next-i18next': { useTranslation: () => ({ t }) },
			'../../../apollo/store': store,
			'../../auth': { getJwtToken: () => '', updateUserInfo: async () => {} },
		};
		const Page = loadTs(path.join(__dirname, '../libs/components/mypage/MyBookings.tsx'), mocks).default;
		root = createRoot(document.getElementById('test-root'));
		const render = () => root.render(React.createElement(ApolloProvider, { client }, React.createElement(Page)));
		router.push = router.replace = async (href) => {
			router.query = Object.fromEntries(Object.entries(href.query).map(([key, value]) => [key, String(value)]));
			router.asPath = href.pathname + '?' + new URLSearchParams(href.query);
			render();
			return true;
		};
		const text = () => document.body.textContent;
		const until = async (fn) => {
			const start = Date.now();
			while (!fn()) {
				if (Date.now() - start > 12000) throw new Error('UI assertion timed out: ' + text());
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		};
		const click = (selector) => {
			const element = document.querySelector(selector);
			assert.ok(element, 'Missing ' + selector);
			flushSync(() => element.click());
		};
		const confirm = () => click('.MuiDialogActions-root button:last-child');
		const row = (id) => document.querySelector('[data-reservation-id="' + id + '"]');
		const cancel = (id) => {
			const button = row(id)?.querySelector('.my-bookings-card-actions button');
			assert.ok(button);
			flushSync(() => { button.focus(); button.click(); });
		};
		store.authReadyVar(false);
		store.authErrorVar('');
		store.userVar({ _id: '', memberType: '', memberStatus: '' });
		render();
		await until(() => text().includes(texts.MyBookings.initializing));
		assert.equal(requests.length, 0);
		store.authReadyVar(true);
		await until(() => text().includes(texts.MyBookings.guest));
		assert.equal(requests.length, 0);
		assert.ok(document.querySelector('a[href*="referrer="]'));
		for (const memberType of ['TRAINER', 'ADMIN']) {
			store.userVar({ _id: trainer._id.toString(), memberType, memberStatus: 'ACTIVE' });
			await until(() => text().includes(texts.MyBookings.forbidden));
			assert.equal(requests.length, 0);
		}
		pass('mounted auth initialization, guest return URL and non-USER guards issue no private queries');
		fault = 'read-hold';
		store.userVar({ _id: user._id.toString(), memberType: 'USER', memberStatus: 'ACTIVE' });
		await until(() => release);
		assert.ok(text().includes(texts.MyBookings.Loading));
		fault = '';
		release();
		release = undefined;
		await until(() => row(confirmed._id) && document.querySelectorAll('.my-bookings-card').length === 7);
		assert.equal(document.querySelectorAll('[data-reservation-id="' + confirmed._id + '"]').length, 1);
		assert.ok(text().includes('Keep real request'));
		assert.equal(document.querySelectorAll('.my-bookings-request').length, 1);
		assert.ok(document.querySelector('.my-bookings-tabs button:first-child').textContent.includes('8'));
		assert.ok(document.querySelector('.my-bookings-tabs button:last-child').textContent.includes('7'));
		const image = row(confirmed._id).querySelector('.my-bookings-media img');
		assert.ok(image.src.includes('broken-fixture.jpg'));
		flushSync(() => image.dispatchEvent(new window.Event('error')));
		await until(() => row(confirmed._id).querySelector('.my-bookings-image-fallback'));
		const avatar = row(confirmed._id).querySelector('.my-bookings-trainer img');
		assert.ok(avatar.src.endsWith('broken-avatar.jpg'));
		flushSync(() => avatar.dispatchEvent(new window.Event('error')));
		assert.ok(avatar.src.endsWith('defaultUser.svg'));
		flushSync(() => avatar.dispatchEvent(new window.Event('error')));
		assert.ok(avatar.src.endsWith('defaultUser.svg'));
		fault = 'read-hold';
		window.dispatchEvent(new window.Event('focus'));
		await until(() => release);
		assert.equal(document.querySelectorAll('.my-bookings-card').length, 7);
		assert.ok(text().includes(texts.MyBookings.Updating));
		fault = '';
		release();
		release = undefined;
		await until(() => !text().includes(texts.MyBookings.Updating));
		pass('real list/counts/global hero, optional request, real image priority and broken/missing image fallback');
		const before = requests.filter((r) => r.operationName === 'CancelReservation').length;
		cancel(pending[0]._id);
		await until(() => document.querySelector('[role="dialog"]'));
		assert.ok(document.querySelector('[aria-describedby="my-bookings-cancel-description"]'));
		const active = document.activeElement;
		assert.ok(document.querySelector('[role="dialog"]').contains(active));
		flushSync(() => active.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
		await until(() => !document.querySelector('[role="dialog"]'));
		assert.ok(document.activeElement === row(pending[0]._id).querySelector('.my-bookings-card-actions button'), 'Focus should return to the cancel trigger');
		cancel(pending[0]._id);
		await until(() => document.querySelector('[role="dialog"]'));
		fault = 'cancel-hold';
		const button = document.querySelector('.MuiDialogActions-root button:last-child');
		flushSync(() => {
			button.click();
			button.click();
		});
		await until(() => release);
		assert.equal(requests.filter((r) => r.operationName === 'CancelReservation').length, before + 1);
		assert.ok(row(pending[0]._id));
		fault = '';
		release();
		release = undefined;
		await until(() => !row(pending[0]._id) && text().includes(texts.MyBookings['Cancel success']));
		assert.equal((await reservations.findById(pending[0]._id)).reservationStatus, 'CANCELLED');
		await until(() => !document.querySelector('[role="dialog"]'));
		pass(
			'localized accessible confirmation, duplicate protection, no optimistic removal, authoritative cancel and refetch',
		);
		cancel(pending[1]._id);
		await until(() => document.querySelector('[role="dialog"]'));
		await reservations.updateOne({ _id: pending[1]._id }, { $set: { reservationStatus: 'COMPLETED' } });
		confirm();
		await until(() => text().includes(texts.MyBookings.Stale) && !row(pending[1]._id));
		await until(() => !document.querySelector('[role="dialog"]'));
		pass('real stale status rejection refreshes list without optimistic success');
		cancel(pending[2]._id);
		await until(() => document.querySelector('[role="dialog"]'));
		fault = 'lost-write';
		confirm();
		await until(() => text().includes(texts.MyBookings['Cancel success']) && !row(pending[2]._id));
		assert.equal((await reservations.findById(pending[2]._id)).reservationStatus, 'CANCELLED');
		await until(() => !document.querySelector('[role="dialog"]'));
		pass('lost real mutation response reconciles through owned reads; no automatic mutation retry');
		click('.my-bookings-tabs button:last-child');
		await until(() => router.query.period === 'HISTORY' && row(history[4]._id));
		assert.equal(document.querySelectorAll('.my-bookings-card-actions').length, 0);
		await until(() => row(missing._id));
		assert.ok(text().includes(texts.MyBookings['Missing program']));
		assert.ok(text().includes(texts.MyBookings['Missing trainer']));
		assert.ok(!text().includes('Must not render'));
		// Second History page contains ended pending/confirmed records with their original statuses.
		await router.push({ pathname: '/mypage', query: { category: 'myBookings', period: 'HISTORY', page: 2 } });
		await until(() => row(history[0]._id));
		assert.ok(text().includes(texts.MyBookings.PENDING));
		assert.ok(text().includes(texts.MyBookings.CONFIRMED));
		pass('History preserves server statuses, future CANCELLED, null summaries and ONLINE address protection');
		fault = 'read-error';
		window.dispatchEvent(new window.Event('focus'));
		await until(() => text().includes(texts.MyBookings['Load error']));
		fault = '';
		click('.my-bookings-state button');
		await until(() => row(history[0]._id) && !text().includes(texts.MyBookings['Load error']));
		pass('real transport error leaves initial loading and Retry restores current History page');
		await router.push({ pathname: '/mypage', query: { category: 'myBookings', period: 'UPCOMING', page: 2 } });
		await until(() => Number(router.query.page) === 1 && document.querySelector('.my-bookings-next'));
		assert.equal(document.querySelectorAll('[data-reservation-id="' + confirmed._id + '"]').length, 1);
		pass('empty last page corrects after cancellations using real metaCounter');
		const writeAttempts = requests.filter((r) => r.operationName === 'CancelReservation').length;
		cancel(pending[3]._id);
		await until(() => document.querySelector('[role="dialog"]'));
		fault = 'before-write';
		confirm();
		await until(() => text().includes(texts.MyBookings.Reconciled) && !document.querySelector('[role="dialog"]'));
		assert.ok(row(pending[3]._id));
		assert.equal((await reservations.findById(pending[3]._id)).reservationStatus, 'PENDING');
		assert.equal(requests.filter((r) => r.operationName === 'CancelReservation').length, writeAttempts + 1);
		pass('ambiguous pre-write failure reads actual PENDING status; no invented success or automatic cancel retry');
		cancel(pending[4]._id);
		await until(() => document.querySelector('[role="dialog"]'));
		fault = 'lost-write-read-fail'; confirm();
		await until(() => text().includes(texts.MyBookings.Unknown) && !document.querySelector('[role="dialog"]'));
		assert.ok([...document.querySelectorAll('.my-bookings-card-actions button')].every(button => button.disabled));
		assert.ok(!text().includes(texts.MyBookings['Cancel success']));
		fault = ''; click('.my-bookings-feedback button');
		await until(() => text().includes(texts.MyBookings['Cancel success']) && !row(pending[4]._id));
		pass('unresolved outcome blocks additional cancellation until read Retry verifies the real cancelled record');
		await programs.collection.updateOne({ _id: program._id }, { $unset: { programAddress: 1 } });
		window.dispatchEvent(new window.Event('focus'));
		await until(() => !text().includes('Fixture room'));
		assert.ok(text().includes('Seoul'));
		pass('missing physical address has no invented substitute');
		await reservations.deleteMany({ memberId: user._id });
		window.dispatchEvent(new window.Event('focus'));
		await until(() => text().includes(texts.MyBookings['No upcoming']));
		click('.my-bookings-tabs button:last-child');
		await until(() => text().includes(texts.MyBookings['No history']));
		assert.equal(document.querySelectorAll('.my-bookings-card').length, 0);
		pass('real empty Upcoming/History leave loading and render distinct empty states');
		store.userVar({ _id: other._id.toString(), memberType: 'USER', memberStatus: 'BLOCK' });
		await until(() => text().includes(texts.MyBookings.guest));
		assert.equal(document.querySelectorAll('.my-bookings-card').length, 0);
		pass('non-active/account change removes private content');
	} finally {
		console.log = log;
		root?.unmount();
		client?.stop();
		dom?.window.close();
		if (app) await app.close();
		if (mongo) await mongo.stop();
		Module._resolveFilename = originalResolve;
		require.extensions['.ts'] = originalTs;
		if (previousDownload === undefined) delete process.env.MONGOMS_RUNTIME_DOWNLOAD;
		else process.env.MONGOMS_RUNTIME_DOWNLOAD = previousDownload;
	}
}
(async () => {
	if (process.argv.includes('--typecheck')) typecheck();
	else {
		unit();
		await reconciliationUnit();
		if (process.argv.includes('--integration')) await integration();
	}
	output(checks + ' My Bookings checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
