// Uses the existing owned disposable Nest/Mongo fixture; never application database configuration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const output = console.log;
let checks = 0;
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
		if (name.endsWith('.css')) return {};
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
const helpers = loadTs(path.join(__dirname, '../libs/trainer-dashboard.ts'));
async function unit() {
	const now = new Date('2027-01-01T00:30:00+09:00');
	const session = {
		reservationStatus: 'CONFIRMED',
		reservationDate: '2027-01-01',
		startTime: '00:31',
		endTime: '01:30',
	};
	assert.equal(helpers.isFutureTrainerSession(session, now), true);
	for (const change of [
		{ startTime: '00:30' },
		{ startTime: '00:01' },
		{ reservationDate: '2026-12-31' },
		{ reservationDate: '2027-02-29' },
		{ startTime: '24:00' },
		{ reservationStatus: 'PENDING' },
	])
		assert.equal(helpers.isFutureTrainerSession({ ...session, ...change }, now), false);
	assert.equal(
		helpers.isFutureTrainerSession({ ...session, startTime: '00:01' }, new Date('2026-12-31T14:59:00Z')),
		true,
	);
	pass('strictly future confirmed start, ongoing exclusion, Seoul rollover and invalid stored times');
	const pages = [];
	const next = await helpers.findNextTrainerSession(async (page) => {
		pages.push(page);
		return {
			list: page === 1 ? Array.from({ length: 100 }, () => ({ ...session, startTime: '00:01' })) : [session],
			metaCounter: [{ total: 101 }],
		};
	}, now);
	assert.equal(next, session);
	assert.deepEqual(pages, [1, 2]);
	assert.equal(await helpers.findNextTrainerSession(async () => ({ list: [], metaCounter: [] }), now), null);
	await assert.rejects(() =>
		helpers.findNextTrainerSession(async () => {
			throw new Error('offline');
		}, now),
	);
	let active = true;
	await assert.rejects(() =>
		helpers.findNextTrainerSession(
			async () => {
				active = false;
				return { list: [session], metaCounter: [{ total: 1 }] };
			},
			now,
			() => active,
		),
	);
	pass('ordered paging beyond 100 ongoing rows, real empty result, failed read and account-change cancellation');
	const week = helpers.dashboardWeek([
		{ dayOfWeek: 'MON', isAvailable: true, startTime: '10:15', endTime: '13:45' },
		{ dayOfWeek: 'TUE', isAvailable: false, startTime: '09:00', endTime: '18:00' },
	]);
	assert.deepEqual(
		week.map((day) => day.dayOfWeek),
		['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
	);
	assert.deepEqual(week[0], { dayOfWeek: 'MON', state: 'Available', startTime: '10:15', endTime: '13:45' });
	assert.deepEqual(week[1], { dayOfWeek: 'TUE', state: 'Off', startTime: null, endTime: null });
	assert.ok(
		week.slice(2).every((day) => day.state === 'Unconfigured' && day.startTime === null && day.endTime === null),
	);
	assert.ok(helpers.dashboardWeek([]).every((day) => day.state === 'Unconfigured'));
	pass('seven individual persisted weekdays, disabled intervals hidden, missing rows never invent defaults');
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{
				common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')),
			},
		]),
	);
	await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	for (const locale of ['en', 'kr', 'ru']) {
		assert.deepEqual(
			Object.keys(resources[locale].common['Trainer dashboard']).sort(),
			Object.keys(resources.en.common['Trainer dashboard']).sort(),
		);
		for (const key of Object.keys(resources.en.common['Trainer dashboard']))
			assert.ok(
				i18n.getFixedT(locale)('Trainer dashboard.' + key) &&
					i18n.getFixedT(locale)('Trainer dashboard.' + key) !== 'Trainer dashboard.' + key,
			);
		assert.ok(i18n.getFixedT(locale)('Trainer schedule.Dashboard') !== 'Trainer schedule.Dashboard');
	}
	pass('EN/KR/RU matching Dashboard keys and actual i18next resolution');
}
async function integration() {
	const previousLog = console.log;
	let fixture, root, client, dom;
	try {
		console.log = () => {};
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const { trainer, user, pending, confirmed, reservations, programs, db, token, uri } = fixture;
		const schedules = db.model('TrainerSchedule');
		await schedules.updateOne({ memberId: trainer._id, dayOfWeek: 'TUE' }, { isAvailable: false });
		await schedules.deleteOne({ memberId: trainer._id, dayOfWeek: 'SUN' });
		const { JSDOM } = require('jsdom');
		dom = new JSDOM('<div id="test-root"></div>', { url: 'http://localhost/mypage?category=trainerDashboard' });
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
		const requests = [],
			failures = new Set();
		let holdWrite = false,
			release,
			loseWrite = false;
		const transport = async (url, options) => {
			const body = JSON.parse(options.body);
			requests.push(body);
			if (failures.has(body.operationName)) throw new Error('Section unavailable');
			const response = await fetch(url, {
				...options,
				headers: { ...options.headers, Authorization: 'Bearer ' + token(trainer) },
			});
			if (holdWrite && body.operationName === 'UpdateTrainerReservation')
				await new Promise((resolve) => {
					release = resolve;
				});
			if (loseWrite && body.operationName === 'UpdateTrainerReservation') {
				loseWrite = false;
				await response.text();
				throw new Error('Response lost');
			}
			return response;
		};
		client = new ApolloClient({ cache: new InMemoryCache(), link: new HttpLink({ uri, fetch: transport }) });
		const router = {
			isReady: true,
			query: { category: 'trainerDashboard' },
			locale: 'en',
			asPath: '/mypage?category=trainerDashboard',
		};
		const link = ({ href, children, passHref, ...props }) =>
			React.createElement(
				'a',
				{
					...props,
					href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
				},
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
		const Page = loadTs(path.join(__dirname, '../libs/components/mypage/TrainerDashboard.tsx'), mocks).default;
		root = createRoot(document.getElementById('test-root'));
		const render = () => root.render(React.createElement(ApolloProvider, { client }, React.createElement(Page)));
		const text = () => document.body.textContent;
		const until = async (fn) => {
			const started = Date.now();
			while (!fn()) {
				if (Date.now() - started > 12000) throw new Error('UI timeout: ' + text());
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		};
		const row = (id) => document.querySelector(`.dashboard-pending-card[data-reservation-id="${id}"]`);
		const click = (selector) => {
			const button = document.querySelector(selector);
			assert.ok(button, selector);
			flushSync(() => button.click());
		};
		const writeCount = () => requests.filter((request) => request.operationName === 'UpdateTrainerReservation').length;
		const count = () => document.querySelector('.dashboard-count')?.textContent;
		store.authReadyVar(false);
		store.authErrorVar('');
		store.userVar({ _id: '', memberType: '', memberStatus: '' });
		render();
		await until(() => text().includes(texts.MyBookings.initializing));
		assert.equal(requests.length, 0);
		store.authReadyVar(true);
		await until(() => text().includes(texts['Trainer reservations'].guest));
		for (const memberType of ['USER', 'ADMIN']) {
			store.userVar({ _id: String(user._id), memberType, memberStatus: 'ACTIVE' });
			await until(() => text().includes(texts['Trainer reservations'].forbidden));
		}
		assert.equal(requests.length, 0);
		pass('mounted initializing, guest, USER and ADMIN cannot issue Dashboard queries');
		store.userVar({
			_id: String(trainer._id),
			memberType: 'TRAINER',
			memberStatus: 'ACTIVE',
			memberFullName: trainer.memberFullName,
			memberNick: trainer.memberNick,
		});
		await until(
			() =>
				row(pending[0]._id) &&
				document.querySelector('.dashboard-next-card') &&
				document.querySelectorAll('.dashboard-weekday').length === 7,
		);
		assert.equal(document.querySelector('.dashboard-next-card').dataset.reservationId, confirmed._id);
		assert.equal(count(), '7');
		assert.equal(document.querySelectorAll('.dashboard-pending-card').length, 3);
		assert.ok(text().includes('Please explain the warm-up'));
		assert.equal(document.querySelectorAll('.dashboard-request').length, 1);
		assert.ok(text().includes(fixture.program.programName));
		assert.ok(text().includes(fixture.program.programAddress));
		assert.equal(document.querySelectorAll('.dashboard-weekday.is-off').length, 1);
		assert.equal(document.querySelectorAll('.dashboard-weekday.is-unconfigured').length, 1);
		assert.ok(!document.querySelector('.dashboard-weekday.is-off').textContent.includes('09:00'));
		assert.ok(document.querySelector('.schedule-mobile-navigation a[aria-current="page"][href*="trainerDashboard"]'));
		assert.ok(document.querySelector('a[href="/mypage?category=addProgram"]'));
		assert.ok(document.querySelector('a[href="/mypage?category=trainerReservations&period=UPCOMING&status=PENDING"]'));
		assert.ok(
			!requests.some((request) => request.variables?.input?.trainerId || request.variables?.input?.search?.trainerId),
		);
		pass(
			'real API populated sections, three previews/server count, conditional request, persisted schedule and active workspace links',
		);
		holdWrite = true;
		const before = writeCount(),
			button = row(pending[0]._id).querySelector('button.MuiButton-contained');
		flushSync(() => {
			button.click();
			button.click();
		});
		await until(() => release);
		assert.equal(writeCount(), before + 1);
		assert.ok(row(pending[0]._id));
		assert.equal(count(), '7');
		assert.ok([...document.querySelectorAll('.dashboard-pending-actions button')].every((button) => button.disabled));
		holdWrite = false;
		release();
		release = undefined;
		await until(
			() =>
				!row(pending[0]._id) &&
				count() === '6' &&
				document.querySelector('.dashboard-next-card')?.dataset.reservationId === pending[0]._id,
		);
		assert.equal((await reservations.findById(pending[0]._id)).reservationStatus, 'CONFIRMED');
		pass('Confirm duplicate protection, no optimistic removal, authoritative Pending count and Next Session refresh');
		click(`.dashboard-pending-card[data-reservation-id="${pending[1]._id}"] button.MuiButton-outlined`);
		await until(() => document.querySelector('[role="dialog"]'));
		const beforeCancel = writeCount();
		click('.MuiDialogActions-root button:first-child');
		await until(() => !document.querySelector('[role="dialog"]'));
		assert.equal(writeCount(), beforeCancel);
		assert.ok(row(pending[1]._id));
		click(`.dashboard-pending-card[data-reservation-id="${pending[1]._id}"] button.MuiButton-outlined`);
		await until(() => document.querySelector('[role="dialog"]'));
		click('.MuiDialogActions-root button:last-child');
		await until(() => count() === '5' && !row(pending[1]._id) && !document.querySelector('[role="dialog"]'));
		assert.equal((await reservations.findById(pending[1]._id)).reservationStatus, 'CANCELLED');
		pass('Cancel confirmation/back and real backend transition refresh the preview and server count');
		loseWrite = true;
		const beforeLost = writeCount();
		click(`.dashboard-pending-card[data-reservation-id="${pending[2]._id}"] button.MuiButton-contained`);
		await until(() => count() === '4' && text().includes(texts['Trainer reservations'].Success));
		assert.equal(writeCount(), beforeLost + 1);
		assert.ok(
			requests.some(
				(request) =>
					request.operationName === 'GetTrainerReservations' &&
					Object.keys(request.variables.input.search).length === 0,
			),
		);
		assert.equal((await reservations.findById(pending[2]._id)).reservationStatus, 'CONFIRMED');
		pass('lost mutation response reconciles with owned authoritative query, never retries the write');
		failures.add('GetTrainerPrograms');
		await client.refetchQueries({ include: ['GetTrainerPrograms'] }).catch(() => {});
		await until(() => document.querySelector('.dashboard-programs [role="alert"]'));
		assert.ok(document.querySelector('.dashboard-next-card'));
		assert.equal(document.querySelectorAll('.dashboard-pending-card').length, 3);
		assert.equal(document.querySelectorAll('.dashboard-weekday').length, 7);
		assert.ok(
			!document.querySelector('.dashboard-programs').textContent.includes(texts['Trainer dashboard']['No programs']),
		);
		failures.clear();
		click('.dashboard-programs [role="alert"] button');
		await until(() => document.querySelector('.dashboard-program'));
		pass('failed Programs section remains distinct from empty while other sections work; local Retry restores it');
		let mobile = true;
		const noopPage = { __esModule: true, default: () => null };
		const mobileMocks = {
			...mocks,
			'../../libs/auth': mocks['../../auth'],
			'@mui/material': { ...require('@mui/material'), useMediaQuery: () => mobile },
			'../../apollo/store': store,
			'../../hooks/useDeviceDetect': { __esModule: true, default: () => (mobile ? 'mobile' : 'desktop') },
			'../../libs/hooks/useDeviceDetect': { __esModule: true, default: () => (mobile ? 'mobile' : 'desktop') },
			'../../libs/components/layout/LayoutBasic': { __esModule: true, default: (Page) => Page },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
		};
		for (const name of [
			'MyFavorites',
			'RecentlyVisited',
			'MyProfile',
			'MyArticles',
			'MyMenu',
			'WriteArticle',
			'TrainerSchedule',
			'MyBookings',
			'TrainerReservations',
			'TrainerDashboard',
		])
			mobileMocks['../../libs/components/mypage/' + name] = noopPage;
		for (const name of ['MemberFollowers', 'MemberFollowings'])
			mobileMocks['../../libs/components/member/' + name] = noopPage;
		const MyPage = loadTs(path.join(__dirname, '../pages/mypage/index.tsx'), mobileMocks).default;
		const renderManagement = () =>
			root.render(React.createElement(ApolloProvider, { client }, React.createElement(MyPage)));
		router.query = { category: 'myPrograms' };
		renderManagement();
		await until(() => document.querySelector('.program-card-box'));
		assert.ok(!text().includes('GYMFLOW PROGRAMS MOBILE'));
		assert.ok(!text().includes('MOBILE PROGRAM CARD'));
		assert.ok(document.querySelector('.trainer-mobile-program-workspace'));
		assert.ok(document.querySelector('.schedule-mobile-navigation a[aria-current="page"][href*="myPrograms"]'));
		router.query = { category: 'addProgram' };
		renderManagement();
		await until(() => document.querySelector('#add-program-page input'));
		assert.ok(!text().includes('ADD PROGRAM MOBILE PAGE'));
		assert.ok(document.querySelector('#add-program-page select'));
		assert.ok(document.querySelector('#add-program-page input[type="file"]'));
		mobile = false;
		router.query = { category: 'myPrograms' };
		renderManagement();
		await until(() => document.querySelector('.main-config .program-card-box'));
		assert.ok(!document.querySelector('.trainer-mobile-program-workspace'));
		pass(
			'actual MyPage mobile Create/Manage Programs render existing forms/cards and workspace; desktop keeps its original branch',
		);
		router.query = { category: 'trainerDashboard' };
		render();
		await until(() => document.querySelector('.dashboard-next-card') && count() === '4');
		// Only this owned disposable database is changed to cover nullable summaries and empty states.
		await programs.deleteOne({ _id: fixture.program._id });
		await fixture.members.deleteOne({ _id: fixture.user._id });
		window.dispatchEvent(new window.Event('focus'));
		await until(() =>
			document.querySelector('.dashboard-next-card')?.textContent.includes(texts.MyBookings['Missing program']),
		);
		assert.ok(
			document
				.querySelector('.dashboard-next-card')
				.textContent.includes(texts['Trainer reservations']['Missing client']),
		);
		assert.ok(document.querySelector('.dashboard-pending-card'));
		pass('nullable program/client summaries remain safe and manageable without fabricated metadata');
		await reservations.deleteMany({ trainerId: trainer._id });
		await schedules.deleteMany({ memberId: trainer._id });
		await client.refetchQueries({ include: ['GetTrainerPrograms', 'GetMyTrainerSchedule'] });
		window.dispatchEvent(new window.Event('focus'));
		await until(
			() =>
				text().includes(texts['Trainer dashboard']['No next session']) &&
				text().includes(texts['Trainer dashboard']['No pending requests']) &&
				text().includes(texts['Trainer dashboard']['No programs']) &&
				text().includes(texts['Trainer dashboard']['No schedule']),
		);
		assert.equal(count(), '0');
		assert.equal(document.querySelectorAll('.dashboard-weekday.is-unconfigured').length, 7);
		pass('real successful empty sections retain management links and seven unconfigured weekdays');
		store.userVar({ _id: String(trainer._id), memberType: 'TRAINER', memberStatus: 'BLOCK' });
		await until(() => text().includes(texts['Trainer reservations'].guest));
		assert.ok(!document.querySelector('.dashboard-grid'));
		pass('inactive/account-change access removes private Dashboard content');
	} finally {
		console.log = previousLog;
		root?.unmount();
		client?.stop();
		dom?.window.close();
		if (fixture) await fixture.stop();
	}
}
(async () => {
	await unit();
	if (process.argv.includes('--integration')) await integration();
	output(checks + ' Trainer Dashboard checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
