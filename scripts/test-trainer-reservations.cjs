// Real GraphQL checks use only an owned disposable replica set, never application connection values.
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
const helpers = loadTs(path.join(__dirname, '../libs/trainer-reservations.ts'));
const booking = loadTs(path.join(__dirname, '../libs/booking.ts'));
async function unit() {
	for (const page of [undefined, ['2'], '0', '-1', '1.5', '1e2', '2147483648', {}])
		assert.equal(helpers.readTrainerReservationsQuery({ page }).page, 1);
	assert.deepEqual(helpers.readTrainerReservationsQuery({ period: 'HISTORY', status: 'COMPLETED', page: '2' }), {
		period: 'HISTORY',
		status: 'COMPLETED',
		page: 2,
	});
	assert.equal(helpers.readTrainerReservationsQuery({ status: 'COMPLETED' }).status, undefined);
	assert.equal(helpers.readTrainerReservationsQuery({ status: 'PENDING' }).status, 'PENDING');
	assert.equal(helpers.readTrainerReservationsQuery({ status: ['PENDING'] }).status, undefined);
	pass('safe URL parsing, incompatible filters and page bounds');
	const trainer = { _id: 'trainer', memberType: 'TRAINER', memberStatus: 'ACTIVE' };
	assert.equal(helpers.trainerReservationsAccess(false, '', trainer), 'initializing');
	assert.equal(helpers.trainerReservationsAccess(true, 'error', trainer), 'error');
	assert.equal(helpers.trainerReservationsAccess(true, '', { ...trainer, _id: '' }), 'guest');
	assert.equal(helpers.trainerReservationsAccess(true, '', { ...trainer, memberStatus: 'BLOCK' }), 'guest');
	for (const memberType of ['USER', 'ADMIN'])
		assert.equal(helpers.trainerReservationsAccess(true, '', { ...trainer, memberType }), 'forbidden');
	assert.equal(helpers.trainerReservationsAccess(true, '', trainer), 'ready');
	pass('initializing, guest, USER, ADMIN and active trainer access');
	const statuses = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'];
	for (const reservationStatus of statuses)
		for (const [clock, expected] of [
			[
				'00:00',
				reservationStatus === 'PENDING'
					? ['CONFIRMED', 'CANCELLED']
					: reservationStatus === 'CONFIRMED'
					? ['CANCELLED']
					: [],
			],
			['00:01', []],
			['00:30', []],
			['01:00', reservationStatus === 'CONFIRMED' ? ['COMPLETED', 'NO_SHOW'] : []],
			['01:01', reservationStatus === 'CONFIRMED' ? ['COMPLETED', 'NO_SHOW'] : []],
		]) {
			assert.deepEqual(
				helpers.trainerReservationActions(
					{ reservationStatus, reservationDate: '2027-01-01', startTime: '00:01', endTime: '01:00' },
					new Date('2027-01-01T' + clock + ':00+09:00'),
				),
				expected,
			);
		}
	for (const change of [{ reservationDate: '2027-02-29' }, { startTime: '24:00' }, { endTime: '00:00' }])
		assert.deepEqual(
			helpers.trainerReservationActions({
				reservationStatus: 'PENDING',
				reservationDate: '2027-01-01',
				startTime: '00:01',
				endTime: '01:00',
				...change,
			}),
			[],
		);
	pass('all status/time action boundaries, Seoul year rollover and invalid stored intervals');
	const pages = [];
	assert.equal(
		(
			await helpers.findTrainerReservation('target', async (page) => {
				pages.push(page);
				return {
					list: [{ _id: page === 2 ? 'target' : 'other', reservationStatus: 'CONFIRMED' }],
					metaCounter: [{ total: 101 }],
				};
			})
		).reservationStatus,
		'CONFIRMED',
	);
	assert.deepEqual(pages, [1, 2]);
	assert.equal(await helpers.findTrainerReservation('missing', async () => ({ list: [], metaCounter: [] })), null);
	await assert.rejects(() =>
		helpers.findTrainerReservation('missing', async () => {
			throw new Error('offline');
		}),
	);
	pass('owned pagination reconciliation; absence and read failure never prove write success');
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{ common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')) },
		]),
	);
	i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	for (const locale of ['en', 'kr', 'ru']) {
		assert.deepEqual(
			Object.keys(resources[locale].common['Trainer reservations']).sort(),
			Object.keys(resources.en.common['Trainer reservations']).sort(),
		);
		for (const [key, values] of [
			['Range', { start: 1, end: 6, total: 9 }],
			['Showing', { count: 9 }],
			['Confirm description', { action: 'Test', client: 'Client', date: '2027-01-01', time: '10:00' }],
		])
			assert.ok(
				!i18n
					.getFixedT(locale)('Trainer reservations.' + key, values)
					.includes('{{'),
			);
	}
	pass('EN/KR/RU JSON, matching keys and real i18next interpolation');
}

async function createFixture(options = {}) {
	const backend = path.resolve(__dirname, '../../gymflow');
	const backRequire = Module.createRequire(path.join(backend, 'package.json'));
	const originalResolve = Module._resolveFilename,
		originalTs = require.extensions['.ts'];
	Module._resolveFilename = function (name, ...args) {
		return originalResolve.call(this, name.startsWith('apps/') ? path.join(backend, name) : name, ...args);
	};
	require.extensions['.ts'] = (module, filename) =>
		module._compile(
			backRequire('typescript').transpileModule(fs.readFileSync(filename, 'utf8'), {
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
	backRequire('reflect-metadata');
	const { Test } = backRequire('@nestjs/testing');
	const { ValidationPipe } = backRequire('@nestjs/common');
	const { MongooseModule, getConnectionToken } = backRequire('@nestjs/mongoose');
	const { GraphQLModule } = backRequire('@nestjs/graphql');
	const { ApolloDriver } = backRequire('@nestjs/apollo');
	const { JwtService } = backRequire('@nestjs/jwt');
	const { MongoMemoryReplSet } = backRequire('mongodb-memory-server');
	const { ComponentsModule } = require(path.join(backend, 'apps/gymflow-api/src/components/components.module.ts'));
	const previousDownload = process.env.MONGOMS_RUNTIME_DOWNLOAD;
	let mongo, app;
	const stop = async () => {
		if (app) await app.close();
		if (mongo) await mongo.stop();
		Module._resolveFilename = originalResolve;
		require.extensions['.ts'] = originalTs;
		if (previousDownload === undefined) delete process.env.MONGOMS_RUNTIME_DOWNLOAD;
		else process.env.MONGOMS_RUNTIME_DOWNLOAD = previousDownload;
	};
	try {
		process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
		mongo = await MongoMemoryReplSet.create({
			replSet: { count: 1, storageEngine: 'wiredTiger' },
			instanceOpts: [{ ip: '127.0.0.1' }],
			binary: { version: '8.2.6', downloadDir: path.join(backend, '.tmp/mongodb-binaries') },
		});
		const mongoUri = mongo.getUri('trainer_reservations_isolated_test');
		const parsed = new URL(mongoUri);
		assert.equal(parsed.hostname, '127.0.0.1');
		assert.equal(parsed.pathname, '/trainer_reservations_isolated_test');
		const module = await Test.createTestingModule({
			imports: [
				MongooseModule.forRoot(mongoUri),
				ComponentsModule,
				GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true, context: ({ req }) => ({ req }) }),
			],
		})
			.overrideProvider(JwtService)
			.useValue(
				new JwtService({
					secret: require('node:crypto').randomBytes(32).toString('hex'),
					signOptions: { expiresIn: '1h' },
				}),
			)
			.compile();
		app = module.createNestApplication({ logger: false });
		app.useGlobalPipes(new ValidationPipe());
		if (options.origin) app.enableCors({ origin: options.origin });
		await app.listen(options.port ?? 0, '127.0.0.1');
		const uri = (await app.getUrl()) + '/graphql',
			db = module.get(getConnectionToken());
		await Promise.all(Object.values(db.models).map((model) => model.init()));
		const members = db.model('Member'),
			programs = db.model('Program'),
			reservations = db.model('Reservation'),
			schedules = db.model('TrainerSchedule');
		const password = require('node:crypto').randomBytes(9).toString('base64url');
		const memberPassword = await backRequire('bcryptjs').hash(password, 8);
		const trainer = await members.create({
			memberNick: 'trainer-test',
			memberFullName: 'Fixture Trainer',
			memberPassword,
			memberPhone: 'fixture-trainer',
			memberType: 'TRAINER',
		});
		const otherTrainer = await members.create({
			memberNick: 'other-test',
			memberPassword,
			memberPhone: 'fixture-other-trainer',
			memberType: 'TRAINER',
		});
		const user = await members.create({
			memberNick: 'client-test',
			memberFullName: 'Fixture Client',
			memberPassword,
			memberPhone: 'fixture-client',
			memberType: 'USER',
			memberImage: 'missing-test-image.jpg',
		});
		const admin = await members.create({
			memberNick: 'admin-test',
			memberPassword,
			memberPhone: 'fixture-admin',
			memberType: 'ADMIN',
		});
		const program = await programs.create({
			memberId: trainer._id,
			programType: 'GROUP_CLASS',
			programCategory: 'MUSCLE_GAIN',
			programLocation: 'SEOUL',
			programAddress: 'Fixture training room, Seoul',
			programName: 'Fixture strength and mobility',
			programDuration: 60,
			programCapacity: 20,
			programPrice: 0,
			programImages: ['missing-test-program.jpg'],
		});
		await schedules.create(
			['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((dayOfWeek) => ({
				memberId: trainer._id,
				dayOfWeek,
				isAvailable: true,
				startTime: '09:00',
				endTime: '18:00',
			})),
		);
		const operations = Object.fromEntries(
			require('./check-graphql.cjs')
				.collectDocuments()
				.map((d) => [d.name, d.query]),
		);
		const token = (member) => module.get(JwtService).sign({ sub: String(member._id) }, { expiresIn: '1h' });
		const fetch = global.fetch;
		const gql = async (name, input, member = trainer) =>
			(
				await fetch(uri, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(member ? { Authorization: 'Bearer ' + token(member) } : {}),
					},
					body: JSON.stringify({ query: operations[name], variables: { input } }),
				})
			).json();
		const tomorrow = booking.addBookingDays(booking.seoulToday(), 1),
			yesterday = booking.addBookingDays(booking.seoulToday(), -1);
		const pending = [];
		for (let i = 0; i < 8; i++) {
			const response = await gql(
				'CREATE_RESERVATION',
				{
					programId: String(program._id),
					reservationDate: booking.addBookingDays(tomorrow, i),
					startTime: '09:00',
					...(i === 0 ? { specialRequest: 'Please explain the warm-up and setup.' } : {}),
				},
				user,
			);
			assert.ok(!response.errors, JSON.stringify(response.errors));
			pending.push(response.data.createReservation);
		}
		const confirmed = pending.pop();
		assert.ok(
			!(await gql('UPDATE_TRAINER_RESERVATION', { _id: confirmed._id, reservationStatus: 'CONFIRMED' })).errors,
		);
		const base = {
			memberId: user._id,
			trainerId: trainer._id,
			programId: program._id,
			reservationDate: yesterday,
			startTime: '09:00',
			endTime: '10:00',
		};
		// Elapsed/terminal and orphan fixtures cannot be produced by today's create API; seed only this owned database.
		const history = [];
		for (const reservationStatus of ['CONFIRMED', 'CONFIRMED', 'PENDING', 'CANCELLED', 'COMPLETED', 'NO_SHOW'])
			history.push(await reservations.create({ ...base, reservationStatus }));
		const missing = await reservations.create({
			...base,
			programId: new db.base.Types.ObjectId(),
			memberId: new db.base.Types.ObjectId(),
			reservationStatus: 'CONFIRMED',
		});
		await reservations.create({ ...base, trainerId: otherTrainer._id, reservationDate: tomorrow });
		return {
			app,
			stop,
			uri,
			db,
			members,
			programs,
			reservations,
			trainer,
			otherTrainer,
			user,
			admin,
			program,
			pending,
			confirmed,
			history,
			missing,
			password,
			token,
			gql,
		};
	} catch (error) {
		await stop();
		throw error;
	}
}

async function integration() {
	const previousLog = console.log;
	let fixture, root, client, dom;
	try {
		console.log = () => {};
		fixture = await createFixture();
		const { gql, trainer, otherTrainer, user, admin, pending, confirmed, history, missing, reservations, token, uri } =
			fixture;
		const input = (period = 'UPCOMING', reservationStatus, page = 1, limit = 6) => ({
			page,
			limit,
			search: { period, ...(reservationStatus ? { reservationStatus } : {}) },
		});
		const login = await gql('LOGIN', { memberNick: trainer.memberNick, memberPassword: fixture.password }, null);
		assert.ok(!login.errors, JSON.stringify(login.errors));
		const loginToken = login.data.login.accessToken;
		assert.ok(JSON.parse(Buffer.from(loginToken.split('.')[1], 'base64url')).exp > Date.now() / 1000);
		const queryDocument = require('./check-graphql.cjs')
			.collectDocuments()
			.find((document) => document.name === 'GET_TRAINER_RESERVATIONS').query;
		const authenticated = await (
			await fetch(uri, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + loginToken },
				body: JSON.stringify({ query: queryDocument, variables: { input: input() } }),
			})
		).json();
		assert.equal(authenticated.data.getTrainerReservations.metaCounter[0].total, 8);
		pass('real login returns a restorable expiring JWT and authenticates the exact frontend trainer query');
		const upcoming = (await gql('GET_TRAINER_RESERVATIONS', input())).data.getTrainerReservations;
		assert.equal(upcoming.metaCounter[0].total, 8);
		assert.equal(upcoming.list.length, 6);
		assert.equal(upcoming.list[0]._id, pending[0]._id);
		assert.ok(upcoming.list.every((row) => row.trainerId === String(trainer._id)));
		assert.equal(
			(await gql('GET_TRAINER_RESERVATIONS', input('UPCOMING', 'PENDING'))).data.getTrainerReservations.metaCounter[0]
				.total,
			7,
		);
		assert.equal(
			(await gql('GET_TRAINER_RESERVATIONS', input('UPCOMING', 'CONFIRMED'))).data.getTrainerReservations.metaCounter[0]
				.total,
			1,
		);
		const past = (await gql('GET_TRAINER_RESERVATIONS', input('HISTORY', undefined, 1, 100))).data
			.getTrainerReservations;
		assert.equal(past.metaCounter[0].total, 7);
		assert.equal(past.list.find((row) => row._id === String(missing._id)).programData, null);
		assert.equal(past.list.find((row) => row._id === String(missing._id)).memberData, null);
		assert.deepEqual(Object.keys(upcoming.list[0].memberData).sort(), [
			'_id',
			'memberFullName',
			'memberImage',
			'memberNick',
		]);
		for (const viewer of [null, user, admin]) {
			assert.ok((await gql('GET_TRAINER_RESERVATIONS', input(), viewer)).errors);
			assert.ok(
				(await gql('UPDATE_TRAINER_RESERVATION', { _id: pending[0]._id, reservationStatus: 'CONFIRMED' }, viewer))
					.errors,
			);
		}
		assert.ok(
			(await gql('UPDATE_TRAINER_RESERVATION', { _id: pending[0]._id, reservationStatus: 'CONFIRMED' }, otherTrainer))
				.errors,
		);
		pass('actual API ownership/roles, server periods/status filters, pagination/counts and safe/null summaries');
		const { JSDOM } = require('jsdom');
		dom = new JSDOM('<div id="test-root"></div>', { url: 'http://localhost/mypage?category=trainerReservations' });
		Object.assign(global, {
			window: dom.window,
			document: dom.window.document,
			Image: dom.window.Image,
			HTMLElement: dom.window.HTMLElement,
			DocumentFragment: dom.window.DocumentFragment,
			requestAnimationFrame: (fn) => setTimeout(fn, 0),
			cancelAnimationFrame: clearTimeout,
		});
		Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
		const React = require('react'),
			{ createRoot } = require('react-dom/client'),
			{ flushSync } = require('react-dom');
		const { ApolloClient, ApolloProvider, InMemoryCache, HttpLink } = require('@apollo/client');
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const texts = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/en/common.json'), 'utf8'));
		const t = (key, values = {}) =>
			(key.split('.').reduce((value, part) => value?.[part], texts) || key).replace(
				/{{(\w+)}}/g,
				(_, key) => values[key] ?? '',
			);
		const realFetch = global.fetch,
			requests = [];
		let fault = '',
			release;
		const transport = async (url, options) => {
			const body = JSON.parse(options.body);
			requests.push(body);
			if (fault === 'read-error' && body.operationName === 'GetTrainerReservations')
				throw new Error('Read unavailable');
			if (fault === 'before-write' && body.operationName === 'UpdateTrainerReservation') {
				fault = '';
				throw new Error('Write not sent');
			}
			const response = await realFetch(url, {
				...options,
				headers: { ...options.headers, Authorization: 'Bearer ' + token(trainer) },
			});
			if (
				(fault === 'read-hold' && body.operationName === 'GetTrainerReservations') ||
				(fault === 'write-hold' && body.operationName === 'UpdateTrainerReservation')
			)
				await new Promise((resolve) => {
					release = resolve;
				});
			if (fault === 'lost-write' && body.operationName === 'UpdateTrainerReservation') {
				fault = '';
				await response.text();
				throw new Error('Response lost');
			}
			if (fault === 'lost-write-read-fail' && body.operationName === 'UpdateTrainerReservation') {
				fault = 'read-error';
				await response.text();
				throw new Error('Response lost');
			}
			return response;
		};
		client = new ApolloClient({ cache: new InMemoryCache(), link: new HttpLink({ uri, fetch: transport }) });
		const router = {
			isReady: true,
			query: { category: 'trainerReservations' },
			locale: 'en',
			asPath: '/mypage?category=trainerReservations',
		};
		const link = ({ href, children, passHref, ...props }) =>
			React.createElement(
				'a',
				{ ...props, href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query) },
				children,
			);
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/link': { __esModule: true, default: link },
			'next/image': { __esModule: true, default: (props) => React.createElement('img', props) },
			'next-i18next': { useTranslation: () => ({ t }) },
			'../../../apollo/store': store,
			'../../auth': { getJwtToken: () => '', updateUserInfo: async () => {} },
		};
		const Page = loadTs(path.join(__dirname, '../libs/components/mypage/TrainerReservations.tsx'), mocks).default;
		root = createRoot(document.getElementById('test-root'));
		const render = () => root.render(React.createElement(ApolloProvider, { client }, React.createElement(Page)));
		router.push = router.replace = async (href) => {
			router.query = Object.fromEntries(
				Object.entries(href.query)
					.filter(([, value]) => value != null)
					.map(([key, value]) => [key, String(value)]),
			);
			router.asPath = href.pathname + '?' + new URLSearchParams(router.query);
			render();
			return true;
		};
		const text = () => document.body.textContent;
		const until = async (fn) => {
			const start = Date.now();
			while (!fn()) {
				if (Date.now() - start > 12000) throw new Error('UI timeout: ' + text());
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		};
		const row = (id) => document.querySelector(`[data-reservation-id="${id}"]`);
		const click = (selector) => {
			const button = document.querySelector(selector);
			assert.ok(button, selector);
			flushSync(() => button.click());
		};
		const act = (id, target) => click(`[data-reservation-id="${id}"] [data-action="${target}"]`);
		const confirmDialog = () => click('.MuiDialogActions-root button:last-child');
		store.authReadyVar(false);
		store.authErrorVar('');
		store.userVar({ _id: '', memberType: '', memberStatus: '' });
		render();
		await until(() => text().includes(texts.MyBookings.initializing));
		assert.equal(requests.length, 0);
		store.authReadyVar(true);
		await until(() => text().includes(texts['Trainer reservations'].guest));
		assert.equal(requests.length, 0);
		for (const memberType of ['USER', 'ADMIN']) {
			store.userVar({ _id: String(user._id), memberType, memberStatus: 'ACTIVE' });
			await until(() => text().includes(texts['Trainer reservations'].forbidden));
			assert.equal(requests.length, 0);
		}
		pass('mounted initializing/guest/USER/ADMIN states issue no trainer queries');
		fault = 'read-hold';
		store.userVar({ _id: String(trainer._id), memberType: 'TRAINER', memberStatus: 'ACTIVE' });
		await until(() => release);
		assert.ok(text().includes(texts['Trainer reservations'].Loading));
		fault = '';
		release();
		release = undefined;
		await until(() => row(pending[0]._id));
		assert.equal(document.querySelectorAll('.trainer-reservation').length, 6);
		assert.equal(document.querySelectorAll('.trainer-reservation-request').length, 1);
		assert.ok(text().includes('Please explain the warm-up'));
		assert.ok(
			document.querySelector('.schedule-desktop-navigation a[aria-current="page"][href*="trainerReservations"]'),
		);
		assert.ok(
			!requests.some((request) => request.variables.input.trainerId || request.variables.input.search?.trainerId),
		);
		pass('real list, server total, optional Special Request, workspace active destination and no ownership input');
		await router.push({ pathname: '/mypage', query: { category: 'trainerReservations', period: 'UPCOMING', page: 2 } });
		await until(() => row(confirmed._id) && document.querySelectorAll('.trainer-reservation').length === 2);
		assert.ok(!row(pending[0]._id));
		assert.ok(!row(confirmed._id).querySelector('[data-action="COMPLETED"]'));
		assert.ok(!row(confirmed._id).querySelector('[data-action="NO_SHOW"]'));
		await router.push({ pathname: '/mypage', query: { category: 'trainerReservations', period: 'UPCOMING', page: 1 } });
		await until(() => row(pending[0]._id));
		pass('real second-page rows replace page one and future Confirmed has no outcome actions');
		fault = 'write-hold';
		const before = requests.filter((request) => request.operationName === 'UpdateTrainerReservation').length;
		const button = row(pending[0]._id).querySelector('[data-action="CONFIRMED"]');
		flushSync(() => {
			button.click();
			button.click();
		});
		await until(() => release);
		assert.equal(requests.filter((request) => request.operationName === 'UpdateTrainerReservation').length, before + 1);
		assert.ok(!document.querySelector('[role="dialog"]'));
		assert.ok(row(pending[0]._id).classList.contains('status-pending'));
		assert.ok([...document.querySelectorAll('[data-action]')].every((button) => button.disabled));
		fault = '';
		release();
		release = undefined;
		await until(
			() =>
				row(pending[0]._id)?.classList.contains('status-confirmed') &&
				text().includes(texts['Trainer reservations'].Success),
		);
		assert.equal((await reservations.findById(pending[0]._id)).reservationStatus, 'CONFIRMED');
		pass(
			'direct Confirm, synchronous duplicate lock, conflicting actions disabled, no optimistic status, actual persisted result',
		);
		act(pending[1]._id, 'CANCELLED');
		await until(() => document.querySelector('[role="dialog"]'));
		click('.MuiDialogActions-root button:first-child');
		await until(() => !document.querySelector('[role="dialog"]'));
		assert.ok(row(pending[1]._id));
		act(pending[1]._id, 'CANCELLED');
		await until(() => document.querySelector('[role="dialog"]'));
		confirmDialog();
		await until(() => !row(pending[1]._id) && !document.querySelector('[role="dialog"]'));
		assert.equal((await reservations.findById(pending[1]._id)).reservationStatus, 'CANCELLED');
		act(pending[0]._id, 'CANCELLED');
		await until(() => document.querySelector('[role="dialog"]'));
		confirmDialog();
		await until(() => !row(pending[0]._id) && !document.querySelector('[role="dialog"]'));
		pass('cancel confirmation/back, real Pending and Confirmed cancellations and server-backed removal');
		fault = 'read-hold';
		click('.trainer-reservations-filters .filter-confirmed');
		await until(() => release);
		assert.equal(document.querySelectorAll('.trainer-reservation').length, 0);
		assert.equal(router.query.page, '1');
		fault = '';
		release();
		release = undefined;
		await until(() => row(confirmed._id));
		assert.equal(document.querySelectorAll('.trainer-reservation').length, 1);
		click('.trainer-reservations-filters .filter-pending');
		await until(() => row(pending[2]._id));
		assert.equal(router.query.period, 'UPCOMING');
		assert.ok(
			[...document.querySelectorAll('.trainer-reservation')].every((row) => row.classList.contains('status-pending')),
		);
		pass('server Confirmed/Pending filtering, page reset, retained period and no previous-filter rows while loading');
		await router.push({ pathname: '/mypage', query: { category: 'trainerReservations', period: 'HISTORY' } });
		await until(() => row(missing._id));
		assert.ok(text().includes(texts['Trainer reservations']['Missing client']));
		assert.ok(text().includes(texts.MyBookings['Missing program']));
		assert.ok(row(missing._id).querySelector('[data-action="COMPLETED"]'));
		for (const terminal of history.slice(3))
			if (row(terminal._id)) assert.equal(row(terminal._id).querySelectorAll('[data-action]').length, 0);
		act(missing._id, 'COMPLETED');
		await until(() => row(missing._id)?.classList.contains('status-completed'));
		await router.push({
			pathname: '/mypage',
			query: { category: 'trainerReservations', period: 'HISTORY', status: 'CONFIRMED' },
		});
		await until(() => row(history[0]._id));
		act(history[0]._id, 'COMPLETED');
		await until(() => !row(history[0]._id));
		act(history[1]._id, 'NO_SHOW');
		await until(() => document.querySelector('[role="dialog"]'));
		confirmDialog();
		await until(() => !row(history[1]._id) && !document.querySelector('[role="dialog"]'));
		assert.equal((await reservations.findById(history[0]._id)).reservationStatus, 'COMPLETED');
		assert.equal((await reservations.findById(history[1]._id)).reservationStatus, 'NO_SHOW');
		pass('History elapsed Confirmed Complete/No Show, terminal gating, nullable summaries and orphan lifecycle');
		await router.push({ pathname: '/mypage', query: { category: 'trainerReservations', period: 'UPCOMING' } });
		await until(() => row(pending[2]._id));
		await reservations.updateOne({ _id: pending[2]._id }, { $set: { reservationStatus: 'CANCELLED' } });
		act(pending[2]._id, 'CONFIRMED');
		await until(() => !row(pending[2]._id) && text().includes(texts['Trainer reservations'].Stale));
		pass('actual stale backend conflict refreshes server truth without false success');
		fault = 'before-write';
		act(pending[3]._id, 'CONFIRMED');
		await until(
			() =>
				text().includes(texts['Trainer reservations'].Reconciled) &&
				!row(pending[3]._id).querySelector('[data-action="CONFIRMED"]').disabled,
		);
		assert.equal((await reservations.findById(pending[3]._id)).reservationStatus, 'PENDING');
		fault = 'lost-write';
		act(pending[3]._id, 'CONFIRMED');
		await until(
			() =>
				row(pending[3]._id)?.classList.contains('status-confirmed') &&
				text().includes(texts['Trainer reservations'].Success) &&
				!row(pending[4]._id).querySelector('[data-action="CONFIRMED"]').disabled,
		);
		pass(
			'pre-write failure and lost real write response reconcile through authenticated owned reads, no automatic mutation retry',
		);
		fault = 'lost-write-read-fail';
		act(pending[4]._id, 'CONFIRMED');
		await until(() => text().includes(texts['Trainer reservations'].Unknown));
		assert.ok([...document.querySelectorAll('[data-action]')].every((button) => button.disabled));
		fault = '';
		click('.trainer-reservations-feedback button');
		await until(
			() =>
				row(pending[4]._id)?.classList.contains('status-confirmed') &&
				text().includes(texts['Trainer reservations'].Success),
		);
		pass('unresolved result blocks further writes until explicit status reconciliation succeeds');
		fault = 'read-error';
		window.dispatchEvent(new window.Event('focus'));
		await until(() => text().includes(texts['Trainer reservations']['Load error']));
		fault = '';
		click('.trainer-reservations-state button');
		await until(() => row(pending[5]._id));
		pass('read failure, restrained Retry and current-query recovery');
		await router.push({ pathname: '/mypage', query: { category: 'trainerReservations', period: 'UPCOMING', page: 2 } });
		await until(() => router.query.page === '1' && row(pending[5]._id));
		pass('invalid last page corrected using refreshed real metaCounter');
		await reservations.deleteMany({ trainerId: trainer._id });
		window.dispatchEvent(new window.Event('focus'));
		await until(() => text().includes(texts['Trainer reservations']['No upcoming']));
		click('.trainer-reservations-filters .filter-pending');
		await until(() => text().includes(texts['Trainer reservations']['No pending']));
		click('.trainer-reservations-filters .filter-confirmed');
		await until(() => text().includes(texts['Trainer reservations']['No confirmed']));
		click('.trainer-reservations-period button:last-child');
		await until(() => text().includes(texts['Trainer reservations']['No history']));
		store.userVar({ _id: String(trainer._id), memberType: 'TRAINER', memberStatus: 'BLOCK' });
		await until(() => text().includes(texts['Trainer reservations'].guest));
		assert.equal(document.querySelectorAll('.trainer-reservation').length, 0);
		pass('truthful period empty states and inactive/account change remove private rows');
	} finally {
		console.log = previousLog;
		root?.unmount();
		client?.stop();
		dom?.window.close();
		if (fixture) await fixture.stop();
	}
}

module.exports = { createFixture };
if (require.main === module)
	(async () => {
		await unit();
		if (process.argv.includes('--integration')) await integration();
		output(checks + ' Trainer Reservations checks passed.');
	})().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
