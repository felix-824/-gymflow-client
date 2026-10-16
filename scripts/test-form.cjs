const assert = require('node:assert/strict');
const path = require('node:path');

// DOM unit tests for stateful form behavior; no browser/server or application data is used.
module.exports = async function runFormChecks(loadTs, forms) {
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
	global.window = dom.window; global.document = dom.window.document;
	global.FormData = dom.window.FormData;
	global.IS_REACT_ACT_ENVIRONMENT = true;
	const React = require('react');
	const i18n = require('i18next').createInstance();
	const resources = Object.fromEntries(
		['en', 'kr', 'ru'].map((locale) => [
			locale,
			{
				common: JSON.parse(
					require('node:fs').readFileSync(path.join(__dirname, '../public/locales', locale, 'common.json'), 'utf8'),
				),
			},
		]),
	);
	await i18n.init({ resources, lng: 'en', ns: ['common'], defaultNS: 'common', initImmediate: false });
	const { createRoot } = require('react-dom/client');
	const { act, Simulate } = require('react-dom/test-utils');
	const program = { _id: 'a'.repeat(24), programName: 'Paused strength', programType: 'PT_1ON1', programCategory: 'MUSCLE_GAIN', programLocation: 'SEOUL', programPrice: 0, programDuration: 60, programCapacity: 1, programAddress: 'Seoul gym', programImages: ['uploads/program/a.png'], programStatus: 'PAUSED' };
	const router = {
		isReady: true,
		query: {
			programId: program._id,
			input: JSON.stringify({ page: 2, limit: 5, search: { programStatus: 'PAUSED' } }),
		},
		push: async (url) => { state.navigation.push(url); },
	};
	const state = {
		program,
		queries: [],
		mutations: [],
		failMutation: false,
		uploadError: false,
		uploads: [],
		waitMutation: null,
		mobile: false,
		failLookup: false, read: null, navigation: [], success: [], scrolled: [],
		reservationRead: null, failReservations: false, policyError: '',
	};
	dom.window.HTMLElement.prototype.scrollIntoView = function () { state.scrolled.push(this); };
	let trainer = { _id: 'b'.repeat(24), memberType: 'TRAINER' }, token = 'test-token';
	const variables = { userVar: () => trainer, authReadyVar: () => true };
	const client = { query: async (request) => {
		state.queries.push(request);
		assert.equal(request.fetchPolicy, 'no-cache');
		assert.deepEqual(request.context, { queryDeduplication: false, handleErrorLocally: true });
		if (request.query === 'GET_TRAINER_RESERVATIONS') {
			assert.deepEqual(request.variables.input, { page: request.variables.input.page, limit: 100, search: { programId: router.query.programId.toLowerCase(), period: 'UPCOMING' } });
			if (state.failReservations) throw new Error('Reservation read failed');
			return { data: { getTrainerReservations: state.reservationRead ? await state.reservationRead(request.variables.input) : { list: [], metaCounter: [{ total: 0 }] } } };
		}
		assert.equal(request.query, 'GET_TRAINER_PROGRAMS');
		assert.deepEqual(request.variables.input, { page: request.variables.input.page, limit: 100, sort: 'createdAt', direction: 'DESC', search: {} });
		if (state.failLookup) throw new Error('Network unavailable');
		const result = state.read ? await state.read(request.variables.input) : { list: [state.program], metaCounter: [{ total: 1 }] };
		return { data: { getTrainerPrograms: result } };
	} };
	function useMutation(name) {
		const [loading, setLoading] = React.useState(false);
		const mutate = React.useCallback(async (request) => {
			setLoading(true); state.mutations.push({ name, ...request });
			try {
				if (state.waitMutation) await state.waitMutation;
				if (state.failMutation) throw new Error('Program changed; reload and retry');
				if (state.policyError) throw new Error(state.policyError);
				return { data: {} };
			} finally { setLoading(false); }
		}, [name]);
		return [mutate, { loading }];
	}
	const Component = loadTs(path.join(__dirname, '../libs/components/mypage/AddNewProgram.tsx'), {
		...Object.fromEntries(['ArrowBackRounded', 'CheckCircleOutlineRounded', 'PersonOutlineRounded', 'GroupsOutlined', 'VideocamOutlined', 'AddPhotoAlternateOutlined', 'DeleteOutlineRounded', 'InfoOutlined'].map(name => ['@mui/icons-material/' + name, { __esModule: true, default: props => React.createElement('svg', props) }])),
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
		'next-i18next': { useTranslation: () => ({ t: i18n.t.bind(i18n) }) },
		'./TrainerWorkspaceNavigation': { TrainerWorkspaceHeader: () => null, TrainerWorkspaceNavigation: () => null },
		'@mui/material': { useMediaQuery: () => state.mobile },
		'../../program': forms,
		'../../auth': { getJwtToken: () => token, invalidateSession: () => {}, isAuthenticationError: () => false },
		'../../../apollo/store': variables,
		'@apollo/client': { useApolloClient: () => client, useMutation, useReactiveVar: (variable) => variable() },
		'../../../apollo/user/mutation': { CREATE_PROGRAM: 'CREATE_PROGRAM', UPDATE_PROGRAM: 'UPDATE_PROGRAM' },
		'../../../apollo/user/query': { GET_TRAINER_PROGRAMS: 'GET_TRAINER_PROGRAMS', GET_TRAINER_RESERVATIONS: 'GET_TRAINER_RESERVATIONS' },
		'../../sweetAlert': { sweetMixinSuccessAlert: async (message) => { state.success.push(message); } },
		'axios': { post: async (url, body) => {
			state.uploads.push({ operations: JSON.parse(body.get('operations')), map: JSON.parse(body.get('map')) });
			return state.uploadError ? { data: { errors: [{ message: 'Upload rejected' }] } } : { data: { data: { imagesUploader: ['uploads/program/new.png'] } } };
		} },
	}).default;
	const root = createRoot(document.getElementById('root'));
	let checks = 0;
	const pass = (name) => { checks++; console.log('PASS ' + name); };
	try {
		await act(async () => { root.render(React.createElement(Component)); });
		assert.equal(state.queries[0].query, 'GET_TRAINER_PROGRAMS');
		assert.equal(state.queries[0].variables.input.page, 1);
		assert.equal(document.querySelector('input').value, 'Paused strength');
		pass('PAUSED owner lookup ignores list page/filter context without public getProgram');

		await act(async () => Simulate.change(document.querySelector('input[value="ONLINE"]')));
		assert.equal(document.querySelector('#program-location').value, 'ONLINE');
		assert.equal(document.querySelector('#program-location').disabled, true);
		assert.equal([...document.querySelectorAll('input')].some((input) => input.value === 'Seoul gym'), false);
		await act(async () => Simulate.change(document.querySelector('input[value="PT_1ON1"]')));
		assert.equal(document.querySelectorAll('input[type=number]')[2].value, '1');
		assert.equal(document.querySelectorAll('input[type=number]')[2].disabled, true);
		await act(async () => Simulate.change([...document.querySelectorAll('input')].filter((input) => input.type === 'text')[1], { target: { value: 'Seoul gym' } }));
		pass('type changes pair ONLINE location and constrain PT capacity');

		state.uploadError = true;
		const fileInput = document.querySelector('input[type=file]');
		Object.defineProperty(fileInput, 'files', { configurable: true, value: [new dom.window.File(['image'], 'new.png', { type: 'image/png' })] });
		await act(async () => Simulate.change(fileInput));
		assert.deepEqual(state.uploads[0].map, { '0': ['variables.files.0'] });
		assert.equal(state.uploads[0].operations.variables.target, 'program');
		assert.equal(document.querySelectorAll('img').length, 1);
		assert.ok(document.querySelector('[role=alert]').textContent.includes('Upload rejected'));
		pass('GraphQL upload failure retains existing images and uses a dynamic map');

		state.failMutation = true;
		state.program = { ...program, programName: 'Latest server values' };
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.equal(document.querySelector('input').value, 'Latest server values');
		assert.ok(document.querySelector('[role=alert]').textContent.includes('review them'));
		assert.equal(state.mutations.length, 1);
		pass('conflict refetches latest values and waits for manual resubmission');

		state.failMutation = false;
		let release;
		state.waitMutation = new Promise((resolve) => { release = resolve; });
		await act(async () => {
			Simulate.submit(document.querySelector('form'));
			Simulate.submit(document.querySelector('form'));
		});
		assert.equal(state.mutations.length, 2);
		assert.equal(document.querySelector('button[type=submit]').disabled, true);
		await act(async () => { release(); });
		assert.equal(state.mutations[1].variables.input._id, program._id);
		assert.equal(state.mutations[1].variables.input.programStatus, undefined);
		assert.deepEqual(JSON.parse(state.navigation.at(-1).query.input), forms.readTrainerProgramsInquiry(router.query.input));
		pass('pending submit is locked and sends only permitted update fields');

		for (const locale of ['en', 'kr', 'ru']) {
			const keys = Object.keys(resources.en.common['Trainer program form']).sort();
			assert.deepEqual(Object.keys(resources[locale].common['Trainer program form']).sort(), keys);
			for (const key of keys) {
				const translated = i18n.getFixedT(locale)('Trainer program form.' + key, { count: 3, index: 2 });
				assert.ok(
					translated && !translated.includes('{{') && translated !== 'Trainer program form.' + key,
					locale + ' ' + key,
				);
			}
		}
		for (const locale of ['en', 'kr', 'ru']) {
			await i18n.changeLanguage(locale);
			await act(async () => Simulate.submit(document.querySelector('form')));
			assert.equal(state.success.at(-1), resources[locale].common['Trainer program form'].Updated);
		}
		await i18n.changeLanguage('en');
		pass('EN/KR/RU form translations, interpolation and update success feedback resolve');

		state.waitMutation = null;
		router.query = {};
		state.mobile = true;
		await act(async () => root.render(React.createElement(Component, { key: 'create' })));
		assert.equal(document.querySelector('#program-name').value, '');
		assert.deepEqual(
			[...document.querySelectorAll('section')].map((section) => section.className.split(' ').at(-1)),
			['editor-basics', 'editor-pricing', 'editor-location', 'editor-photos', 'editor-description', 'editor-confirm'],
		);
		assert.equal(document.querySelectorAll('#program-description').length, 1);
		const writesBeforeValidation = state.mutations.length;
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.equal(document.activeElement, document.querySelector('.editor-error'));
		assert.equal(state.scrolled.at(-1), document.activeElement);
		document.activeElement.blur();
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.equal(document.activeElement, document.querySelector('.editor-error'));
		assert.ok(document.querySelector('[role=alert]').textContent.includes('3–100'));
		assert.equal(state.mutations.length, writesBeforeValidation);
		await act(async () => {
			Simulate.change(document.querySelector('#program-name'), { target: { value: 'Real group training' } });
		});
		await act(async () => {
			Simulate.change(document.querySelector('#program-address'), { target: { value: 'Seoul studio' } });
		});
		await act(async () => Simulate.change(document.querySelector('input[value="GROUP_CLASS"]')));
		assert.equal(document.querySelector('#programCapacity').disabled, false);
		await act(async () => Simulate.change(document.querySelector('#programCapacity'), { target: { value: '8' } }));
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.ok(document.querySelector('[role=alert]').textContent.includes('at least one'));
		assert.equal(state.mutations.length, writesBeforeValidation);
		pass('mobile section and keyboard order, create defaults, group capacity and validation block invalid writes');

		state.uploadError = false;
		const chooseFile = async (name = 'new.png', type = 'image/png', count = 1) => {
			const input = document.querySelector('input[type=file]');
			Object.defineProperty(input, 'files', {
				configurable: true,
				value: Array.from({ length: count }, () => new dom.window.File(['image'], name, { type })),
			});
			await act(async () => Simulate.change(input));
		};
		let uploadCount = state.uploads.length;
		await chooseFile('invalid.gif', 'image/gif');
		assert.equal(state.uploads.length, uploadCount);
		assert.ok(document.querySelector('[role=alert]').textContent.includes('JPEG'));
		await chooseFile('new.png', 'image/png', 6);
		assert.equal(state.uploads.length, uploadCount);
		assert.ok(document.querySelector('[role=alert]').textContent.includes('5'));
		await chooseFile();
		assert.equal(document.querySelectorAll('.editor-photo').length, 1);
		assert.equal(document.querySelector('.editor-photo small').textContent, 'Primary image');
		for (const locale of ['en', 'kr', 'ru']) {
			await i18n.changeLanguage(locale);
			await act(async () => Simulate.submit(document.querySelector('form')));
			assert.equal(state.success.at(-1), resources[locale].common['Trainer program form'].Created);
		}
		await i18n.changeLanguage('en');
		assert.equal(state.mutations.at(-1).name, 'CREATE_PROGRAM');
		assert.equal(state.mutations.at(-1).variables.input.programCapacity, 8);
		assert.equal(state.mutations.at(-1).variables.input._id, undefined);
		assert.equal(state.mutations.at(-1).variables.input.programStatus, undefined);
		pass('file format and total-image limit, primary image, and create payload without client-owned status');

		await act(async () => document.querySelector('.editor-remove-photo').click());
		assert.equal(document.querySelectorAll('.editor-photo').length, 0);
		await act(async () => Simulate.change(document.querySelector('input[value="ONLINE"]')));
		assert.equal(document.querySelector('#program-address'), null);
		assert.equal(document.querySelector('#program-location').value, 'ONLINE');
		await chooseFile();
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.equal(state.mutations.at(-1).variables.input.programType, 'ONLINE');
		assert.equal(state.mutations.at(-1).variables.input.programLocation, 'ONLINE');
		assert.equal(state.mutations.at(-1).variables.input.programAddress, undefined);
		pass('image removal and online create omit physical address while preserving capacity');

		const render = async (key) => act(async () => { root.render(React.createElement(Component, { key })); });
		router.query = { programId: program._id };
		await render('direct');
		assert.equal(document.querySelector('#program-name').value, 'Latest server values');
		pass('direct edit URL loads an owned program without list context');

		state.program = program;
		state.read = (input) => ({ list: input.page === 1 ? Array.from({ length: 100 }, () => ({ ...program, _id: 'd'.repeat(24) })) : [program], metaCounter: [{ total: 101 }] });
		router.query = { programId: program._id, input: JSON.stringify({ page: 99, limit: 1, search: { text: 'nonmatching', programStatus: 'ACTIVE', memberId: 'f'.repeat(24) } }) };
		let before = state.queries.length;
		await render('later');
		assert.deepEqual(state.queries.slice(before).filter(q => q.query === 'GET_TRAINER_PROGRAMS').map(q => q.variables.input.page), [1, 2]);
		assert.equal(document.querySelector('#program-name').value, 'Paused strength');
		assert.deepEqual(JSON.parse(new URL(document.querySelector('.editor-cancel').href).searchParams.get('input')), forms.readTrainerProgramsInquiry(router.query.input));
		pass('later owned page loads despite stale page, status, text and owner filters; Cancel preserves inquiry');

		state.failMutation = true; state.failLookup = true;
		before = state.mutations.length;
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.equal(state.mutations.length, before + 1);
		assert.equal(document.querySelector('form'), null);
		assert.ok(document.querySelector('[role=alert]').textContent.includes('latest values could not be loaded'));
		state.failLookup = false;
		await act(async () => document.querySelector('.editor-load-state button').click());
		assert.equal(document.querySelector('#program-name').value, 'Paused strength');
		assert.ok(document.querySelector('.editor-error').textContent.includes('review them'));
		assert.equal(state.mutations.length, before + 1);
		state.failMutation = false;
		pass('failed conflict refresh blocks save explicitly; Retry only reloads and never retries mutation');

		state.read = () => ({ list: [], metaCounter: [{ total: 0 }] });
		for (const id of ['c'.repeat(24), 'e'.repeat(24), 'f'.repeat(24)]) {
			router.query = { programId: id };
			await render('unavailable-' + id);
			assert.ok(document.querySelector('.editor-load-state[role=alert]'));
			assert.equal(document.querySelector('form'), null);
		}
		state.read = () => ({ list: [{ ...program, programStatus: 'DELETE' }], metaCounter: [{ total: 1 }] });
		router.query = { programId: program._id };
		await render('deleted');
		assert.equal(document.querySelector('form'), null);
		pass('missing, deleted and foreign IDs absent from owner results cannot open a writable form');

		before = state.queries.length;
		for (const invalid of ['bad-id', '', ['a'.repeat(24)]]) {
			router.query = { programId: invalid };
			await render('invalid-' + JSON.stringify(invalid));
			assert.ok(document.querySelector('[role=alert]').textContent.includes('link is invalid'));
			assert.equal(document.querySelector('form'), null);
		}
		assert.equal(state.queries.length, before);
		pass('malformed, empty and array program IDs are rejected before GraphQL lookup');

		let resolveOld;
		const old = new Promise(resolve => { resolveOld = resolve; });
		state.read = () => old;
		router.query = { programId: program._id };
		await render('obsolete');
		state.read = () => ({ list: [], metaCounter: [{ total: 0 }] });
		router.query = { programId: 'c'.repeat(24) };
		await render('obsolete');
		before = state.queries.length;
		await act(async () => resolveOld({ list: Array.from({ length: 100 }, () => ({ ...program, _id: 'd'.repeat(24) })), metaCounter: [{ total: 200 }] }));
		assert.equal(state.queries.length, before);
		assert.equal(document.querySelector('form'), null);
		assert.ok(document.querySelector('[role=alert]').textContent.includes('unavailable'));
		pass('obsolete route response cannot restore stale data or continue pagination');

		state.read = () => new Promise(resolve => { resolveOld = resolve; });
		router.query = { programId: program._id };
		await render('session');
		trainer = { _id: 'c'.repeat(24), memberType: 'TRAINER' }; token = 'other-token';
		state.read = () => ({ list: [], metaCounter: [{ total: 0 }] });
		await render('session');
		await act(async () => resolveOld({ list: [program], metaCounter: [{ total: 1 }] }));
		assert.equal(document.querySelector('form'), null);
		pass('obsolete account/session response cannot restore another trainer form');

		trainer = { _id: 'b'.repeat(24), memberType: 'TRAINER' }; token = 'test-token';
		state.read = null; state.failLookup = false; state.failMutation = false;
		state.program = { ...program, programName: 'Reserved group', programType: 'GROUP_CLASS', programCapacity: 120 };
		router.query = { programId: program._id };
		const reservation = (index, patch = {}) => ({ _id: String(index).padStart(24, '0'), programId: program._id, reservationDate: '2099-01-08', startTime: '09:00', endTime: '10:00', reservationStatus: index % 2 ? 'PENDING' : 'CONFIRMED', ...patch });
		state.reservationRead = input => ({ list: input.page === 1 ? Array.from({ length: 100 }, (_, index) => reservation(index)) : [reservation(100)], metaCounter: [{ total: 101 }] });
		before = state.queries.length;
		await render('policy');
		assert.deepEqual(state.queries.slice(before).filter(q => q.query === 'GET_TRAINER_RESERVATIONS').map(q => q.variables.input.page), [1, 2]);
		assert.equal(document.querySelector('.editor-type-field').disabled, true);
		assert.equal(document.querySelector('#programDuration').disabled, true);
		assert.equal(document.querySelector('#program-location').disabled, true);
		assert.equal(document.querySelector('#program-address').disabled, true);
		assert.equal(document.querySelector('#programPrice').disabled, false);
		assert.equal(document.querySelector('#programCapacity').disabled, false);
		assert.equal(document.querySelector('#programCapacity').min, '101');
		assert.ok(document.querySelector('#editor-group-capacity-note').textContent.includes('101'));
		pass('15C fully paginates >100 protected rows; locks type/duration/location while price and group capacity remain editable');

		before = state.mutations.length;
		await act(async () => Simulate.change(document.querySelector('#programCapacity'), { target: { value: '100' } }));
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.equal(state.mutations.length, before);
		assert.equal(document.activeElement, document.querySelector('.editor-error'));
		await act(async () => Simulate.change(document.querySelector('#programCapacity'), { target: { value: '101' } }));
		await act(async () => Simulate.change(document.querySelector('#programPrice'), { target: { value: '90000' } }));
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.equal(state.mutations.length, before + 1);
		assert.equal(state.mutations.at(-1).variables.input.programCapacity, 101);
		assert.equal(state.mutations.at(-1).variables.input.programPrice, 90000);
		pass('15C capacity below occupied minimum is blocked accessibly; equality and price change can be submitted');

		state.policyError = 'Program duration cannot be changed while upcoming reservations exist.';
		await act(async () => Simulate.change(document.querySelector('#program-name'), { target: { value: 'Unsaved policy draft' } }));
		const readsBeforePolicyError = state.queries.length;
		for (const locale of ['en', 'kr', 'ru']) {
			await i18n.changeLanguage(locale);
			await render('policy');
			before = state.mutations.length;
			await act(async () => Simulate.submit(document.querySelector('form')));
			assert.equal(state.mutations.length, before + 1);
			assert.equal(document.querySelector('.editor-error').textContent, resources[locale].common['Trainer program form']['Duration locked']);
			assert.equal(document.querySelector('#program-name').value, 'Unsaved policy draft');
		}
		assert.equal(state.queries.length, readsBeforePolicyError);
		await i18n.changeLanguage('en'); state.policyError = '';
		pass('15C backend policy rejection is localized, preserves draft and never triggers conflict refresh or mutation retry');

		state.program = { ...state.program, programCapacity: 2 };
		state.reservationRead = () => ({ list: [reservation(0), reservation(1), reservation(2)], metaCounter: [{ total: 3 }] });
		await render('legacy-capacity');
		assert.equal(document.querySelector('#programCapacity').min, '2');
		await act(async () => Simulate.change(document.querySelector('#programCapacity'), { target: { value: '3' } }));
		before = state.mutations.length;
		await act(async () => Simulate.submit(document.querySelector('form')));
		assert.equal(state.mutations.length, before + 1);
		pass('15C advisory minimum preserves allowed increases for pre-existing overcapacity');

		state.failReservations = true;
		await render('policy-failure');
		await act(async () => Simulate.change(document.querySelector('#program-name'), { target: { value: 'Draft kept through retry' } }));
		assert.equal(document.querySelector('.editor-type-field').disabled, true);
		assert.equal(document.querySelector('#programCapacity').disabled, true);
		assert.equal(document.querySelector('button[type=submit]').disabled, true);
		assert.equal(document.querySelector('#programPrice').disabled, false);
		assert.ok(document.querySelector('#editor-reservation-note[role=alert]'));
		state.failReservations = false;
		state.reservationRead = () => ({ list: [], metaCounter: [{ total: 1 }] });
		await act(async () => document.querySelector('#editor-reservation-note button').click());
		assert.equal(document.querySelector('button[type=submit]').disabled, true);
		state.reservationRead = () => ({ list: [], metaCounter: [] });
		before = state.mutations.length;
		await act(async () => document.querySelector('#editor-reservation-note button').click());
		assert.equal(document.querySelector('#program-name').value, 'Draft kept through retry');
		assert.equal(document.querySelector('.editor-type-field').disabled, false);
		assert.equal(document.querySelector('button[type=submit]').disabled, false);
		assert.equal(state.mutations.length, before);
		pass('15C failed/incomplete reads fail closed; read-only Retry recovers without replacing the draft or saving');

		let resolveReservations;
		state.reservationRead = () => new Promise(resolve => { resolveReservations = resolve; });
		await render('obsolete-policy');
		state.program = { ...state.program, _id: 'c'.repeat(24), programName: 'Different owned program' };
		router.query = { programId: state.program._id };
		state.reservationRead = () => ({ list: [], metaCounter: [] });
		await render('obsolete-policy');
		before = state.queries.length;
		await act(async () => resolveReservations({ list: Array.from({ length: 100 }, (_, index) => reservation(index)), metaCounter: [{ total: 101 }] }));
		assert.equal(document.querySelector('#program-name').value, 'Different owned program');
		assert.equal(document.querySelector('.editor-type-field').disabled, false);
		assert.equal(state.queries.length, before);
		pass('15C obsolete advisory response cannot lock a new program or continue paging');

		const ignored = await forms.readProgramEditConstraints(program._id, async () => ({ list: [reservation(0, { reservationStatus: 'CANCELLED' }), reservation(1, { reservationStatus: 'COMPLETED' }), reservation(2, { reservationStatus: 'NO_SHOW' }), reservation(3, { reservationDate: '2020-01-01' })], metaCounter: [{ total: 4 }] }));
		assert.deepEqual(ignored, { hasProtected: false, maxOccupied: 0 });
		before = state.queries.length; router.query = {};
		await render('policy-create');
		assert.equal(document.querySelector('.editor-type-field').disabled, false);
		assert.equal(document.querySelector('#programDuration').disabled, false);
		assert.equal(document.querySelector('#programCapacity').value, '1');
		assert.equal(state.queries.length, before);
		pass('15C ignores terminal/ended history and does not query or restrict create mode');
		return checks;
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT;
	}
};
