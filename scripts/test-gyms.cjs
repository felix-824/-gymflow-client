const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { buildClientSchema, getIntrospectionQuery, parse, print, validate } = require('graphql');
const { collectDocuments } = require('./check-graphql.cjs');

const root = path.resolve(__dirname, '..');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function loadTs(file, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	const localRequire = (name) => name.startsWith('.') ? loadTs(path.resolve(path.dirname(file), name + '.ts'), cache) : require(name);
	vm.runInThisContext('(function(require,module,exports){' + output + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}
const { readGymsInquiry, initialGymsInquiry } = loadTs(path.join(root, 'libs/gym.ts'));
const { readProgramsInquiry, readTrainersInquiry, initialProgramsInquiry } = loadTs(path.join(root, 'libs/program.ts'));
const { normalizeGymOpeningHours } = loadTs(path.join(root, 'libs/admin-gyms.ts'));
const { GymStatus, GymLocation, GymAmenity } = loadTs(path.join(root, 'libs/enums/gym.enum.ts'));
const { TrainerScheduleDayOfWeek } = loadTs(path.join(root, 'libs/enums/trainer-schedule.enum.ts'));
const weekdays = Object.values(TrainerScheduleDayOfWeek);
const gymId = 'ABCDEF0123456789abcdef01';
const trainerDefault = { page: 1, limit: 9, sort: 'createdAt', direction: 'DESC', search: {} };
const roundTrip = (value) => JSON.parse(JSON.stringify(value));

check('public Gym normalizer preserves multiple locations and amenities, deduplicating valid enums', () => {
	const input = { page: 2, limit: 12, sort: 'updatedAt', direction: 'ASC', search: {
		text: '  Strength  ', locationList: ['SEOUL', 'BUSAN', 'SEOUL', 'ONLINE'], amenities: ['WIFI', 'SHOWER', 'WIFI', 'POOL'],
	} };
	const before = JSON.stringify(input);
	assert.deepEqual(roundTrip(readGymsInquiry(JSON.stringify(input))), {
		page: 2, limit: 12, sort: 'updatedAt', direction: 'ASC',
		search: { text: 'Strength', locationList: ['SEOUL', 'BUSAN'], amenities: ['WIFI', 'SHOWER'] },
	});
	assert.equal(JSON.stringify(input), before);
});
check('public Gym normalization strips status and unsupported filters', () => {
	assert.deepEqual(readGymsInquiry({ search: { gymStatus: 'PAUSED', rating: 5, price: 10, distance: 1, openNow: true, trainerCount: 3, programCount: 4 } }), initialGymsInquiry);
});
check('public Gym normalization bounds pagination, sorts, text and invalid arrays', () => {
	const result = readGymsInquiry({ page: 2147483648, limit: 101, sort: 'gymStatus', direction: 'wrong', search: { text: 'x'.repeat(110), locationList: 'SEOUL', amenities: [null, 3] } });
	assert.deepEqual(result, { ...initialGymsInquiry, search: { text: 'x'.repeat(100) } });
	assert.deepEqual(readGymsInquiry({ page: 0, limit: 0, search: null }), initialGymsInquiry);
	assert.deepEqual(readGymsInquiry({ search: { locationList: Object.values(GymLocation), amenities: Object.values(GymAmenity) } }).search, { locationList: Object.values(GymLocation), amenities: Object.values(GymAmenity) });
});
check('malformed Gym URL values use an independent fallback search object', () => {
	for (const input of [null, undefined, [], '{invalid']) {
		const result = readGymsInquiry(input);
		assert.deepEqual(result, initialGymsInquiry); assert.notEqual(result.search, initialGymsInquiry.search);
	}
});
for (const [name, normalize, fallback] of [
	['Program', readProgramsInquiry, initialProgramsInquiry], ['Trainer', readTrainersInquiry, trainerDefault],
]) {
	check(name + ' gymId survives URL normalization and GraphQL variable serialization alongside existing filters', () => {
		const search = { text: '  Mobility  ', gymId, ...(name === 'Program' ? { memberId: '123456789012345678901234', locationList: ['SEOUL', 'BUSAN'], typeList: ['PT_1ON1'], pricesRange: { start: 0, end: 500 } } : {}) };
		const withGym = normalize(JSON.stringify({ ...fallback, page: 2, search }), fallback);
		const { gymId: omitted, ...withoutGym } = search;
		const oldResult = normalize({ ...fallback, page: 2, search: withoutGym }, fallback);
		assert.equal(omitted, gymId);
		assert.deepEqual(roundTrip(withGym), { ...oldResult, search: { ...oldResult.search, gymId } });
		assert.equal(withGym.search.text, 'Mobility');
		if (name === 'Program') {
			assert.deepEqual(withGym.search.locationList, ['SEOUL', 'BUSAN']);
			assert.deepEqual(withGym.search.typeList, ['PT_1ON1']);
			assert.deepEqual(withGym.search.pricesRange, { start: 0, end: 500 });
			assert.equal(withGym.search.memberId, search.memberId);
		}
	});
	check(name + ' old no-gym search remains unchanged', () => {
		assert.deepEqual(normalize(fallback, fallback), fallback);
		assert.deepEqual(normalize({ ...fallback, search: { text: '  Yoga  ' } }, fallback), { ...fallback, search: { text: 'Yoga' } });
	});
	check(name + ' absent, null, empty and invalid gym IDs are omitted without coercion or trimming', () => {
		for (const value of [undefined, null, '', ' ', 'invalid', ' ' + gymId, gymId + ' ', 123, { toString: () => gymId }, 'a'.repeat(23), 'g'.repeat(24)]) {
			const result = normalize({ ...fallback, search: { gymId: value, text: 'Yoga' } }, fallback);
			assert.deepEqual(roundTrip(result).search, { text: 'Yoga' });
		}
	});
}
check('shared hours preserve unknown null versus seven closed days in canonical weekday order', () => {
	assert.equal(normalizeGymOpeningHours(null), null);
	const hours = weekdays.map((dayOfWeek) => ({ dayOfWeek, isClosed: true })).reverse();
	const before = JSON.stringify(hours), result = normalizeGymOpeningHours(hours);
	assert.deepEqual(result.map((day) => day.dayOfWeek), ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
	assert.ok(result.every((day) => day.isClosed && day.openTime === null && day.closeTime === null));
	assert.equal(JSON.stringify(hours), before);
});
check('public types accept backend shapes and keep admin lifecycle/search fields separate', () => {
	const file = path.join(root, 'scripts/__public_gym_contract__.ts');
	const source = `
import { Gym, AdminGym, GymOpeningHoursDay, Gyms } from '../libs/types/gym/gym';
import { GymsInquiry, AllGymsInquiry } from '../libs/types/gym/gym.input';
import { GymLocation, GymAmenity, GymStatus } from '../libs/enums/gym.enum';
import { ProgramSearch } from '../libs/types/program/program.input';
import { TrainersInquiry } from '../libs/types/member/member.input';
const inquiry: GymsInquiry = { page: 1, limit: 9, search: { locationList: [GymLocation.SEOUL, GymLocation.BUSAN], amenities: [GymAmenity.WIFI, GymAmenity.SHOWER] } };
const program: ProgramSearch = { gymId: '123456789012345678901234' };
const trainers: TrainersInquiry = { ...inquiry, search: { gymId: program.gymId } };
declare const gym: Gym;
const hours: GymOpeningHoursDay[] | null = gym.openingHours;
const results: Gyms = { list: [gym], metaCounter: [{ total: 1 }] };
const admin: AllGymsInquiry = { ...inquiry, search: { gymStatus: GymStatus.PAUSED } };
declare const adminGym: AdminGym;
const revision: number = adminGym.gymRevision;
// @ts-expect-error public Gym has no status field
gym.gymStatus;
// @ts-expect-error public Gym has no revision field
gym.gymRevision;
// @ts-expect-error public Gym has no deletion metadata
gym.deletedAt;
// @ts-expect-error no public status filter
inquiry.search.gymStatus = GymStatus.ACTIVE;
// @ts-expect-error gymId uses the backend optional string contract
program.gymId = 42;
// @ts-expect-error Trainer gymId uses the same contract
trainers.search.gymId = 42;
`;
	const options = { strict: true, noEmit: true, skipLibCheck: true, types: [], lib: ['lib.dom.d.ts', 'lib.esnext.d.ts'], target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs };
	const host = ts.createCompilerHost(options), original = host.getSourceFile.bind(host);
	host.getSourceFile = (name, ...args) => path.resolve(name) === file ? ts.createSourceFile(file, source, options.target, true) : original(name, ...args);
	const errors = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
	assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
});

function flatten(value, prefix = '', result = {}) {
	for (const [key, entry] of Object.entries(value)) {
		const name = prefix ? prefix + '.' + key : key;
		if (typeof entry === 'object' && entry !== null) flatten(entry, name, result);
		else { assert.equal(typeof entry, 'string'); assert.ok(entry.trim() && !entry.includes('\uFFFD')); result[name] = entry; }
	}
	return result;
}
const locales = {};
for (const language of ['en', 'kr', 'ru']) check(language + ' gyms namespace has translated labels for every location, amenity and weekday', () => {
	const locale = JSON.parse(fs.readFileSync(path.join(root, 'public/locales', language, 'gyms.json'), 'utf8'));
	assert.deepEqual(Object.keys(locale.locations), Object.values(GymLocation));
	assert.deepEqual(Object.keys(locale.amenities), Object.values(GymAmenity));
	assert.deepEqual(Object.keys(locale.weekdays), weekdays);
	locales[language] = flatten(locale);
});
check('EN/KR/RU have exact Gym key and interpolation parity', () => {
	for (const locale of [locales.kr, locales.ru]) {
		assert.deepEqual(Object.keys(locale).sort(), Object.keys(locales.en).sort());
		for (const key of Object.keys(locale)) assert.deepEqual(
			(locale[key].match(/{{[^}]+}}/g) ?? []).sort(),
			(locales.en[key].match(/{{[^}]+}}/g) ?? []).sort(),
			key,
		);
	}
});
check('protected common.json retains its pre-existing SHA-256', () => {
	assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'public/locales/en/common.json'))).digest('hex').toUpperCase(), 'C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A');
});

function readSchema() {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify({ query: getIntrospectionQuery() });
		const request = http.request('http://localhost:3007/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 }, (response) => {
			let data = '';
			response.on('data', (chunk) => { data += chunk; });
			response.on('end', () => { try { const result = JSON.parse(data); assert.ok(!result.errors && result.data, 'Backend introspection must succeed'); resolve(buildClientSchema(result.data)); } catch (error) { reject(error); } });
		});
		request.on('error', reject); request.on('timeout', () => request.destroy(new Error('Backend schema request timed out'))); request.end(body);
	});
}
async function main() {
	const schema = await readSchema();
	for (const [name, values] of Object.entries({ GymStatus, GymLocation, GymAmenity, TrainerScheduleDayOfWeek })) check('live enum matches shared frontend ' + name, () => assert.deepEqual(schema.getType(name).getValues().map((value) => value.name), Object.values(values)));
	check('live public input contract contains no status or unsupported filters', () => {
		const fields = schema.getType('GymsInquiry').getFields(), search = schema.getType('GymSearch').getFields();
		assert.deepEqual(Object.keys(fields).sort(), ['direction', 'limit', 'page', 'search', 'sort']);
		assert.deepEqual(Object.keys(search).sort(), ['amenities', 'locationList', 'text']);
		assert.equal(String(fields.search.type), 'GymSearch!');
		assert.equal(String(search.locationList.type), '[GymLocation!]');
		assert.equal(String(search.amenities.type), '[GymAmenity!]');
		for (const name of ['ProgramSearch', 'TrainerSearch']) assert.equal(String(schema.getType(name).getFields().gymId.type), 'String');
	});
	const documents = collectDocuments().filter((doc) => ['GET_GYMS', 'GET_GYM'].includes(doc.name));
	assert.equal(documents.length, 2);
	for (const doc of documents) check(doc.name + ' operation, variables, complete public selection and privacy match the live backend', () => {
		const ast = parse(doc.query), catalog = doc.name === 'GET_GYMS';
		assert.deepEqual(validate(schema, ast).map((error) => error.message), []);
		const definition = ast.definitions[0], field = definition.selectionSet.selections[0];
		assert.equal(definition.operation, 'query');
		assert.equal(definition.name.value, catalog ? 'GetGyms' : 'GetGym');
		assert.equal(field.name.value, catalog ? 'getGyms' : 'getGym');
		assert.equal(definition.variableDefinitions.length, 1);
		assert.equal(definition.variableDefinitions[0].variable.name.value, catalog ? 'input' : 'gymId');
		assert.equal(print(definition.variableDefinitions[0].type), catalog ? 'GymsInquiry!' : 'String!');
		assert.deepEqual(field.arguments.map((arg) => [arg.name.value, arg.value.name.value]), [[catalog ? 'input' : 'gymId', catalog ? 'input' : 'gymId']]);
		const selection = catalog ? field.selectionSet.selections.find((entry) => entry.name.value === 'list') : field;
		const fields = selection.selectionSet.selections.map((entry) => entry.name.value).sort();
		const expected = ['_id', 'gymName', 'gymLocation', 'gymAddress', 'gymDesc', 'gymImages', 'amenities', 'createdAt', 'updatedAt'];
		assert.deepEqual(fields, [...expected, ...(catalog ? [] : ['gymPhone', 'openingHours'])].sort());
		assert.ok(fields.every((name) => Object.hasOwn(schema.getType('Gym').getFields(), name)));
		assert.ok(!/\b(gymStatus|gymRevision|deletedAt|__v)\b/.test(doc.query));
		if (catalog) {
			assert.deepEqual(field.selectionSet.selections.map((entry) => entry.name.value), ['list', 'metaCounter']);
			assert.deepEqual(field.selectionSet.selections[1].selectionSet.selections.map((entry) => entry.name.value), ['total']);
		} else assert.deepEqual(selection.selectionSet.selections.find((entry) => entry.name.value === 'openingHours').selectionSet.selections.map((entry) => entry.name.value).sort(), ['closeTime', 'dayOfWeek', 'isClosed', 'openTime']);
	});
	console.log(`${checks} public Gym foundation checks passed; ${Object.keys(locales.en).length} keys per locale; 2 public documents validated. Read-only introspection; no mutations.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
