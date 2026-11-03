// Uses the existing disposable Nest/Mongo fixture. Never loads application DB configuration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
function load(file, cache = new Map()) {
	file = path.resolve(base, file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
	}).outputText;
	const module = { exports: {} };
	cache.set(file, module.exports);
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
		(name) => (name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts', cache) : require(name)),
		module,
		module.exports,
	);
	return module.exports;
}
let checks = 0;
const output = console.log;
const pass = (name) => {
	checks++;
	output('PASS ' + name);
};
async function main() {
	const helpers = load('libs/program-gym.ts');
	const forms = load('libs/program.ts');
	const query = require('./check-graphql.cjs')
		.collectDocuments()
		.find((doc) => doc.name === 'GET_MY_APPROVED_GYMS');
	assert(query.query.includes('TrainerApprovedGymsInquiry!'));
	assert(query.query.includes('getMyApprovedGyms(input: $input)'));
	for (const file of ['libs/components/program/ProgramGymSelector.tsx', 'libs/program-gym.ts']) {
		const source = fs.readFileSync(path.join(base, file), 'utf8');
		assert(!source.includes('GET_GYMS') && !source.includes('GET_MY_TRAINER_GYM_ACCESSES'));
		assert(!/['"][a-f\d]{24}['"]|\b(?:memberPassword|password)\b/i.test(source));
	}
	pass('exact owner contract; no public catalog/history authorization join or live QA identities');
	const pages = [];
	const client = {
		query: async (request) => {
			assert.equal(request.fetchPolicy, 'no-cache');
			assert.equal(request.context.handleErrorLocally, true);
			assert.deepEqual(Object.keys(request.variables.input).sort(), ['limit', 'page', 'search']);
			pages.push(request.variables.input.page);
			return {
				data: {
					getMyApprovedGyms: {
						list: [{ _id: pages.length === 2 ? 'target' : 'other' }],
						metaCounter: [{ total: 101 }],
					},
				},
			};
		},
	};
	assert.equal((await helpers.findApprovedProgramGym(client, 'target'))._id, 'target');
	assert.deepEqual(pages, [1, 2]);
	pass('current Gym verification scans beyond the first hundred independently of selector search');
	let reads = 0,
		current = true;
	assert.equal(
		await helpers.findApprovedProgramGym(
			{
				query: async () => {
					reads++;
					current = false;
					return { data: { getMyApprovedGyms: { list: [], metaCounter: [{ total: 300 }] } } };
				},
			},
			'target',
			() => current,
		),
		null,
	);
	assert.equal(reads, 1);
	await assert.rejects(() =>
		helpers.readApprovedProgramGyms({ query: async () => ({ data: {} }) }, { page: 1, limit: 20, search: {} }),
	);
	await assert.rejects(() =>
		helpers.findApprovedProgramGym(
			{ query: async () => ({ data: { getMyApprovedGyms: { list: [], metaCounter: [{ total: 101 }] } } }) },
			'target',
		),
	);
	pass('obsolete responses stop pagination; malformed/incomplete reads fail closed');
	const locales = ['en', 'kr', 'ru'].map(
		(locale) => JSON.parse(fs.readFileSync(path.join(base, 'public/locales', locale, 'gyms.json'), 'utf8')).venue,
	);
	for (const locale of locales) {
		assert.deepEqual(Object.keys(locale).sort(), Object.keys(locales[0]).sort());
		for (const key of [
			'manage',
			'noApproved',
			'accessInactive',
			'resumeBlocked',
			'accessError',
			'loading',
			'checkError',
		])
			assert(locale[key]?.trim());
	}
	pass('EN/KR/RU venue namespaces have matching translated state/action keys');
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-approved-program-test-'));
	const previousCwd = process.cwd();
	let fixture;
	try {
		process.chdir(temporary);
		console.log = () => {};
		fixture = await require('./test-trainer-reservations.cjs').createFixture();
		const { db, gql, trainer, otherTrainer, user, admin, programs, reservations } = fixture;
		const backRequire = require('node:module').createRequire(path.join(base, '../gymflow/package.json'));
		const schema = fixture.app.get(backRequire('@nestjs/graphql').GraphQLSchemaHost).schema;
		const { parse, validate } = backRequire('graphql');
		const documents = require('./check-graphql.cjs').collectDocuments();
		for (const doc of documents)
			assert.deepEqual(
				validate(schema, parse(doc.query)).map((error) => error.message),
				[],
				doc.name,
			);
		pass(documents.length + ' frontend documents validate against the real current Nest schema');
		const gyms = db.model('Gym'),
			accesses = db.model('TrainerGymAccess');
		const statuses = ['APPROVED', 'APPROVED', 'PENDING', 'REJECTED', 'REVOKED', 'ABSENT', 'OTHER_OWNER', 'INACTIVE'];
		const venues = [];
		for (const [index, status] of statuses.entries()) {
			const gym = await gyms.create({
				gymName: 'Isolated venue ' + index,
				gymLocation: index === 1 ? 'BUSAN' : 'SEOUL',
				gymAddress: 'Isolated physical address ' + index,
				gymImages: ['uploads/gym/12345678-1234-4123-8123-123456789abc.webp'],
				gymStatus: status === 'INACTIVE' ? 'PAUSED' : 'ACTIVE',
			});
			venues.push(gym);
			if (status !== 'ABSENT')
				await accesses.create({
					trainerId: status === 'OTHER_OWNER' ? otherTrainer._id : trainer._id,
					gymId: gym._id,
					status: ['OTHER_OWNER', 'INACTIVE'].includes(status) ? 'APPROVED' : status,
					relationshipType: 'FACILITY_PERMISSION',
					requestNote: 'Isolated coaching permission.',
				});
		}
		const inquiry = { page: 1, limit: 20, search: {} };
		const result = await gql('GET_MY_APPROVED_GYMS', inquiry);
		assert.equal(result.errors, undefined);
		assert.deepEqual(
			result.data.getMyApprovedGyms.list.map((gym) => gym._id).sort(),
			venues
				.slice(0, 2)
				.map((gym) => String(gym._id))
				.sort(),
		);
		pass('real owner query returns multiple APPROVED ACTIVE Gyms only');
		for (const status of ['PENDING', 'REJECTED', 'REVOKED', 'ABSENT', 'OTHER_OWNER', 'INACTIVE']) {
			assert(
				!result.data.getMyApprovedGyms.list.some((gym) => gym._id === String(venues[statuses.indexOf(status)]._id)),
			);
			pass('real query excludes ' + status);
		}
		for (const member of [null, user, admin])
			assert((await gql('GET_MY_APPROVED_GYMS', inquiry, member)).errors?.length);
		assert.equal(
			(await gql('GET_MY_APPROVED_GYMS', { ...inquiry, search: { text: 'venue 1' } })).data.getMyApprovedGyms.list
				.length,
			1,
		);
		assert.equal(
			(await gql('GET_MY_APPROVED_GYMS', { ...inquiry, search: { text: 'nothing' } })).data.getMyApprovedGyms
				.metaCounter[0].total,
			0,
		);
		pass('guest/USER/Admin denied owner query; literal search and truthful zero results');
		const baseInput = {
			programType: 'GROUP_CLASS',
			programCategory: 'MUSCLE_GAIN',
			programLocation: 'SEOUL',
			programName: 'Isolated linked program',
			programPrice: 100,
			programDuration: 60,
			programCapacity: 10,
			programImages: ['uploads/program/fixture.webp'],
			programAddress: venues[0].gymAddress,
			gymId: String(venues[0]._id),
		};
		const created = await gql('CREATE_PROGRAM', { ...baseInput, createRequestId: require('node:crypto').randomUUID() });
		assert.equal(created.errors, undefined, JSON.stringify(created.errors));
		const id = created.data.createProgram._id;
		assert.equal(String((await programs.findById(id)).gymId), baseInput.gymId);
		pass('real approved linked Create accepts synchronized Gym/location/address and idempotency key');
		await accesses.updateOne({ trainerId: trainer._id, gymId: venues[0]._id }, { $set: { status: 'REVOKED' } });
		const original = await programs.findById(id).lean();
		const metadata = forms.programUpdatePayload({ ...baseInput, programDesc: 'Changed description only.' }, baseInput);
		for (const key of ['gymId', 'programLocation', 'programAddress']) assert(!Object.hasOwn(metadata, key));
		const updated = await gql('UPDATE_PROGRAM', { ...metadata, _id: id, expectedRevision: 0 });
		assert.equal(updated.errors, undefined, JSON.stringify(updated.errors));
		const stored = await programs.findById(id).lean();
		assert.equal(String(stored.gymId), String(original.gymId));
		assert.equal(stored.programLocation, original.programLocation);
		assert.equal(stored.programAddress, original.programAddress);
		assert.equal(stored.programRevision, 1);
		pass(
			'real revoked-access description-only update preserves stored Gym/location/address and advances expectedRevision',
		);
		const stale = await gql('CREATE_PROGRAM', { ...baseInput, createRequestId: require('node:crypto').randomUUID() });
		assert(stale.errors.some((error) => error.message === 'Program owner is not authorized to use this Gym'));
		assert.equal(forms.programCreateError({ graphQLErrors: stale.errors }), 'access');
		pass('stale approved selection is rejected by TG-B3 and classified for localized feedback');
		assert.equal(
			(await gql('UPDATE_PROGRAM', { _id: id, expectedRevision: 1, programStatus: 'PAUSED' })).errors,
			undefined,
		);
		assert((await gql('UPDATE_PROGRAM', { _id: id, expectedRevision: 2, programStatus: 'ACTIVE' })).errors?.length);
		pass('revoked relation permits pause and rejects linked reactivation');
		const target = venues[1];
		assert.equal(
			(
				await gql('UPDATE_PROGRAM', {
					_id: id,
					expectedRevision: 2,
					gymId: String(target._id),
					programLocation: target.gymLocation,
					programAddress: target.gymAddress,
				})
			).errors,
			undefined,
		);
		assert.equal(
			(await gql('UPDATE_PROGRAM', { _id: id, expectedRevision: 3, programStatus: 'ACTIVE' })).errors,
			undefined,
		);
		pass('explicit switch to another approved Gym and linked reactivation succeed');
		await reservations.create({
			memberId: user._id,
			trainerId: trainer._id,
			programId: id,
			reservationDate: '2099-01-01',
			startTime: '09:00',
			endTime: '10:00',
			reservationStatus: 'PENDING',
		});
		const locked = await gql('UPDATE_PROGRAM', { _id: id, expectedRevision: 4, gymId: null });
		assert(locked.errors.some((error) => /cannot be changed while upcoming reservations exist/.test(error.message)));
		assert.equal(forms.programUpdateError({ graphQLErrors: locked.errors }), 'venue');
		await reservations.deleteMany({ programId: id });
		assert.equal((await gql('UPDATE_PROGRAM', { _id: id, expectedRevision: 4, gymId: null })).errors, undefined);
		assert.equal((await programs.findById(id)).gymId, null);
		pass('reservation lock rejects venue changes even with approval; explicit unlink succeeds after lock ends');
		for (const online of [false, true]) {
			const input = {
				...baseInput,
				gymId: null,
				...(online ? { programType: 'ONLINE', programLocation: 'ONLINE', programAddress: null } : {}),
				createRequestId: require('node:crypto').randomUUID(),
			};
			assert.equal((await gql('CREATE_PROGRAM', input)).errors, undefined);
		}
		pass('independent physical and ONLINE Create need no approved access');
		const adminDenied = await gql(
			'UPDATE_PROGRAM_BY_ADMIN',
			{
				_id: id,
				expectedRevision: 5,
				gymId: baseInput.gymId,
				programLocation: 'SEOUL',
				programAddress: venues[0].gymAddress,
			},
			admin,
		);
		assert(adminDenied.errors?.some((error) => error.message === 'Program owner is not authorized to use this Gym'));
		pass('Admin venue change still uses Program owner authorization, never Admin access');
	} finally {
		if (fixture) await fixture.stop();
		console.log = output;
		process.chdir(previousCwd);
		assert.equal(path.dirname(temporary), os.tmpdir());
		fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5 });
	}
	output(checks + ' approved Program Gym checks passed. Application databases were not used.');
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
