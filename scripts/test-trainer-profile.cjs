// Profile flows use an owned disposable database and temporary upload directory only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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
		if (name.endsWith('.css') || name.startsWith('swiper/css')) return {};
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
function compileProfileStyles() {
	return require('sass').compileString(
		fs.readFileSync(path.join(__dirname, '../scss/variables.scss'), 'utf8') + '\n' +
		fs.readFileSync(path.join(__dirname, '../scss/pc/mypage/myProfile.scss'), 'utf8'),
	).css;
}
async function locales() {
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{ common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')) },
		]),
	);
	await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	for (const locale of ['en', 'kr', 'ru']) {
		assert.deepEqual(
			Object.keys(resources[locale].common['Trainer profile']).sort(),
			Object.keys(resources.en.common['Trainer profile']).sort(),
		);
		for (const key of Object.keys(resources.en.common['Trainer profile']))
			assert.ok(i18n.getFixedT(locale)('Trainer profile.' + key) !== 'Trainer profile.' + key);
	}
	pass('EN/KR/RU Profile JSON, matching keys and actual i18next resolution');
	const css = compileProfileStyles();
	const selector = '#pc-wrap.trainer-profile-layout .trainer-profile-heading .trainer-profile-bookings-link';
	assert.ok(css.includes(selector));
	assert.match(css.slice(css.indexOf(selector), css.indexOf(selector + ':hover')), /min-height: 44px/);
	assert.ok(css.includes(selector + ':hover'));
	assert.ok(css.includes(selector + ':focus-visible'));
	assert.match(css.slice(css.indexOf(selector + ':focus-visible')), /outline: 2px solid #a53425/);
	pass('Profile SCSS compiles with scoped secondary booking link, 44px touch target, hover and keyboard focus');
}
async function integration() {
	const sharp = require('node:module').createRequire(path.join(__dirname, '../../gymflow/package.json'))('sharp');
	const fixturePng = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
	const previousLog = console.log,
		previousCwd = process.cwd();
	const previousGraphql = process.env.REACT_APP_API_GRAPHQL_URL;
	const NativeFormData = global.FormData,
		NativeBlob = global.Blob;
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-profile-test-'));
	let fixture, root, client, dom;
	try {
		console.log = () => {};
		process.chdir(temporary);
		fixture = await require('./test-trainer-reservations.cjs').createFixture({ multipart: true });
		process.env.REACT_APP_API_GRAPHQL_URL = fixture.uri;
		const { trainer, otherTrainer, user, admin, uri, members, token } = fixture;
		const { JSDOM, VirtualConsole } = require('jsdom');
		const virtualConsole = new VirtualConsole();
		virtualConsole.on('jsdomError', (error) => {
			if (!error.message.includes('navigation')) throw error;
		});
		dom = new JSDOM('<div id="test-root"></div>', {
			url: 'http://localhost/mypage?category=myProfile',
			virtualConsole,
		});
		Object.assign(global, {
			window: dom.window,
			localStorage: dom.window.localStorage,
			document: dom.window.document,
			HTMLElement: dom.window.HTMLElement,
			Image: dom.window.Image,
			DocumentFragment: dom.window.DocumentFragment,
			FormData: dom.window.FormData,
			requestAnimationFrame: (fn) => setTimeout(fn, 0),
			cancelAnimationFrame: clearTimeout,
		});
		Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
		const profileStyles = document.createElement('style');
		profileStyles.textContent = compileProfileStyles();
		document.head.append(profileStyles);
		const React = require('react'),
			{ createRoot } = require('react-dom/client'),
			{ flushSync } = require('react-dom');
		const { ApolloClient, ApolloProvider, InMemoryCache, HttpLink } = require('@apollo/client');
		const store = loadTs(path.join(__dirname, '../apollo/store.ts'));
		const requests = [],
			uploads = [];
		let holdSave = false,
			releaseSave,
			holdUpload = false,
			releaseUpload,
			failSave = false,
			lastReceipt;
		client = new ApolloClient({
			cache: new InMemoryCache(),
			link: new HttpLink({
				uri,
				fetch: async (url, options) => {
					const body = JSON.parse(options.body);
					requests.push(body);
					if (failSave && body.operationName === 'UpdateMember')
						throw new Error('Private connection details must not be displayed');
					const response = await fetch(url, {
						...options,
						headers: { ...options.headers, Authorization: 'Bearer ' + auth.getJwtToken() },
					});
					if (body.operationName === 'UpdateMember') {
						lastReceipt = (await response.clone().json()).data?.updateMember;
						if (holdSave)
							await new Promise((resolve) => {
								releaseSave = resolve;
							});
					}
					return response;
				},
			}),
		});
		const auth = loadTs(path.join(__dirname, '../libs/auth/index.ts'), {
			'../../apollo/client': { initializeApollo: () => client },
			'../../apollo/store': store,
		});
		let confirmedLogout = false,
			logoutCalls = 0;
		const logoutDestinations = [];
		const authExports = {
			...auth,
			logOut: (...args) => {
				logoutCalls++;
				logoutDestinations.push(args[0]);
				return auth.logOut(...args);
			},
		};
		const sweet = {
			sweetConfirmAlert: async () => confirmedLogout,
			sweetErrorHandling: async () => {},
			sweetMixinSuccessAlert: async () => {},
			sweetMixinErrorAlert: async () => {},
			sweetTopSmallSuccessAlert: async () => {},
		};
		const axios = {
			__esModule: true,
			default: {
				post: async (url, form, options) => {
					assert.equal(url, uri);
					assert.equal(options.headers['apollo-require-preflight'], true);
					assert.equal(options.headers.Authorization, 'Bearer ' + auth.getJwtToken());
					const body = new NativeFormData();
					for (const [key, value] of form.entries()) {
						if (typeof value === 'string') body.append(key, value);
						else {
							const bytes = await new Promise((resolve, reject) => {
								const reader = new window.FileReader();
								reader.onload = () => resolve(reader.result);
								reader.onerror = reject;
								reader.readAsArrayBuffer(value);
							});
							body.append(key, new NativeBlob([bytes], { type: value.type }), value.name);
						}
					}
					const operations = JSON.parse(form.get('operations'));
					assert.equal(operations.variables.target, 'member');
					assert.deepEqual(JSON.parse(form.get('map')), { 0: ['variables.file'] });
					const response = await fetch(url, {
						method: 'POST',
						headers: { Authorization: options.headers.Authorization, 'apollo-require-preflight': 'true' },
						body,
					});
					const data = await response.json();
					uploads.push(data);
					if (holdUpload)
						await new Promise((resolve) => {
							releaseUpload = resolve;
						});
					return { data };
				},
			},
		};
		const resources = Object.fromEntries(['en', 'kr', 'ru'].map((locale) => [locale, {
			common: JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8')),
		}]));
		const texts = resources.en.common;
		const i18n = require('i18next').createInstance();
		await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
		const t = (key, values) => i18n.getFixedT(router.locale)(key, values);
		let mobile = false;
		const router = {
			isReady: true,
			pathname: '/mypage',
			query: {},
			asPath: '/mypage',
			locale: 'en',
			push: async () => true,
		};
		const link = ({ href, children, passHref, scroll, onClick, ...props }) =>
			React.createElement(
				'a',
				{
					...props,
					href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query),
					onClick: (event) => {
						onClick?.(event);
						if (!event.defaultPrevented) {
							event.preventDefault();
							void router.push(href);
						}
					},
				},
				children,
			);
		const noopPage = { __esModule: true, default: () => null };
		const mocks = {
			'@mui/material': {
				...require('@mui/material'),
				useMediaQuery: (query) => (typeof query === 'string' && query.includes('767px') ? mobile : false),
			},
			'next/router': { useRouter: () => router },
			'next/link': { __esModule: true, default: link },
			'next/head': noopPage,
			'next/image': { __esModule: true, default: (props) => React.createElement('img', props) },
			'next-i18next': { useTranslation: () => ({ t }) },
			'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
			'../../../apollo/store': store,
			'../../apollo/store': store,
			'../../auth': authExports,
			'../../libs/auth': authExports,
			'../../sweetAlert': sweet,
			'./../../sweetAlert': sweet,
			'../../libs/sweetAlert': sweet,
			axios: axios,
			'../../hooks/useDeviceDetect': { __esModule: true, default: () => (mobile ? 'mobile' : 'desktop') },
			'../../libs/hooks/useDeviceDetect': { __esModule: true, default: () => (mobile ? 'mobile' : 'desktop') },
			'../Top': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'legacy-top' }) },
			'../Chat': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'legacy-chat' }) },
			'../Footer': { __esModule: true, default: () => React.createElement('div', { 'data-test': 'existing-footer' }) },
		};
		for (const name of [
			'MyPrograms',
			'MyFavorites',
			'RecentlyVisited',
			'AddNewProgram',
			'MyArticles',
			'WriteArticle',
			'TrainerSchedule',
			'TrainerReservations',
			'TrainerDashboard',
		])
			mocks['../../libs/components/mypage/' + name] = noopPage;
		for (const name of ['MemberFollowers', 'MemberFollowings'])
			mocks['../../libs/components/member/' + name] = noopPage;
		const Page = loadTs(path.join(__dirname, '../pages/mypage/index.tsx'), mocks).default;
		const { TrainerWorkspaceHeader, TrainerWorkspaceNavigation } = loadTs(
			path.join(__dirname, '../libs/components/mypage/TrainerWorkspaceNavigation.tsx'),
			mocks,
		);
		root = createRoot(document.getElementById('test-root'));
		const wrap = (element) => React.createElement(ApolloProvider, { client }, element);
		const render = () => root.render(wrap(React.createElement(Page)));
		router.push = router.replace = async (href) => {
			const url = new URL(typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.query), 'http://localhost');
			router.pathname = url.pathname;
			router.query = Object.fromEntries(url.searchParams);
			router.asPath = url.pathname + url.search;
			render();
			return true;
		};
		const until = async (fn) => {
			const start = Date.now();
			while (!fn()) {
				if (Date.now() - start > 12000) throw new Error('Profile timeout: ' + document.body.textContent);
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
		};
		const select = (selector) => {
			const element = document.querySelector(selector);
			assert.ok(element, selector);
			return element;
		};
		const click = (selector) => flushSync(() => select(selector).click());
		const input = (name, value) =>
			flushSync(() => {
				const field = select(`[name="${name}"]`);
				Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, value);
				field.dispatchEvent(new window.Event('input', { bubbles: true }));
			});
		const upload = (name, type = 'image/png', size) =>
			flushSync(() => {
				const field = select('#trainer-profile-image');
				Object.defineProperty(field, 'files', {
					configurable: true,
					value: [new window.File([fixturePng], name, { type })],
				});
				if (size) Object.defineProperty(field.files[0], 'size', { value: size });
				field.dispatchEvent(new window.Event('change', { bubbles: true }));
			});
		const writes = () => requests.filter((request) => request.operationName === 'UpdateMember');
		const signIn = async (member) => {
			await auth.invalidateSession();
			const jwtToken = token(member);
			auth.setJwtToken(jwtToken);
			await auth.updateUserInfo(jwtToken, { ...member.toObject(), _id: String(member._id) });
		};
		store.authReadyVar(false);
		store.authErrorVar('');
		store.userVar({ ...trainer.toObject(), _id: String(trainer._id) });
		render();
		await until(() => document.body.textContent.includes(texts.MyBookings.initializing));
		assert.ok(!document.querySelector('#trainer-profile-page'));
		assert.equal(requests.length, 0);
		assert.equal(uploads.length, 0);
		store.authErrorVar('private auth details');
		await until(() => document.querySelector('.trainer-profile-access[role="alert"]'));
		assert.ok(!document.body.textContent.includes('private auth details'));
		store.authErrorVar('');
		await signIn(trainer);
		await until(() => document.querySelector('#trainer-profile-page'));
		pass('auth restoration/error gates private Profile behavior and uses local sanitized state');
		for (const viewport of [false, true])
			for (const query of [{}, { category: 'myProfile' }]) {
				mobile = viewport;
				router.query = query;
				render();
				await until(() => document.querySelector('#trainer-profile-page'));
				assert.ok(document.querySelector('#pc-wrap.trainer-profile-layout'));
				assert.ok(!document.querySelector('#my-page .left-config'));
				assert.ok(!document.querySelector('[data-test="legacy-top"]'));
				assert.ok(!document.querySelector('[data-test="legacy-chat"]'));
				assert.equal(document.querySelectorAll('#trainer-profile-page input:not([type="file"])').length, 4);
				assert.ok(document.querySelector('.schedule-desktop-navigation a[aria-current="page"][href*="myProfile"]'));
				assert.ok(document.querySelector('.schedule-mobile-navigation a[aria-current="page"][href*="myProfile"]'));
				assert.ok(!document.body.textContent.includes('MY PROFILE PAGE MOBILE'));
			}
		pass('real MyPage/LayoutBasic explicit and default trainer Profile routes use workspace on desktop/mobile');
		for (const active of ['Dashboard', 'Programs', 'Schedule', 'Reservations', 'Profile']) {
			root.render(
				wrap(
					React.createElement(
						React.Fragment,
						null,
						React.createElement(TrainerWorkspaceHeader, { active }),
						React.createElement(TrainerWorkspaceNavigation, { active, mobile: true }),
					),
				),
			);
			await until(
				() =>
					document.querySelector('.schedule-desktop-navigation a[aria-current="page"]')?.textContent ===
					texts['Trainer schedule'][active],
			);
			for (const selector of ['.schedule-desktop-navigation', '.schedule-mobile-navigation']) {
				assert.equal(document.querySelectorAll(selector + ' a').length, 5);
				assert.equal(
					document.querySelector(selector + ' a[aria-current="page"]').textContent,
					texts['Trainer schedule'][active],
				);
			}
		}
		pass('shared desktop/mobile five-item workspace navigation preserves every destination and active state');
		const customer = await members.create({
			memberNick: 'Promoted profile customer', memberPhone: 'profile-history-customer',
			memberPassword: 'fixture', memberType: 'USER',
		});
		const { addBookingDays, seoulToday } = loadTs(path.join(__dirname, '../libs/booking.ts'));
		const [upcoming, completed] = await fixture.reservations.create([
			{ memberId: customer._id, reservationDate: addBookingDays(seoulToday(), 1), reservationStatus: 'CONFIRMED' },
			{ memberId: customer._id, reservationDate: addBookingDays(seoulToday(), -1), reservationStatus: 'COMPLETED' },
		].map((row) => ({ ...row, trainerId: trainer._id, programId: fixture.program._id, startTime: '09:00', endTime: '10:00' })));
		const application = await fixture.gql('SUBMIT_TRAINER_APPLICATION', {
			fullName: 'Promoted profile customer', categories: ['YOGA'],
			experienceSummary: 'Coaching experience', bio: 'Customer history navigation fixture',
		}, customer);
		assert.equal(application.errors, undefined);
		const approval = await fixture.gql('REVIEW_TRAINER_APPLICATION', {
			applicationId: application.data.submitTrainerApplication._id, decision: 'APPROVED',
		}, admin);
		assert.equal(approval.errors, undefined);
		await auth.invalidateSession();
		auth.setJwtToken(token(customer));
		await auth.updateUserInfo();
		assert.equal(store.userVar()._id, String(customer._id));
		assert.equal(store.userVar().memberType, 'TRAINER');
		const bookingsLink = '#trainer-profile-page .trainer-profile-heading .trainer-profile-bookings-link';
		for (const viewport of [false, true]) {
			mobile = viewport;
			for (const locale of ['en', 'kr', 'ru']) {
				router.locale = locale;
				await router.push('/mypage');
				await until(() => document.querySelector(bookingsLink));
				assert.ok(document.querySelector('#pc-wrap.trainer-profile-layout'));
				assert.ok(!document.querySelector('#my-page .left-config'));
				const target = select(bookingsLink);
				assert.equal(target.textContent.trim(), resources[locale].common.MyBookings.Title);
				assert.equal(target.getAttribute('href'), '/mypage?category=myBookings');
				assert.equal(target.closest('form'), null);
				assert.equal(target.previousElementSibling.textContent, resources[locale].common['Trainer profile'].Intro);
				assert.equal(window.getComputedStyle(target).display, 'inline-flex');
				assert.equal(window.getComputedStyle(target).minHeight, '44px');
				for (const selector of ['.schedule-desktop-navigation', '.schedule-mobile-navigation']) {
					assert.equal(document.querySelectorAll(selector + ' a').length, 5);
					assert.ok(document.querySelector(selector + ' a[href*="category=trainerReservations"]'));
					assert.ok(!document.querySelector(selector + ' a[href*="category=myBookings"]'));
				}
				click(bookingsLink);
				await until(() => document.querySelector('[data-reservation-id="' + upcoming._id + '"]'));
				assert.equal(router.asPath, '/mypage?category=myBookings');
				assert.equal(router.query.period, undefined);
				assert.ok(!document.querySelector('[data-reservation-id="' + fixture.pending[0]._id + '"]'));
				const ownRead = requests.filter((request) => request.operationName === 'GetMyReservations').at(-1);
				assert.ok(ownRead);
				assert.equal(ownRead.variables.input.memberId, undefined);
				click('.my-bookings-tabs button:last-child');
				await until(() => document.querySelector('[data-reservation-id="' + completed._id + '"]'));
			}
		}
		pass('real promoted account /mypage Profile link reaches owned upcoming/history bookings through the full route/layout in EN/KR/RU and desktop/mobile branches');
		router.locale = 'en';
		await signIn(trainer);
		mobile = false;
		router.query = { category: 'myProfile' };
		render();
		await until(() => document.querySelector('#trainer-profile-name'));
		assert.equal(select('#trainer-profile-name').value, trainer.memberFullName);
		input('memberNick', 'profile-ok');
		input('memberFullName', 'Updated Real Trainer');
		input('memberPhone', '010-test-123');
		input('memberAddress', 'Updated training address');
		holdSave = true;
		const beforeSave = writes().length;
		flushSync(() => {
			select('.trainer-profile-save-button').click();
			select('.trainer-profile-save-button').click();
		});
		await until(() => releaseSave);
		assert.equal(writes().length, beforeSave + 1);
		assert.ok(!document.body.textContent.includes(texts['Trainer profile'].Saved));
		assert.ok(select('.trainer-profile-save-button').disabled);
		holdSave = false;
		releaseSave();
		releaseSave = undefined;
		await until(() => document.body.textContent.includes(texts['Trainer profile'].Saved));
		const saved = await members.findById(trainer._id);
		assert.equal(saved.memberNick, 'profile-ok');
		assert.equal(saved.memberFullName, 'Updated Real Trainer');
		assert.equal(saved.memberPhone, '010-test-123');
		assert.equal(saved.memberAddress, 'Updated training address');
		assert.equal(store.userVar().memberFullName, saved.memberFullName);
		assert.equal(window.localStorage.getItem('accessToken'), null);
		assert.equal(lastReceipt.accessToken, null);
		assert.ok(auth.getAuthSessionId());
		input('memberFullName', '');
		click('.trainer-profile-save-button');
		await until(() => store.userVar().memberFullName === '');
		assert.equal((await members.findById(trainer._id)).memberFullName, null);
		input('memberFullName', 'Updated Real Trainer');
		click('.trainer-profile-save-button');
		await until(() => store.userVar().memberFullName === 'Updated Real Trainer');
		assert.ok(
			Object.keys(writes().at(-1).variables.input).every((key) =>
				['memberImage', 'memberNick', 'memberFullName', 'memberPhone', 'memberAddress'].includes(key),
			),
		);
		pass(
			'real profile field update, synchronous duplicate protection, authoritative member/token/reactive refresh and safe payload',
		);
		failSave = true;
		click('.trainer-profile-save-button');
		await until(() => document.querySelector('.trainer-profile-feedback[role="alert"]'));
		assert.equal(
			document.querySelector('.trainer-profile-feedback').textContent,
			texts['Trainer profile']['Save error'],
		);
		assert.ok(!document.body.textContent.includes('Private connection'));
		failSave = false;
		pass('failed save cannot show success or leak private transport details');
		upload('bad.svg', 'image/svg+xml');
		await until(() => document.body.textContent.includes(texts['Trainer profile']['Image format']));
		assert.equal(uploads.length, 0);
		upload('large.png', 'image/png', 5 * 1024 * 1024 + 1);
		await until(() => document.body.textContent.includes(texts['Trainer profile']['Image size']));
		assert.equal(uploads.length, 0);
		upload('owned.png');
		await until(() => uploads.length === 1 && !select('.trainer-profile-save-button').disabled);
		assert.equal(uploads[0].errors, undefined, JSON.stringify(uploads[0].errors));
		const uploaded = uploads[0].data.imageUploader;
		assert.ok(uploaded.startsWith('uploads/member/'));
		assert.equal((await sharp(fs.readFileSync(path.join(temporary, uploaded))).metadata()).format, 'png');
		assert.ok(select('.trainer-profile-image img').src.includes(uploaded));
		assert.notEqual(store.userVar().memberImage, uploaded);
		click('.trainer-profile-save-button');
		await until(() => store.userVar().memberImage === uploaded);
		assert.equal((await members.findById(trainer._id)).memberImage, uploaded);
		flushSync(() => select('.trainer-profile-image img').dispatchEvent(new window.Event('error')));
		assert.ok(select('.trainer-profile-image img').src.endsWith('/img/profile/defaultUser.svg'));
		pass(
			'real authenticated multipart member upload in temporary directory, authoritative image save and broken-image fallback',
		);
		const beforeLogout = logoutCalls;
		click('.trainer-profile-logout');
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(logoutCalls, beforeLogout);
		confirmedLogout = true;
		click('.trainer-profile-logout');
		await until(() => !document.querySelector('#trainer-profile-page'));
		assert.equal(logoutCalls, beforeLogout + 1);
		assert.equal(logoutDestinations.at(-1), undefined);
		assert.equal(window.localStorage.getItem('accessToken'), null);
		assert.equal(store.userVar()._id, '');
		pass('real centralized logout confirmation, token clearing and removal of trainer content');
		for (const member of [admin]) {
			await signIn(member);
			mobile = false;
			router.query = { category: 'myProfile' };
			render();
			await until(() => document.querySelector('#my-profile-page'));
			assert.ok(document.querySelector('#my-page .left-config'));
			assert.ok(!document.querySelector('.trainer-profile-layout'));
			assert.ok(!document.querySelector('[name="memberFullName"]'));
			assert.ok(document.querySelector('[data-test="legacy-top"]'));
			assert.ok(document.body.textContent.includes('Logout'));
			await until(() => document.querySelectorAll('#my-profile-page input[type="text"]')[0]?.value === member.memberNick);
			const legacyPhone = 'legacy-' + member.memberType.toLowerCase();
			flushSync(() => {
				const phone = document.querySelectorAll('#my-profile-page input[type="text"]')[1];
				Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(phone, legacyPhone);
				phone.dispatchEvent(new window.Event('input', { bubbles: true }));
			});
			click('#my-profile-page .update-button');
			await until(() => store.userVar().memberPhone === legacyPhone);
			assert.equal((await members.findById(member._id)).memberPhone, legacyPhone);
			const beforeLegacyLogout = logoutCalls;
			const logoutItem = [...document.querySelectorAll('#my-page .left-config li')].find(
				(item) => item.textContent.trim() === 'Logout',
			);
			assert.ok(logoutItem);
			flushSync(() => logoutItem.click());
			await until(() => store.userVar()._id === '');
			assert.equal(logoutCalls, beforeLegacyLogout + 1);
			assert.equal(logoutDestinations.at(-1), undefined);
			await signIn(member);
			mobile = true;
			render();
			await until(() => !document.querySelector('#my-profile-page'));
			assert.ok(!document.querySelector('.trainer-profile-layout'));
		}
		await signIn(user);
		router.query = {};
		render();
		await until(() => document.querySelector('#user-profile-page'));
		assert.ok(!document.querySelector('.trainer-profile-layout'));
		router.query = { category: 'myBookings' };
		render();
		await until(() => document.querySelector('#my-bookings-page'));
		await until(() => document.querySelector('[data-reservation-id="' + fixture.pending[0]._id + '"]'));
		pass('ADMIN legacy Profile/sidebar/logout remain unchanged; USER mobile Profile default and explicit My Bookings route are isolated');
		await signIn(otherTrainer);
		mobile = false;
		router.query = { category: 'myProfile' };
		render();
		await until(() => document.querySelector('#trainer-profile-name'));
		assert.equal(select('#trainer-profile-name').value, '');
		click('.trainer-profile-save-button');
		await until(() => document.body.textContent.includes(texts['Trainer profile'].Saved));
		assert.equal(writes().at(-1).variables.input.memberFullName, null);
		pass('unset optional full name stays optional without inventing profile data');
		holdSave = true;
		input('memberFullName', 'Other Updated Trainer');
		click('.trainer-profile-save-button');
		await until(() => releaseSave);
		await signIn(user);
		render();
		await until(() => !document.querySelector('#trainer-profile-page'));
		const userToken = auth.getJwtToken();
		holdSave = false;
		releaseSave();
		releaseSave = undefined;
		await new Promise((resolve) => setTimeout(resolve, 80));
		assert.equal(store.userVar()._id, String(user._id));
		assert.equal(auth.getJwtToken(), userToken);
		pass('late save response after account change cannot replace the current member or token');
		await signIn(otherTrainer);
		render();
		await until(() => document.querySelector('#trainer-profile-image'));
		holdUpload = true;
		upload('late.png');
		await until(() => releaseUpload);
		await signIn(user);
		render();
		await until(() => !document.querySelector('#trainer-profile-page'));
		holdUpload = false;
		releaseUpload();
		releaseUpload = undefined;
		await new Promise((resolve) => setTimeout(resolve, 80));
		assert.equal(store.userVar()._id, String(user._id));
		assert.notEqual(store.userVar().memberImage, uploads.at(-1).data.imageUploader);
		await signIn(trainer);
		store.userVar({ ...store.userVar(), memberStatus: 'BLOCK' });
		render();
		await until(() => document.querySelector('.trainer-profile-access'));
		assert.ok(!document.querySelector('#trainer-profile-page'));
		pass('late upload and blocked trainer state cannot retain private Profile data');
	} finally {
		console.log = previousLog;
		root?.unmount();
		client?.stop();
		dom?.window.close();
		if (fixture) await fixture.stop();
		global.FormData = NativeFormData;
		if (previousGraphql === undefined) delete process.env.REACT_APP_API_GRAPHQL_URL;
		else process.env.REACT_APP_API_GRAPHQL_URL = previousGraphql;
		process.chdir(previousCwd);
		// This exact directory was created by this test under the OS temp directory.
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
(async () => {
	await locales();
	await integration();
	output(checks + ' Trainer Profile checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
