const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Focused DOM regression checks: real React/Apollo hooks, a controlled local
// ApolloLink, and no browser, HTTP endpoint, database or application session.
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file,
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.React },
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => {
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('.')) {
			const target = path.resolve(path.dirname(file), name);
			const resolved = ['.ts', '.tsx', '/index.ts'].map((extension) => target + extension).find(fs.existsSync);
			if (!resolved) throw new Error('Unresolved local module: ' + target);
			return loadTs(resolved, mocks, cache);
		}
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + output + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}

let checks = 0;
function pass(name) { checks++; console.log('PASS ' + name); }
const file = (relative) => path.join(__dirname, '..', relative);

async function main() {
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/mypage?category=trainerSchedule' });
	global.window = dom.window;
	global.document = dom.window.document;
	global.navigator = dom.window.navigator;
	global.IS_REACT_ACT_ENVIRONMENT = true;
	const React = require('react');
	const { createRoot } = require('react-dom/client');
	const { act, Simulate } = require('react-dom/test-utils');
	const { ApolloClient, ApolloProvider, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
	const forms = loadTs(file('libs/trainer-schedule.ts'));
	const { TrainerScheduleDayOfWeek } = loadTs(file('libs/enums/trainer-schedule.enum.ts'));
	const { GET_MY_TRAINER_SCHEDULE } = loadTs(file('apollo/user/query.ts'));
	const { SAVE_MY_TRAINER_SCHEDULE } = loadTs(file('apollo/user/mutation.ts'));
	const { userVar, emptyUser } = loadTs(file('apollo/store.ts'));
	const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
	const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	const selectedFields = ['_id', 'memberId', 'dayOfWeek', 'isAvailable', 'startTime', 'endTime', 'createdAt', 'updatedAt'];
	const operation = (document) => document.definitions.find((definition) => definition.kind === 'OperationDefinition');
	const query = operation(GET_MY_TRAINER_SCHEDULE);
	const mutation = operation(SAVE_MY_TRAINER_SCHEDULE);
	assert.deepEqual(Object.values(TrainerScheduleDayOfWeek), weekdays);
	assert.deepEqual(forms.trainerScheduleWeekdays, weekdays);
	assert.equal(query.name.value, 'GetMyTrainerSchedule');
	assert.equal(query.variableDefinitions.length, 0);
	assert.equal(query.selectionSet.selections[0].name.value, 'getMyTrainerSchedule');
	assert.deepEqual(query.selectionSet.selections[0].selectionSet.selections.map((selection) => selection.name.value), selectedFields);
	assert.equal(mutation.name.value, 'SaveMyTrainerSchedule');
	assert.equal(mutation.variableDefinitions.length, 1);
	assert.equal(mutation.variableDefinitions[0].variable.name.value, 'input');
	assert.equal(mutation.variableDefinitions[0].type.kind, 'NonNullType');
	assert.equal(mutation.variableDefinitions[0].type.type.name.value, 'TrainerScheduleInput');
	assert.equal(mutation.selectionSet.selections[0].name.value, 'saveMyTrainerSchedule');
	assert.deepEqual(mutation.selectionSet.selections[0].selectionSet.selections.map((selection) => selection.name.value), selectedFields);
	pass('seven real weekday enums and exact existing GraphQL query/mutation fields');

	for (const value of ['24:00', '9:00', '09:60', '09:00\n', ' 09:00', '']) assert.equal(forms.isScheduleTime(value), false);
	assert.equal(forms.getScheduleDayError({ dayOfWeek: 'MON', isAvailable: true, startTime: '09:00', endTime: '09:01' }), null);
	assert.equal(forms.getScheduleDayError({ dayOfWeek: 'MON', isAvailable: true, startTime: '18:00', endTime: '09:00' }), 'Time order');
	assert.equal(forms.getScheduleDayError({ dayOfWeek: 'MON', isAvailable: true, startTime: '', endTime: '09:00' }), 'Required times');
	pass('strict HH:mm validation and valid one-minute working window');

	const row = (dayOfWeek, isAvailable, startTime = null, endTime = null) => ({
		__typename: 'TrainerSchedule', _id: 'schedule-' + dayOfWeek, memberId: 'trainer-owner', dayOfWeek,
		isAvailable, startTime, endTime, createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z',
	});
	const toRows = (days) => days.map((day) => row(day.dayOfWeek, day.isAvailable, day.startTime ?? null, day.endTime ?? null));
	const requests = [];
	const client = new ApolloClient({
		cache: new InMemoryCache(),
		link: new ApolloLink((request) => new Observable((observer) => {
			const entry = { name: request.operationName, variables: JSON.parse(JSON.stringify(request.variables)), observer, closed: false };
			requests.push(entry);
			return () => { entry.closed = true; };
		})),
	});
	userVar({ ...emptyUser, _id: 'trainer-owner', memberType: 'TRAINER', memberNick: 'Trainer', memberFullName: 'Test Trainer' });
	const mocks = {
		'next/link': ({ href, children, passHref, legacyBehavior, ...props }) => {
			const attributes = { ...props, href: typeof href === 'string' ? href : href.pathname };
			return React.isValidElement(children) && children.type === 'a' ? React.cloneElement(children, attributes) : React.createElement('a', attributes, children);
		},
		'next/image': (props) => React.createElement('img', props),
		'next-i18next': { useTranslation: () => ({ t: (key, values) => values?.day ? key + ' ' + values.day : key }) },
		'@mui/material': { Avatar: ({ children }) => React.createElement('span', null, children) },
		'../../../apollo/store': { userVar },
	};
	// Decorative icons/avatar are outside the schedule state/data behavior under test.
	for (const icon of ['GridViewOutlined', 'FitnessCenterOutlined', 'CalendarMonthOutlined', 'EventNoteOutlined', 'AccountCircleOutlined', 'VisibilityOutlined', 'ScheduleOutlined', 'InfoOutlined']) {
		mocks['@mui/icons-material/' + icon] = (props) => React.createElement('svg', props);
	}
	const Component = loadTs(file('libs/components/mypage/TrainerSchedule.tsx'), mocks).default;
	const root = createRoot(document.getElementById('root'));
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	const render = async (key) => { await act(async () => { root.render(React.createElement(ApolloProvider, { client }, React.createElement(Component, { key }))); await tick(); }); };
	const latest = (name) => {
		const request = [...requests].reverse().find((entry) => entry.name === name && !entry.closed);
		assert.ok(request, 'Expected a pending ' + name + ' operation');
		return request;
	};
	const succeed = async (request, field, rows) => {
		await act(async () => { request.observer.next({ data: { [field]: rows } }); request.observer.complete(); await tick(); });
	};
	const fail = async (request, message) => {
		await act(async () => { request.observer.error(new Error(message)); await tick(); });
	};
	const day = (weekday) => document.querySelectorAll('.schedule-day')[weekdays.indexOf(weekday)];
	const toggle = (weekday) => day(weekday).querySelector('[role=switch]');
	const input = (weekday, index) => day(weekday).querySelectorAll('input[type=time]')[index];
	const saveButton = () => document.querySelector('button[type=submit]');
	const submit = async () => { await act(async () => { Simulate.submit(document.querySelector('form')); await tick(); }); };
	const setTime = async (weekday, index, value) => { await act(async () => { Simulate.change(input(weekday, index), { target: { value } }); }); };
	const switchDay = async (weekday) => { await act(async () => Simulate.click(toggle(weekday))); };
	const mutationCount = () => requests.filter((request) => request.name === 'SaveMyTrainerSchedule').length;
	try {
		await render('empty');
		assert.ok(document.querySelector('.schedule-load-state').textContent.includes('Loading'));
		assert.equal(document.querySelectorAll('.schedule-day').length, 0);
		assert.equal(saveButton().disabled, true);
		await submit();
		assert.equal(mutationCount(), 0);
		await succeed(latest('GetMyTrainerSchedule'), 'getMyTrainerSchedule', []);
		assert.equal(document.querySelectorAll('.schedule-day').length, 7);
		for (const weekday of weekdays) {
			assert.equal(toggle(weekday).getAttribute('aria-checked'), 'false');
			assert.equal(input(weekday, 0).disabled, true);
		}
		assert.equal(saveButton().disabled, true);
		pass('initial loading prevents save; an empty result renders seven off days without saving defaults');

		await render('partial');
		await succeed(latest('GetMyTrainerSchedule'), 'getMyTrainerSchedule', [row('FRI', false, '11:00', '16:00'), row('MON', true, '10:00', '17:00')]);
		assert.equal(input('MON', 0).value, '10:00');
		assert.equal(input('FRI', 0).value, '11:00');
		assert.equal(toggle('TUE').getAttribute('aria-checked'), 'false');
		for (const [index, heading] of [...document.querySelectorAll('.schedule-day h2')].entries()) assert.ok(heading.textContent.endsWith(weekdayNames[index]));
		assert.equal(saveButton().disabled, true);
		pass('unordered partial saved rows map to a complete ordered week and clean baseline');

		await setTime('MON', 0, '10:30');
		await switchDay('MON');
		assert.equal(input('MON', 0).value, '10:30');
		assert.equal(input('MON', 0).disabled, true);
		await switchDay('MON');
		assert.equal(input('MON', 0).value, '10:30');
		assert.equal(input('MON', 1).value, '17:00');
		await switchDay('FRI');
		assert.equal(input('FRI', 0).value, '11:00');
		assert.equal(input('FRI', 1).value, '16:00');
		await switchDay('FRI');
		pass('toggle off/on preserves edited and previously saved working hours');

		await setTime('MON', 1, '10:30');
		assert.equal(saveButton().disabled, true);
		assert.ok(day('MON').querySelector('[role=alert]').textContent.includes('Time order'));
		await submit();
		await setTime('MON', 0, '');
		assert.ok(day('MON').querySelector('[role=alert]').textContent.includes('Required times'));
		assert.equal(saveButton().disabled, true);
		await submit();
		assert.equal(mutationCount(), 0);
		await setTime('MON', 0, '10:29');
		assert.equal(saveButton().disabled, false);
		pass('missing/equal times block submission; one-minute working hours allow save');

		await act(async () => { Simulate.submit(document.querySelector('form')); Simulate.submit(document.querySelector('form')); await tick(); });
		assert.equal(mutationCount(), 1);
		const pending = latest('SaveMyTrainerSchedule');
		const expected = { input: { days: weekdays.map((dayOfWeek) => dayOfWeek === 'MON' ? { dayOfWeek, isAvailable: true, startTime: '10:29', endTime: '10:30' } : { dayOfWeek, isAvailable: false }) } };
		assert.deepEqual(pending.variables, expected);
		assert.equal(saveButton().disabled, true);
		for (const control of document.querySelectorAll('.schedule-day input, .schedule-day [role=switch]')) assert.equal(control.disabled, true);
		// Synthetic events bypass DOM disabled behavior and verify the handler guard too.
		await setTime('MON', 0, '12:00');
		await switchDay('MON');
		assert.equal(input('MON', 0).value, '10:29');
		assert.equal(toggle('MON').getAttribute('aria-checked'), 'true');
		pass('one full seven-day mutation omits off-day hours; duplicate submits and pending edits are blocked');

		const authoritative = toRows(pending.variables.input.days).map((entry) => entry.dayOfWeek === 'MON' ? { ...entry, startTime: '10:28' } : entry);
		await succeed(pending, 'saveMyTrainerSchedule', authoritative);
		assert.equal(input('MON', 0).value, '10:28');
		assert.equal(saveButton().disabled, true);
		assert.ok(document.querySelector('.schedule-save-status').textContent.includes('Saved'));
		await setTime('MON', 0, '10:27');
		assert.equal(saveButton().disabled, false);
		await setTime('MON', 0, '10:28');
		assert.equal(saveButton().disabled, true);
		pass('server response replaces the draft and resets the authoritative dirty baseline');

		await setTime('MON', 0, '10:20');
		await submit();
		const failedRequest = latest('SaveMyTrainerSchedule');
		await fail(failedRequest, 'Save failed for this test');
		assert.equal(input('MON', 0).value, '10:20');
		assert.ok(document.querySelector('.schedule-request-error').textContent.includes('Save error'));
		assert.equal(saveButton().disabled, false);
		await submit();
		const retried = latest('SaveMyTrainerSchedule');
		assert.deepEqual(retried.variables, failedRequest.variables);
		await succeed(retried, 'saveMyTrainerSchedule', toRows(retried.variables.input.days));
		assert.equal(saveButton().disabled, true);
		pass('mutation failure preserves the draft and manual retry resends the same schedule');

		await setTime('MON', 0, '10:15');
		const readsBefore = requests.filter((request) => request.name === 'GetMyTrainerSchedule').length;
		await act(async () => { userVar({ ...userVar(), memberFullName: 'Refreshed Profile' }); window.dispatchEvent(new dom.window.Event('blur')); window.dispatchEvent(new dom.window.Event('focus')); document.dispatchEvent(new dom.window.Event('visibilitychange')); await tick(); });
		await render('partial');
		assert.equal(input('MON', 0).value, '10:15');
		assert.equal(saveButton().disabled, false);
		assert.equal(document.querySelector('.schedule-identity-name').textContent, 'Refreshed Profile');
		assert.equal(requests.filter((request) => request.name === 'GetMyTrainerSchedule').length, readsBefore);
		pass('same-session profile rerender and focus/visibility events preserve the unsaved draft');

		await render('load-error');
		await fail(latest('GetMyTrainerSchedule'), 'Query failed for this test');
		assert.equal(document.querySelectorAll('.schedule-day').length, 0);
		assert.equal(saveButton().disabled, true);
		assert.ok(document.querySelector('.schedule-load-state').textContent.includes('Load error'));
		const beforeErrorSubmit = mutationCount();
		await submit();
		assert.equal(mutationCount(), beforeErrorSubmit);
		await act(async () => { Simulate.click(document.querySelector('.schedule-load-state button')); await tick(); });
		await succeed(latest('GetMyTrainerSchedule'), 'getMyTrainerSchedule', []);
		assert.equal(document.querySelectorAll('.schedule-day').length, 7);
		assert.equal(saveButton().disabled, true);
		pass('query failure cannot save empty defaults; retry initializes only from a successful result');

		console.log(`Trainer schedule: ${checks} focused checks passed.`);
	} finally {
		await act(async () => root.unmount());
		client.stop();
		dom.window.close();
		delete global.window;
		delete global.document;
		delete global.navigator;
		delete global.IS_REACT_ACT_ENVIRONMENT;
	}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
