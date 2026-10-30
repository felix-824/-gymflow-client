const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { buildClientSchema, getIntrospectionQuery, parse, validate } = require('graphql');
const { collectDocuments } = require('./check-graphql.cjs');

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
const root = path.resolve(__dirname, '..');
const helpers = loadTs(path.join(root, 'libs/admin-gyms.ts'));
const { GymStatus, GymLocation, GymAmenity } = loadTs(path.join(root, 'libs/enums/gym.enum.ts'));
const { TrainerScheduleDayOfWeek } = loadTs(path.join(root, 'libs/enums/trainer-schedule.enum.ts'));
const weekdays = Object.values(TrainerScheduleDayOfWeek);
const image = (index) => `uploads/gym/10000000-0000-4000-8000-${String(index).padStart(12, '0')}.png`;
const valid = () => ({ gymName: ' Test Gym ', gymLocation: GymLocation.SEOUL, gymAddress: ' Seoul address ', gymImages: [image(1)] });
const week = () => weekdays.map((dayOfWeek) => ({ dayOfWeek, isClosed: false, openTime: '08:00', closeTime: '21:00' }));
const failure = (message) => ({ graphQLErrors: [{ message }] });

check('Gym statuses are exact backend values', () => assert.deepEqual(Object.values(GymStatus), ['ACTIVE', 'PAUSED', 'DELETE']));
check('Gym locations are exact backend values without ONLINE', () => assert.deepEqual(Object.values(GymLocation), ['SEOUL', 'GYEONGGI', 'INCHEON', 'BUSAN', 'DAEGU', 'DAEJEON', 'GWANGJU', 'ETC']));
check('Gym amenities are exact backend values', () => assert.deepEqual(Object.values(GymAmenity), ['PARKING', 'SHOWER', 'LOCKER', 'SAUNA', 'WIFI', 'TOWEL']));
check('blank description and phone become explicit null', () => {
	const payload = helpers.gymPayload({ ...valid(), gymDesc: ' \n ', gymPhone: '\t ' });
	assert.equal(payload.gymDesc, null); assert.equal(payload.gymPhone, null);
});
check('optional text trims useful content and preserves null', () => {
	assert.equal(helpers.normalizeGymOptionalText(' Description '), 'Description');
	for (const value of [null, undefined, '', ' ']) assert.equal(helpers.normalizeGymOptionalText(value), null);
});
check('omitted optional fields stay omitted rather than clearing an edit', () => {
	assert.deepEqual(Object.keys(helpers.gymPayload(valid())).sort(), ['gymAddress', 'gymImages', 'gymLocation', 'gymName']);
});
check('empty amenities stay an empty array', () => assert.deepEqual(helpers.gymPayload({ ...valid(), amenities: [] }).amenities, []));
check('amenities normalize uniquely without changing enum values', () => assert.deepEqual(helpers.normalizeGymAmenities(['PARKING', 'WIFI', 'PARKING']), ['PARKING', 'WIFI']));
check('sparse amenities do not become undefined persisted values', () => {
	assert.throws(() => helpers.normalizeGymAmenities(new Array(1)), /validation.amenities/);
	assert.equal(helpers.gymFormError({ ...valid(), amenities: new Array(1) }), 'validation.amenities');
});
for (const amenities of [null, ['POOL'], 'PARKING']) check('rejects invalid amenities ' + JSON.stringify(amenities), () => {
	assert.throws(() => helpers.normalizeGymAmenities(amenities), /validation.amenities/);
	assert.equal(helpers.gymFormError({ ...valid(), amenities }), 'validation.amenities');
});
check('payload whitelists editable fields and does not mutate input or reorder photos', () => {
	const input = { ...valid(), gymImages: [image(2), image(1)], gymStatus: 'ACTIVE', gymRevision: 9, expectedRevision: 8, deletedAt: 'injected', __v: 3, _id: 'injected' };
	const before = JSON.stringify(input), payload = helpers.gymPayload(input);
	assert.equal(payload.gymName, 'Test Gym'); assert.equal(payload.gymAddress, 'Seoul address');
	assert.deepEqual(payload.gymImages, [image(2), image(1)]); assert.notEqual(payload.gymImages, input.gymImages);
	for (const key of ['gymStatus', 'gymRevision', 'expectedRevision', 'deletedAt', '__v', '_id']) assert.equal(Object.hasOwn(payload, key), false);
	assert.equal(JSON.stringify(input), before);
});
for (const [field, value, key] of [
	['gymName', 'ab', 'name'], ['gymName', 'x'.repeat(101), 'name'], ['gymAddress', '', 'address'],
	['gymLocation', 'ONLINE', 'location'], ['gymDesc', 'abcd', 'description'], ['gymDesc', 'x'.repeat(2001), 'description'],
	['gymPhone', '123456', 'phone'], ['gymPhone', '1'.repeat(16), 'phone'], ['gymPhone', 'abc1234567', 'phone'],
	['gymPhone', '12+3456789', 'phone'], ['gymPhone', ' '.repeat(2) + '+82 (2) 1234-5678' + ' ', null],
]) check('basic field validation ' + field + ' ' + JSON.stringify(value).slice(0, 40), () => {
	assert.equal(helpers.gymFormError({ ...valid(), [field]: value }), key ? 'validation.' + key : null);
});

check('null hours mean unknown, not closed all week', () => {
	assert.equal(helpers.gymOpeningHoursError(null), null); assert.equal(helpers.normalizeGymOpeningHours(null), null);
	const closed = helpers.normalizeGymOpeningHours(week().map((day) => ({ ...day, isClosed: true })));
	assert.equal(closed.length, 7); assert.ok(closed.every((day) => day.isClosed && day.openTime === null && day.closeTime === null));
});
check('seven valid days canonicalize to MON–SUN without mutating input', () => {
	const hours = week().reverse(), before = JSON.stringify(hours);
	assert.equal(helpers.gymOpeningHoursError(hours), null);
	assert.deepEqual(helpers.normalizeGymOpeningHours(hours).map((day) => day.dayOfWeek), weekdays);
	assert.equal(JSON.stringify(hours), before);
});
check('missing weekday is rejected', () => assert.throws(() => helpers.normalizeGymOpeningHours(week().slice(1)), /hours.sevenDays/));
check('duplicate weekday is rejected', () => assert.throws(() => helpers.normalizeGymOpeningHours([week()[0], ...week().slice(0, 6)]), /hours.sevenDays/));
for (const patch of [{ dayOfWeek: 'HOLIDAY' }, { isClosed: 'false' }, { intervals: [['08:00', '12:00']] }]) check('invalid weekday/shape is rejected ' + JSON.stringify(patch), () => {
	const hours = week(); hours[0] = { ...hours[0], ...patch };
	assert.throws(() => helpers.normalizeGymOpeningHours(hours), /hours.sevenDays/);
});
for (const time of ['9:00', '09:0', '09:00:00', '24:00', '23:60', ' 09:00', '09:00\n']) check('strict HH:mm rejects ' + JSON.stringify(time), () => {
	const hours = week(); hours[0].openTime = time;
	assert.equal(helpers.gymOpeningHoursError(hours), 'hours.timeFormat');
});
check('open day requires both times', () => {
	const hours = week(); hours[0].closeTime = '';
	assert.throws(() => helpers.normalizeGymOpeningHours(hours), /hours.requiredTimes/);
});
for (const [openTime, closeTime] of [['09:00', '09:00'], ['22:00', '08:00']]) check('equal/reversed/overnight hours rejected ' + openTime + '–' + closeTime, () => {
	const hours = week(); hours[0] = { ...hours[0], openTime, closeTime };
	assert.equal(helpers.gymOpeningHoursError(hours), 'hours.timeOrder');
});
check('00:00–23:59 is valid without 24:00', () => {
	const hours = week(); hours[0] = { ...hours[0], openTime: '00:00', closeTime: '23:59' };
	assert.equal(helpers.gymOpeningHoursError(hours), null);
});
check('closed days serialize null times even when local draft retained times', () => {
	const hours = week(); hours[0].isClosed = true;
	assert.deepEqual(helpers.normalizeGymOpeningHours(hours)[0], { dayOfWeek: 'MON', isClosed: true, openTime: null, closeTime: null });
	assert.equal(hours[0].openTime, '08:00');
});
check('enabling unknown hours produces blank unconfirmed times, never invented business hours', () => {
	const draft = helpers.createGymOpeningHoursForm(null);
	assert.equal(draft.length, 7); assert.ok(draft.every((day) => day.openTime === '' && day.closeTime === '' && !day.isClosed));
	assert.equal(helpers.gymOpeningHoursError(draft), 'hours.requiredTimes');
});
check('existing hours remain editable without changing saved time values', () => assert.deepEqual(helpers.createGymOpeningHoursForm(week()), week()));

for (const [images, error] of [
	[[], 'photos.minimum'], [[image(1)], null], [Array.from({ length: 5 }, (_, index) => image(index)), null],
	[Array.from({ length: 6 }, (_, index) => image(index)), 'photos.maximum'], [[image(1), image(1)], 'photos.duplicate'],
	[['https://example.com/gym.png'], 'photos.invalidPath'], [['http://example.com/gym.png'], 'photos.invalidPath'],
	[[image(1).replace('uploads/gym/', 'uploads/program/')], 'photos.invalidPath'], [['uploads/gym/../member/photo.png'], 'photos.invalidPath'],
	[['uploads/gym/photo.png'], 'photos.invalidPath'], [[image(1) + '?x=1'], 'photos.invalidPath'],
	[[image(1).replace('.png', '.jpeg')], 'photos.invalidPath'], [[image(1).replace('.png', '.jpg')], null], [[image(1).replace('.png', '.webp')], null],
]) check('image contract ' + JSON.stringify(images).slice(0, 75) + ' => ' + error, () => assert.equal(helpers.gymImagesError(images), error));
check('sparse images do not pass canonical path validation', () => assert.equal(helpers.gymImagesError(new Array(1)), 'photos.invalidPath'));

for (const [message, classification] of [
	['Gym has changed. Refresh and review the latest data.', 'stale'],
	['Gym is busy. Review the latest data before saving again.', 'contention'],
	['Gym location and address cannot change while any Program references it', 'referenced-venue'],
	['Program has changed. Refresh and review the latest data.', 'rejected'],
	['Gym image must reference an existing Gym upload', 'rejected'],
]) check('classifies GraphQL message as ' + classification + ': ' + message, () => assert.equal(helpers.gymUpdateError(failure(message)), classification));
check('generic 409/reason does not imply a Gym conflict', () => assert.equal(helpers.gymUpdateError({ graphQLErrors: [{ message: 'Unrelated', extensions: { code: 'CONFLICT', reason: 'GYM_REVISION_CONFLICT', originalError: { statusCode: 409 } } }] }), 'rejected'));
check('network uncertainty takes precedence over a stale-looking error', () => assert.equal(helpers.gymUpdateError({ ...failure('Gym has changed. Refresh and review the latest data.'), networkError: new Error('Disconnected') }), 'unknown'));
for (const error of [undefined, null, {}, new Error('Gym has changed. Refresh and review the latest data.'), { graphQLErrors: [] }]) check('unconfirmed non-GraphQL errors remain unknown ' + String(error), () => assert.equal(helpers.gymUpdateError(error), 'unknown'));

function flatten(value, prefix = '') {
	return Object.entries(value).flatMap(([key, item]) => typeof item === 'object' && item !== null ? flatten(item, prefix + key + '.') : [[prefix + key, item]]);
}
const locales = Object.fromEntries(['en', 'kr', 'ru'].map((locale) => [locale, Object.fromEntries(flatten(JSON.parse(fs.readFileSync(path.join(root, 'public/locales', locale, 'admin-gyms.json'), 'utf8'))))]));
check('EN/KR/RU contain identical nonempty UTF-8 translation keys', () => {
	for (const values of Object.values(locales)) {
		assert.deepEqual(Object.keys(values).sort(), Object.keys(locales.en).sort());
		for (const text of Object.values(values)) assert.ok(typeof text === 'string' && text.trim() && !text.includes('\uFFFD'));
	}
});
check('translation interpolation placeholders match across locales', () => {
	for (const [key, text] of Object.entries(locales.en)) {
		const variables = (value) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
		for (const locale of ['kr', 'ru']) assert.deepEqual(variables(locales[locale][key]), variables(text), locale + ':' + key);
	}
});
check('enum label keys resolve without translating persisted enum values', () => {
	for (const values of Object.values(locales)) {
		for (const status of Object.values(GymStatus)) assert.ok(values[helpers.gymStatusLabelKeys[status]]);
		for (const amenity of Object.values(GymAmenity)) assert.ok(values[helpers.gymAmenityLabelKey(amenity)]);
		for (const day of weekdays) assert.ok(values['hours.weekdays.' + day]);
	}
	assert.equal(helpers.gymPayload({ ...valid(), amenities: ['WIFI'] }).amenities[0], 'WIFI');
});
check('every helper validation key has a localized message', () => {
	for (const key of ['photos.minimum', 'photos.maximum', 'photos.duplicate', 'photos.invalidPath', 'hours.sevenDays', 'hours.requiredTimes', 'hours.timeFormat', 'hours.timeOrder', 'validation.name', 'validation.location', 'validation.address', 'validation.description', 'validation.phone', 'validation.amenities'])
		for (const values of Object.values(locales)) assert.ok(values[key], key);
});
check('locale contract contains the future list/form/recovery/accessibility sections', () => {
	for (const key of ['navigation.title', 'list.create', 'list.columns.gym', 'list.searchLabel', 'list.locationFilter', 'list.statusFilter', 'list.empty', 'list.filteredEmpty', 'list.retry', 'list.pagination', 'list.previousPage', 'list.nextPage', 'form.createTitle', 'form.editTitle', 'form.viewTitle', 'form.save', 'form.saving', 'form.saved', 'form.back', 'photos.makeCover', 'hours.supplied', 'hours.unknown', 'hours.note', 'lifecycle.confirmBody', 'lifecycle.terminal', 'conflict.stale', 'conflict.busy', 'conflict.reload', 'conflict.discardWarning', 'conflict.unknown', 'conflict.unknownCreate', 'venue.referenced', 'auth.loading', 'auth.forbidden', 'auth.session'])
		for (const values of Object.values(locales)) assert.ok(values[key], key);
});

// Compile a virtual consumer without writing a fixture into the application tree.
check('TypeScript enforces nullability, required revision and server-owned update exclusions', () => {
	const file = path.join(root, 'scripts/__admin-gym-contract-consumer__.ts');
	const source = `
import { GymInput } from '../libs/types/gym/gym.input';
import { GymUpdate } from '../libs/types/gym/gym.update';
import { AdminGym } from '../libs/types/gym/gym';
import { gymPayload } from '../libs/admin-gyms';
declare const base: GymInput;
const nullable: GymInput = { ...base, gymDesc: null, gymPhone: null, openingHours: null, amenities: [] };
// @ts-expect-error Explicit null amenities are rejected by the service.
const badAmenities: GymInput = { ...base, amenities: null };
// @ts-expect-error Revision is required for every update.
const noRevision: GymUpdate = { _id: 'id' };
// @ts-expect-error Business revision is output-only.
const ownedRevision: GymUpdate = { _id: 'id', expectedRevision: 0, gymRevision: 1 };
// @ts-expect-error Deleted timestamp is output-only.
const ownedDelete: GymUpdate = { _id: 'id', expectedRevision: 0, deletedAt: null };
// @ts-expect-error Internal version is not a public output field.
type InternalVersion = AdminGym['__v'];
const update: GymUpdate = { _id: 'id', expectedRevision: 0, openingHours: null, gymDesc: null, amenities: [] };
const payload: GymInput = gymPayload(nullable);
`;
	const options = { strict: true, noEmit: true, skipLibCheck: true, types: [], lib: ['lib.dom.d.ts', 'lib.esnext.d.ts'], target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs };
	const host = ts.createCompilerHost(options), original = host.getSourceFile.bind(host);
	host.getSourceFile = (name, ...args) => path.resolve(name) === file ? ts.createSourceFile(file, source, options.target, true) : original(name, ...args);
	const program = ts.createProgram([file], options, host);
	const errors = ts.getPreEmitDiagnostics(program);
	assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
});

function readSchema() {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify({ query: getIntrospectionQuery() });
		const req = http.request('http://localhost:3007/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 }, (response) => {
			let data = '';
			response.on('data', (chunk) => { data += chunk; });
			response.on('end', () => { try { const result = JSON.parse(data); assert.ok(!result.errors && result.data, 'Backend introspection must succeed'); resolve(buildClientSchema(result.data)); } catch (error) { reject(error); } });
		});
		req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Backend schema request timed out'))); req.end(body);
	});
}
async function main() {
	const schema = await readSchema();
	for (const [name, values] of Object.entries({ GymStatus, GymLocation, GymAmenity, TrainerScheduleDayOfWeek })) check('live backend enum matches frontend ' + name, () => assert.deepEqual(schema.getType(name).getValues().map((value) => value.name), Object.values(values)));
	const operations = {
		GET_ALL_GYMS_BY_ADMIN: ['GetAllGymsByAdmin', 'getAllGymsByAdmin'],
		GET_GYM_BY_ADMIN: ['GetGymByAdmin', 'getGymByAdmin'],
		CREATE_GYM: ['CreateGym', 'createGym'],
		UPDATE_GYM_BY_ADMIN: ['UpdateGymByAdmin', 'updateGymByAdmin'],
	};
	const documents = collectDocuments().filter((document) => Object.hasOwn(operations, document.name));
	assert.equal(documents.length, 4);
	for (const document of documents) check('live backend validates fields and complete AdminGym selection: ' + document.name, () => {
		const ast = parse(document.query);
		assert.deepEqual(validate(schema, ast).map((error) => error.message), []);
		const definition = ast.definitions[0], expected = operations[document.name];
		assert.equal(definition.name.value, expected[0]);
		const operation = definition.selectionSet.selections[0]; assert.equal(operation.name.value, expected[1]);
		const selection = document.name === 'GET_ALL_GYMS_BY_ADMIN' ? operation.selectionSet.selections.find((field) => field.name.value === 'list') : operation;
		assert.deepEqual(selection.selectionSet.selections.map((field) => field.name.value).sort(), Object.keys(schema.getType('AdminGym').getFields()).sort());
		const hours = selection.selectionSet.selections.find((field) => field.name.value === 'openingHours');
		assert.deepEqual(hours.selectionSet.selections.map((field) => field.name.value).sort(), ['closeTime', 'dayOfWeek', 'isClosed', 'openTime']);
		if (document.name === 'GET_ALL_GYMS_BY_ADMIN') assert.deepEqual(operation.selectionSet.selections.find((field) => field.name.value === 'metaCounter').selectionSet.selections.map((field) => field.name.value), ['total']);
	});
	check('live input nullability and required revision match the mirrored contract', () => {
		const fields = schema.getType('GymInput').getFields(), update = schema.getType('GymUpdate').getFields();
		assert.equal(String(fields.gymImages.type), '[String!]!');
		assert.equal(String(fields.openingHours.type), '[GymOpeningHoursDayInput!]');
		assert.equal(String(update.expectedRevision.type), 'Int!'); assert.equal(String(update._id.type), 'String!');
		assert.deepEqual(Object.keys(update).sort(), [...Object.keys(fields), '_id', 'expectedRevision', 'gymStatus'].sort());
		assert.equal(String(schema.getType('AdminGym').getFields().gymRevision.type), 'Int!');
	});
	console.log(`${checks} Admin Gym contract/helper checks passed; ${Object.keys(locales.en).length} translation keys per locale; 4 live-schema documents validated. No mutations executed.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
