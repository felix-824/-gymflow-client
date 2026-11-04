// Real history components/Apollo/i18next with a controlled transport. No HTTP, sessions or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { parse, visit } = require('graphql');
const base = path.resolve(__dirname, '..');
let checks = 0;
const pass = (name) => {
	checks++;
	console.log('PASS ' + name);
};
const id = (value) => value.toString(16).padStart(24, '0');

function load(file, mocks = {}, cache = new Map()) {
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
	cache.set(file, module.exports);
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
		(name) => {
			if (Object.hasOwn(mocks, name)) return mocks[name];
			if (!name.startsWith('.')) return require(name);
			const target = path.resolve(path.dirname(file), name);
			return load(fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache);
		},
		module,
		module.exports,
	);
	return module.exports;
}

function fixtures() {
	const snapshot = {
		gymId: id(30),
		gymName: 'Historical Gym A',
		programLocation: 'SEOUL',
		programAddress: 'Historical venue A, Seoul',
	};
	const program = {
		_id: id(20),
		programName: 'Current program',
		programImages: [],
		programType: 'GROUP_CLASS',
		programLocation: 'BUSAN',
		programAddress: 'Current venue B, Busan',
	};
	return [
		{ venueSnapshot: snapshot, programData: program },
		{ venueSnapshot: null, programData: program },
		{
			venueSnapshot: {
				gymId: null,
				gymName: null,
				programLocation: 'GYEONGGI',
				programAddress: 'Independent historical room',
			},
			programData: program,
		},
		{ venueSnapshot: snapshot, programData: null },
		{ venueSnapshot: snapshot, programData: { ...program, programType: 'ONLINE', programLocation: 'ONLINE' } },
		{
			venueSnapshot: {
				gymId: null,
				gymName: null,
				programLocation: 'ONLINE',
				programAddress: 'Not a physical address',
			},
			programData: program,
		},
	].map((values, index) => ({
		_id: id(index + 1),
		programId: id(20),
		memberId: id(100),
		trainerId: id(200),
		reservationDate: '2026-01-08',
		startTime: '09:00',
		endTime: '10:00',
		reservationStatus: 'COMPLETED',
		reviewId: id(300 + index),
		specialRequest: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-08T01:00:00Z',
		trainerData: { _id: id(200), memberNick: 'Fixture trainer', memberFullName: null, memberImage: '' },
		memberData: { _id: id(100), memberNick: 'Fixture user', memberFullName: null, memberImage: '' },
		...values,
	}));
}

async function main() {
	const documents = require('./check-graphql.cjs').collectDocuments();
	for (const name of ['GET_MY_RESERVATIONS', 'GET_TRAINER_RESERVATIONS']) {
		const document = documents.find((entry) => entry.name === name);
		assert(document, name);
		let snapshot;
		visit(parse(document.query), {
			Field(node) {
				if (node.name.value === 'venueSnapshot') snapshot = node;
			},
		});
		assert.deepEqual(snapshot?.selectionSet?.selections.map((field) => field.name.value).sort(), [
			'gymId',
			'gymName',
			'programAddress',
			'programLocation',
		]);
	}
	pass('both real history queries select the exact nullable backend snapshot contract');
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			Object.fromEntries(
				['common', 'reservation-venue'].map((namespace) => [
					namespace,
					JSON.parse(fs.readFileSync(path.join(base, 'public/locales', locale, namespace + '.json'), 'utf8')),
				]),
			),
		]),
	);
	for (const locale of ['en', 'kr', 'ru']) {
		assert.deepEqual(Object.keys(resources[locale]['reservation-venue']), ['Unavailable']);
		assert(resources[locale]['reservation-venue'].Unavailable.trim());
	}
	pass('new EN/KR/RU namespace is complete without editing common translations');
	const i18n = require('i18next').createInstance();
	await i18n.init({
		resources,
		lng: 'en',
		fallbackLng: 'en',
		defaultNS: 'common',
		ns: ['common', 'reservation-venue'],
		interpolation: { escapeValue: false },
	});
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/mypage?category=myBookings&period=HISTORY' });
	const globals = [
		'window',
		'document',
		'navigator',
		'HTMLElement',
		'DocumentFragment',
		'requestAnimationFrame',
		'cancelAnimationFrame',
		'IS_REACT_ACT_ENVIRONMENT',
	];
	const previous = Object.fromEntries(globals.map((name) => [name, Object.getOwnPropertyDescriptor(global, name)]));
	for (const name of globals.slice(0, 5))
		Object.defineProperty(global, name, { value: dom.window[name], configurable: true });
	global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
	global.cancelAnimationFrame = clearTimeout;
	global.IS_REACT_ACT_ENVIRONMENT = true;
	let root, client;
	try {
		const React = require('react');
		const { act } = require('react-dom/test-utils');
		const { createRoot } = require('react-dom/client');
		const apollo = require('@apollo/client');
		const store = { userVar: apollo.makeVar({}), authReadyVar: apollo.makeVar(true), authErrorVar: apollo.makeVar('') };
		const router = {
			isReady: true,
			pathname: '/mypage',
			locale: 'en',
			query: {},
			asPath: '/mypage',
			push: async () => true,
			replace: async () => true,
		};
		const mutations = [];
		const rows = fixtures();
		client = new apollo.ApolloClient({
			cache: new apollo.InMemoryCache(),
			link: new apollo.ApolloLink(
				(operation) =>
					new apollo.Observable((observer) => {
						const names = { GetMyReservations: 'getMyReservations', GetTrainerReservations: 'getTrainerReservations' };
						const name = names[operation.operationName];
						if (!name) {
							mutations.push(operation.operationName);
							observer.error(new Error('Unexpected operation: ' + operation.operationName));
							return;
						}
						const list = operation.variables.input.search.period === 'HISTORY' ? rows : [];
						observer.next({ data: { [name]: { list, metaCounter: [{ total: list.length }] } } });
						observer.complete();
					}),
			),
		});
		const mocks = {
			'next/router': { useRouter: () => router },
			'next/link': {
				__esModule: true,
				default: ({ href, children, passHref, ...props }) =>
					React.createElement('a', { ...props, href: typeof href === 'string' ? href : href.pathname }, children),
			},
			'next-i18next': { useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) },
			'../../../apollo/store': store,
			'../../auth': { getJwtToken: () => '', updateUserInfo: async () => {} },
		};
		const pages = {
			USER: load('libs/components/mypage/MyBookings.tsx', mocks).default,
			TRAINER: load('libs/components/mypage/TrainerReservations.tsx', mocks).default,
		};
		root = createRoot(document.getElementById('root'));
		for (const role of ['USER', 'TRAINER']) {
			const selector = role === 'USER' ? '.my-bookings-location' : '.trainer-reservation-location > span:last-child';
			for (const locale of ['en', 'kr', 'ru']) {
				await act(async () => {
					await i18n.changeLanguage(locale);
					router.locale = locale;
					router.query = { category: role === 'USER' ? 'myBookings' : 'trainerReservations', period: 'HISTORY' };
					store.userVar({ _id: role === 'USER' ? id(100) : id(200), memberType: role, memberStatus: 'ACTIVE' });
					root.render(
						React.createElement(
							apollo.ApolloProvider,
							{ client },
							React.createElement(pages[role], { key: role + locale }),
						),
					);
					await new Promise((resolve) => setTimeout(resolve, 30));
				});
				const venue = (index) =>
					document.querySelector(`[data-reservation-id="${id(index)}"] ${selector}`)?.textContent;
				assert(venue(1)?.includes('Historical Gym A') && venue(1).includes('Historical venue A, Seoul'));
				assert(venue(1).includes(i18n.t('SEOUL')) && !venue(1).includes('Current venue B'));
				pass(`${role} ${locale}: moved Program B does not replace the booked Gym A`);
				assert(venue(2)?.includes(resources[locale]['reservation-venue'].Unavailable));
				assert(!venue(2).includes('Current venue B') && !venue(2).includes(i18n.t('BUSAN')));
				pass(`${role} ${locale}: legacy null snapshot shows localized unavailable copy without a Program fallback`);
				assert(venue(3)?.includes('Independent historical room') && venue(3).includes(i18n.t('GYEONGGI')));
				assert(!venue(3).includes('Gym A') && !venue(3).includes('Current venue B'));
				pass(`${role} ${locale}: independent snapshot with nullable Gym fields remains truthful`);
				assert(venue(4)?.includes('Historical Gym A') && venue(4).includes('Historical venue A, Seoul'));
				assert(venue(5)?.includes('Historical venue A, Seoul') && !venue(5).includes(i18n.t('ONLINE')));
				pass(`${role} ${locale}: missing Program and current ONLINE Program preserve the captured physical venue`);
				assert(venue(6)?.includes(i18n.t('ONLINE')));
				assert(!venue(6).includes('Not a physical address') && !venue(6).includes('Current venue B'));
				pass(`${role} ${locale}: snapshot ONLINE semantics do not infer a Gym or physical address`);
				assert.equal(document.querySelectorAll('[data-reservation-id]').length, rows.length);
				assert.equal(document.querySelectorAll('.my-bookings-card-actions button, [data-action]').length, 0);
			}
		}
		assert.equal(mutations.length, 0);
		pass('USER/TRAINER history rendering dispatches no mutation');
	} finally {
		if (root) {
			const { act } = require('react-dom/test-utils');
			await act(async () => root.unmount());
		}
		client?.stop();
		dom.window.close();
		for (const name of globals) {
			if (previous[name]) Object.defineProperty(global, name, previous[name]);
			else delete global[name];
		}
	}
	console.log(checks + ' Reservation venue snapshot checks passed. No application database or HTTP request was used.');
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
