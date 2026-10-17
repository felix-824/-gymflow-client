// Real frontend documents against an isolated Nest server and disposable database.
// No AppModule, DatabaseModule, environment DB URI or scheduler is imported.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const backend = path.resolve(__dirname, '../../gymflow');
const backendRequire = Module.createRequire(path.join(backend, 'package.json'));
const ts = backendRequire('typescript');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
	return originalResolve.call(this, name.startsWith('apps/') ? path.join(backend, name) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => {
	const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true, experimentalDecorators: true, emitDecoratorMetadata: true },
		fileName: filename,
	}).outputText;
	module._compile(output, filename);
};
backendRequire('reflect-metadata');
require(path.join(backend, 'apps/gymflow-api/test/auth-session.fixture.ts'));
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
const { Test } = backendRequire('@nestjs/testing');
const { ValidationPipe } = backendRequire('@nestjs/common');
const { MongooseModule, getConnectionToken } = backendRequire('@nestjs/mongoose');
const { GraphQLModule } = backendRequire('@nestjs/graphql');
const { ApolloDriver } = backendRequire('@nestjs/apollo');
const { JwtService } = backendRequire('@nestjs/jwt');
const { MongoMemoryServer } = backendRequire('mongodb-memory-server');
const { graphqlUploadExpress } = backendRequire('graphql-upload');
const request = backendRequire('supertest');
const { ComponentsModule } = require(path.join(backend, 'apps/gymflow-api/src/components/components.module.ts'));
const { AuthService } = require(path.join(backend, 'apps/gymflow-api/src/components/auth/auth.service.ts'));
const { programPayload } = require('../libs/program.ts');
const { collectDocuments } = require('./check-graphql.cjs');
const documents = collectDocuments();
const operations = Object.fromEntries(documents.filter((item) => item.name !== 'inline-upload').map((item) => [item.name, item.query]));
let app, mongo, checks = 0;
const previousCwd = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-frontend-test-'));
process.chdir(temporary);
const realLog = console.log;
console.log = () => {}; // Backend resolver debug output can contain test access tokens.
function pass(name) { checks++; realLog('PASS ' + name); }
async function gql(name, input, token, allowErrors = false) {
	if (!operations[name]) throw new Error('Unknown frontend operation ' + name);
	const req = request(app.getHttpServer()).post('/graphql').set('Apollo-Require-Preflight', 'true');
	if (token) req.set('Authorization', 'Bearer ' + token);
	const response = await req.send({ query: operations[name], variables: input === undefined ? {} : { input } });
	assert.ok([200, 400].includes(response.status), 'Unexpected HTTP status ' + response.status);
	if (allowErrors) { assert.ok(response.body.errors?.length, name + ' should fail'); return response.body; }
	assert.equal(response.body.errors, undefined, name + ': ' + JSON.stringify(response.body.errors));
	return response.body.data;
}
async function main() {
	const fixturePng = await backendRequire('sharp')({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
	mongo = await MongoMemoryServer.create({
		instance: { ip: '127.0.0.1', dbName: 'gymflow_frontend_test' },
		binary: { version: '8.2.6', downloadDir: path.join(backend, '.tmp/mongodb-binaries') },
	});
	const module = await Test.createTestingModule({
		imports: [
			MongooseModule.forRoot(mongo.getUri(), { serverSelectionTimeoutMS: 5000 }),
			ComponentsModule,
			GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true, context: ({ req, res }) => ({ req, res }) }),
		],
	}).overrideProvider(JwtService).useValue(new JwtService({ secret: 'frontend-disposable-test', signOptions: { expiresIn: '1h' } })).compile();
	app = module.createNestApplication({ logger: false });
	app.useGlobalPipes(new ValidationPipe());
	app.use(graphqlUploadExpress({ maxFileSize: 15000000, maxFiles: 10 }));
	await app.init();
	const connection = module.get(getConnectionToken());
	await Promise.all(Object.values(connection.models).map((model) => model.init()));
	const members = connection.model('Member');
	const auth = module.get(AuthService);
	async function signup(nick, type, phone) {
		return (await gql('SIGN_UP', { memberNick: nick, memberPassword: 'pass123', memberPhone: phone, memberType: type })).signup;
	}
	const trainer = await signup('trainer', 'TRAINER', '111');
	const other = await signup('other', 'TRAINER', '222');
	const user = await signup('user', 'USER', '333');
	const admin = await members.create({ memberNick: 'admin', memberPhone: '444', memberPassword: 'fixture', memberType: 'ADMIN' });
	const adminToken = await auth.createToken(admin);
	const trainerToken = trainer.accessToken, userToken = user.accessToken;
	const login = (await gql('LOGIN', { memberNick: 'trainer', memberPassword: 'pass123' })).login;
	assert.equal(login.memberType, 'TRAINER');
	const claims = JSON.parse(Buffer.from(login.accessToken.split('.')[1], 'base64url').toString());
	assert.equal(claims.sub, trainer._id); assert.equal(claims.memberNick, undefined);
	await gql('CHECK_AUTH', undefined, trainerToken);
	assert.equal((await gql('GET_MEMBER', trainer._id, trainerToken)).getMember.memberNick, 'trainer');
	pass('signup/login/checkAuth/getMember use the new JWT and Member contract');
	await gql('SIGN_UP', { memberNick: 'evil', memberPassword: 'pass123', memberPhone: '555', memberType: 'ADMIN' }, undefined, true);
	await gql('UPDATE_MEMBER', { _id: user._id, memberType: 'ADMIN' }, userToken, true);
	const profile = (await gql('UPDATE_MEMBER', { memberAddress: 'Seoul city', memberFullName: 'Test Trainer' }, trainerToken)).updateMember;
	assert.equal(profile.memberFullName, 'Test Trainer');
	pass('self-profile updates exclude administrative fields');

	const input = programPayload({ programName: 'Strength session', programType: 'PT_1ON1', programCategory: 'MUSCLE_GAIN', programLocation: 'SEOUL', programAddress: 'Seoul gym', programPrice: 0, programDuration: 60, programCapacity: 1, programImages: ['uploads/program/test.png'] });
	await gql('CREATE_PROGRAM', input, undefined, true);
	await gql('CREATE_PROGRAM', input, userToken, true);
	const created = (await gql('CREATE_PROGRAM', input, trainerToken)).createProgram;
	const programId = created._id;
	assert.equal(created.programPrice, 0); assert.equal(created.memberId, trainer._id);
	for (const patch of [{ programPrice: -1 }, { programDuration: 0 }, { programCapacity: 2 }, { programType: 'ONLINE' }, { programAddress: null }]) {
		await gql('CREATE_PROGRAM', { ...input, ...patch }, trainerToken, true);
	}
	await gql('UPDATE_PROGRAM', { _id: programId, programName: 'Forbidden' }, other.accessToken, true);
	pass('program creation, free pricing, numeric/domain validation and ownership');
	const online = (await gql('CREATE_PROGRAM', programPayload({ ...input, programName: 'Online yoga', programType: 'ONLINE', programLocation: 'ONLINE', programCategory: 'YOGA', programAddress: '', programCapacity: 5 }), trainerToken)).createProgram;
	const inquiry = { page: 1, limit: 1, sort: 'programPrice', direction: 'ASC', search: { memberId: trainer._id } };
	const catalog = (await gql('GET_PROGRAMS', inquiry)).getPrograms;
	assert.equal(catalog.list.length, 1); assert.equal(catalog.metaCounter[0].total, 2);
	const filtered = (await gql('GET_PROGRAMS', { ...inquiry, limit: 10, search: { categoryList: ['YOGA'], typeList: ['ONLINE'], locationList: ['ONLINE'], pricesRange: { start: 0, end: 0 }, text: 'yoga' } })).getPrograms;
	assert.equal(filtered.list[0]._id, online._id);
	assert.equal((await gql('GET_TRAINERS', { page: 1, limit: 10, sort: 'memberRank', search: {} })).getTrainers.list.length, 2);
	await gql('GET_PROGRAM', programId, userToken);
	assert.equal((await gql('GET_VISITED', { page: 1, limit: 6 }, userToken)).getVisited.list[0]._id, programId);
	await gql('LIKE_TARGET_PROGRAM', programId, userToken);
	assert.equal((await gql('GET_FAVORITES', { page: 1, limit: 6 }, userToken)).getFavorites.list[0]._id, programId);
	await gql('LIKE_TARGET_PROGRAM', programId, userToken);
	assert.equal((await gql('GET_FAVORITES', { page: 1, limit: 6 }, userToken)).getFavorites.list.length, 0);
	pass('public filters/sorting/pagination/trainers and like/unlike/favorites/history');
	await gql('UPDATE_PROGRAM', { _id: programId, programStatus: 'PAUSED' }, trainerToken);
	await gql('GET_PROGRAM', programId, trainerToken, true);
	const management = (await gql('GET_TRAINER_PROGRAMS', { page: 1, limit: 5, search: { programStatus: 'PAUSED' } }, trainerToken)).getTrainerPrograms;
	assert.equal(management.list[0]._id, programId);
	await gql('UPDATE_PROGRAM', { _id: programId, programName: 'Edited while paused', programDesc: 'Description to clear' }, trainerToken);
	assert.equal((await gql('UPDATE_PROGRAM', { _id: programId, programDesc: null }, trainerToken)).updateProgram.programDesc, null);
	await gql('UPDATE_PROGRAM', { _id: programId, programStatus: 'ACTIVE' }, trainerToken);
	pass('paused programs load/edit through management and resume safely');

	const article = (await gql('CREATE_BOARD_ARTICLE', { articleCategory: 'FREE', articleTitle: 'Training ideas', articleContent: '<p>Share training ideas.</p>' }, userToken)).createBoardArticle;
	const comment = (await gql('CREATE_COMMENT', { articleId: article._id, commentContent: 'Useful article' }, trainerToken)).createComment;
	assert.equal(comment.articleId, article._id);
	assert.equal((await gql('GET_COMMENTS', { page: 1, limit: 5, search: { articleId: article._id } })).getComments.list[0]._id, comment._id);
	await gql('UPDATE_COMMENT', { _id: comment._id, commentContent: 'Updated comment' }, trainerToken);
	await gql('LIKE_TARGET_BOARD_ARTICLE', article._id, trainerToken);
	await gql('SUBSCRIBE', trainer._id, userToken);
	await gql('UNSUBSCRIBE', trainer._id, userToken);
	await gql('UPDATE_COMMENT', { _id: comment._id, commentStatus: 'DELETE' }, trainerToken);
	pass('article comments, article likes and follow/unfollow preserve working flows');

	const uploadDocument = documents.find((item) => item.name === 'inline-upload' && item.file.includes('AddNewProgram'));
	for (const size of [1, 3, 5]) {
		const variables = { files: Array(size).fill(null), target: 'program' };
		const map = Object.fromEntries(Array.from({ length: size }, (_, index) => [String(index), ['variables.files.' + index]]));
		let req = request(app.getHttpServer()).post('/graphql').set('Authorization', 'Bearer ' + trainerToken).set('apollo-require-preflight', 'true')
			.field('operations', JSON.stringify({ query: uploadDocument.query, variables })).field('map', JSON.stringify(map));
		for (let index = 0; index < size; index++) req = req.attach(String(index), fixturePng, { filename: 'image' + index + '.png', contentType: 'image/png' });
		const response = await req;
		assert.equal(response.body.errors, undefined, JSON.stringify(response.body.errors));
		assert.equal(response.body.data.imagesUploader.length, size);
		for (const image of response.body.data.imagesUploader) assert.ok(fs.existsSync(path.join(temporary, image)));
	}
	const singleUpload = documents.find((item) => item.name === 'inline-upload' && item.file.includes('MyProfile'));
	for (const target of ['member', 'article']) {
		const response = await request(app.getHttpServer()).post('/graphql').set('Authorization', 'Bearer ' + userToken).set('apollo-require-preflight', 'true')
			.field('operations', JSON.stringify({ query: singleUpload.query, variables: { file: null, target } })).field('map', JSON.stringify({ '0': ['variables.file'] }))
			.attach('0', fixturePng, { filename: 'profile.png', contentType: 'image/png' });
		assert.equal(response.body.errors, undefined, JSON.stringify(response.body.errors));
		assert.ok(response.body.data.imageUploader.startsWith('uploads/' + target + '/'));
	}
	pass('actual multipart upload documents accept 1/3/5 files and all supported targets');

	await gql('REMOVE_PROGRAM_BY_ADMIN', programId, adminToken, true);
	await gql('UPDATE_PROGRAM_BY_ADMIN', { _id: programId, programStatus: 'PAUSED' }, adminToken);
	await gql('UPDATE_PROGRAM_BY_ADMIN', { _id: programId, programStatus: 'DELETE' }, adminToken);
	assert.ok((await gql('GET_ALL_PROGRAMS_BY_ADMIN', { page: 1, limit: 10, search: { programStatus: 'DELETE' } }, adminToken)).getAllProgramsByAdmin.list.some((program) => program._id === programId));
	await gql('UPDATE_PROGRAM_BY_ADMIN', { _id: programId, programStatus: 'ACTIVE' }, adminToken, true);
	await gql('UPDATE_PROGRAM', { _id: programId, programStatus: 'ACTIVE' }, trainerToken, true);
	await gql('REMOVE_PROGRAM_BY_ADMIN', programId, adminToken);
	pass('admin status management and terminal soft-delete/hard-delete sequence');
	await members.updateOne({ _id: trainer._id }, { memberType: 'USER' });
	await gql('CREATE_PROGRAM', input, trainerToken, true);
	assert.equal((await gql('GET_MEMBER', trainer._id, trainerToken)).getMember.memberType, 'USER');
	await members.updateOne({ _id: trainer._id }, { memberStatus: 'BLOCK' });
	await gql('CHECK_AUTH', undefined, trainerToken, true);
	const expired = new JwtService({ secret: 'frontend-disposable-test' }).sign({ sub: user._id }, { expiresIn: -1 });
	await gql('CHECK_AUTH', undefined, expired, true);
	pass('changed server roles, blocked accounts and expired tokens are enforced');
	realLog(checks + ' disposable integration groups passed with actual frontend documents.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
	await app?.close();
	await mongo?.stop();
	process.chdir(previousCwd);
	// Only the exact directory created by this script is removed.
	if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('gymflow-frontend-test-')) throw new Error('Unexpected cleanup target');
	fs.rmSync(temporary, { recursive: true, force: true });
	console.log = realLog;
	Module._resolveFilename = originalResolve;
});
