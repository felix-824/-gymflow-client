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
	const { createRoot } = require('react-dom/client');
	const { act, Simulate } = require('react-dom/test-utils');
	const program = { _id: 'a'.repeat(24), programName: 'Paused strength', programType: 'PT_1ON1', programCategory: 'MUSCLE_GAIN', programLocation: 'SEOUL', programPrice: 0, programDuration: 60, programCapacity: 1, programAddress: 'Seoul gym', programImages: ['uploads/program/a.png'], programStatus: 'PAUSED' };
	const router = { isReady: true, query: { programId: program._id, input: JSON.stringify({ page: 2, limit: 5, search: { programStatus: 'PAUSED' } }) }, push: async () => {} };
	const state = { program, queries: [], mutations: [], failMutation: false, uploadError: false, uploads: [], waitMutation: null };
	const variables = { userVar: () => ({ _id: 'b'.repeat(24), memberType: 'TRAINER' }), authReadyVar: () => true };
	function useQuery(query, options) {
		const current = React.useRef(options); current.current = options;
		const serialized = JSON.stringify(options.variables);
		const complete = React.useCallback(async () => {
			state.queries.push({ query, variables: current.current.variables });
			current.current.onCompleted({ getTrainerPrograms: { list: [state.program] } });
			return { data: { getTrainerPrograms: { list: [state.program] } } };
		}, [query]);
		React.useEffect(() => { if (!options.skip) Promise.resolve().then(complete); }, [query, serialized, options.skip, complete]);
		return { loading: false, refetch: complete };
	}
	function useMutation(name) {
		const [loading, setLoading] = React.useState(false);
		const mutate = React.useCallback(async (request) => {
			setLoading(true); state.mutations.push({ name, ...request });
			try {
				if (state.waitMutation) await state.waitMutation;
				if (state.failMutation) throw new Error('Program changed; reload and retry');
				return { data: {} };
			} finally { setLoading(false); }
		}, [name]);
		return [mutate, { loading }];
	}
	const host = (tag) => ({ children, className, role, onClick, type, disabled }) => React.createElement(tag, { className, role, onClick, type, disabled }, children);
	const Component = loadTs(path.join(__dirname, '../libs/components/mypage/AddNewProgram.tsx'), {
		'next/router': { useRouter: () => router },
		'@mui/material': { Stack: host('div'), Typography: host('p'), Button: host('button') },
		'../../hooks/useDeviceDetect': () => 'desktop',
		'../../program': forms,
		'../../auth': { getJwtToken: () => 'test-token', invalidateSession: () => {}, isAuthenticationError: () => false },
		'../../../apollo/store': variables,
		'@apollo/client': { useQuery, useMutation, useReactiveVar: (variable) => variable() },
		'../../../apollo/user/mutation': { CREATE_PROGRAM: 'CREATE_PROGRAM', UPDATE_PROGRAM: 'UPDATE_PROGRAM' },
		'../../../apollo/user/query': { GET_TRAINER_PROGRAMS: 'GET_TRAINER_PROGRAMS' },
		'../../sweetAlert': { sweetMixinSuccessAlert: async () => {} },
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
		assert.equal(state.queries[0].variables.input.page, 2);
		assert.equal(state.queries[0].variables.input.search.programStatus, 'PAUSED');
		assert.equal(document.querySelector('input').value, 'Paused strength');
		pass('paused form restores from management context without public getProgram');

		await act(async () => Simulate.change(document.querySelector('select'), { target: { value: 'ONLINE' } }));
		assert.equal(document.querySelectorAll('select')[2].value, 'ONLINE');
		assert.equal(document.querySelectorAll('select')[2].disabled, true);
		assert.equal([...document.querySelectorAll('input')].some((input) => input.value === 'Seoul gym'), false);
		await act(async () => Simulate.change(document.querySelector('select'), { target: { value: 'PT_1ON1' } }));
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
		pass('pending submit is locked and sends only permitted update fields');
		return checks;
	} finally {
		await act(async () => root.unmount());
		dom.window.close();
		delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT;
	}
};
