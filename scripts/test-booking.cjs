// Booking UI checks. Integration writes use only an owned disposable replica set.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
let checks = 0;
const output = console.log;
const pass = (name) => { checks++; output('PASS ' + name); };
function loadTs(file, mocks = {}, cache = new Map()) {
	file = path.resolve(file);
	if (cache.has(file)) return cache.get(file);
	const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
	const module = { exports: {} }; cache.set(file, module.exports);
	const localRequire = (name) => {
		if (name.endsWith('.css') || name.endsWith('.scss')) return {};
		if (Object.hasOwn(mocks, name)) return mocks[name];
		if (name.startsWith('.')) {
			const resolved = path.resolve(path.dirname(file), name);
			return loadTs(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '.tsx', mocks, cache);
		}
		return require(name);
	};
	vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
	return module.exports;
}
const booking = loadTs(path.join(__dirname, '../libs/booking.ts'));
const { ReservationStatus } = loadTs(path.join(__dirname, '../libs/enums/reservation.enum.ts'));
function unit() {
	assert.deepEqual(Object.values(ReservationStatus), ['PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW']);
	assert.ok(booking.isBookingProgram('PT_1ON1')); assert.ok(booking.isBookingProgram('GROUP_CLASS')); assert.ok(!booking.isBookingProgram('ONLINE'));
	pass('only supported booking types; exact reservation statuses');
	assert.equal(booking.seoulToday(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
	assert.equal(booking.seoulToday(new Date('2026-12-31T14:59:59Z')), '2026-12-31');
	assert.ok(booking.isBookingDate('2028-02-29'));
	for (const date of ['2026-02-29','2026-2-01','2026-04-31','bad']) assert.ok(!booking.isBookingDate(date));
	assert.equal(booking.addBookingDays('2028-02-28', 2), '2028-03-01');
	assert.ok(booking.isBrowsableBookingDate('2026-10-28','2026-10-01'));
	assert.ok(!booking.isBrowsableBookingDate('2026-10-29','2026-10-01'));
	assert.ok(!booking.isBrowsableBookingDate('2026-09-30','2026-10-01'));
	for (const locale of ['en','kr','ru']) assert.ok(booking.formatBookingDate('2026-10-01',locale,{weekday:'long'}));
	pass('Seoul midnight/year/leap boundaries; strict dates; 28-day frontend window; locales');
	const selected = { programId:'abc',reservationDate:'2026-10-01',startTime:'09:00',endTime:'10:00' };
	assert.ok(booking.currentBookingSelection(selected,'abc','2026-10-01',[selected]));
	assert.ok(!booking.currentBookingSelection(selected,'abc','2026-10-02',[selected]));
	assert.ok(!booking.currentBookingSelection(selected,'other','2026-10-01',[selected]));
	assert.ok(!booking.currentBookingSelection(selected,'abc','2026-10-01',[]));
	assert.deepEqual(booking.reservationPayload(selected),{programId:'abc',reservationDate:'2026-10-01',startTime:'09:00'});
	assert.equal(booking.bookingErrorKind({networkError:new Error('lost')}),'unknown');
	assert.equal(booking.bookingErrorKind({graphQLErrors:[{extensions:{originalError:{statusCode:409}}}]}),'conflict');
	assert.equal(booking.bookingErrorKind({graphQLErrors:[{extensions:{code:'FORBIDDEN'}}]}),'rejected');
	pass('stale selections rejected; exact three-field payload; conflict/network classification');
	const en = JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales/en/common.json'),'utf8'));
	for (const locale of ['kr','ru']) {
		const value = JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales',locale,'common.json'),'utf8'));
		assert.deepEqual(Object.keys(value.Booking).sort(),Object.keys(en.Booking).sort());
	}
	pass('EN/KR/RU booking keys match and JSON parses');
}
async function integration() {
	const backend = path.resolve(__dirname,'../../gymflow');
	const backendRequire = Module.createRequire(path.join(backend,'package.json'));
	const originalResolve = Module._resolveFilename, originalTs = require.extensions['.ts'];
	Module._resolveFilename = function(name,...args) { return originalResolve.call(this,name.startsWith('apps/')?path.join(backend,name):name,...args); };
	require.extensions['.ts'] = (module,filename) => module._compile(backendRequire('typescript').transpileModule(fs.readFileSync(filename,'utf8'),{
		fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true,experimentalDecorators:true,emitDecoratorMetadata:true},
	}).outputText,filename);
	backendRequire('reflect-metadata');
	const { fixtureAccessToken } = require(path.join(backend, 'apps/gymflow-api/test/auth-session.fixture.ts'));
	const { Test } = backendRequire('@nestjs/testing');
	const { ValidationPipe } = backendRequire('@nestjs/common');
	const { MongooseModule,getConnectionToken } = backendRequire('@nestjs/mongoose');
	const { GraphQLModule } = backendRequire('@nestjs/graphql');
	const { ApolloDriver } = backendRequire('@nestjs/apollo');
	const { JwtService } = backendRequire('@nestjs/jwt');
	const { MongoMemoryReplSet } = backendRequire('mongodb-memory-server');
	const { ComponentsModule } = require(path.join(backend,'apps/gymflow-api/src/components/components.module.ts'));
	const { collectDocuments } = require('./check-graphql.cjs');
	const operations = Object.fromEntries(collectDocuments().map(d=>[d.name,d.query]));
	const log = console.log, previousDownload = process.env.MONGOMS_RUNTIME_DOWNLOAD;
	let mongo,app,root,client;
	try {
		console.log = () => {}; // Keep backend debug output and test credentials out of reports.
		process.env.MONGOMS_RUNTIME_DOWNLOAD='false';
		mongo = await MongoMemoryReplSet.create({replSet:{count:1,storageEngine:'wiredTiger'},instanceOpts:[{ip:'127.0.0.1'}],binary:{version:'8.2.6',downloadDir:path.join(backend,'.tmp/mongodb-binaries')}});
		const module = await Test.createTestingModule({imports:[MongooseModule.forRoot(mongo.getUri()),ComponentsModule,
			GraphQLModule.forRoot({driver:ApolloDriver,autoSchemaFile:true,context:({req,res})=>({req,res})})]})
			.overrideProvider(JwtService).useValue(new JwtService({secret:'booking-disposable-test',signOptions:{expiresIn:'1h'}})).compile();
		app = module.createNestApplication({logger:false}); app.useGlobalPipes(new ValidationPipe()); await app.listen(0,'127.0.0.1');
		const uri = (await app.getUrl())+'/graphql', db = module.get(getConnectionToken());
		await Promise.all(Object.values(db.models).map(m=>m.init()));
		const members=db.model('Member'),programs=db.model('Program'),schedules=db.model('TrainerSchedule'),reservations=db.model('Reservation');
		const trainer=await members.create({memberNick:'Booking trainer',memberFullName:'Real Fixture Trainer',memberPhone:'test100',memberPassword:'fixture',memberType:'TRAINER'});
		const user=await members.create({memberNick:'Booking user',memberPhone:'test101',memberPassword:'fixture',memberType:'USER'});
		const other=await members.create({memberNick:'Other user',memberPhone:'test102',memberPassword:'fixture',memberType:'USER'});
		const admin=await members.create({memberNick:'Booking admin',memberPhone:'test103',memberPassword:'fixture',memberType:'ADMIN'});
		const sessionTokens = new Map(await Promise.all((await members.find().exec()).map(async (member) => [String(member._id), await fixtureAccessToken(member, app)])));
		const token = (member) => sessionTokens.get(String(member._id));
		const common={memberId:trainer._id,programCategory:'MUSCLE_GAIN',programLocation:'SEOUL',programAddress:'Fixture training room',programPrice:0,programDuration:60,programCapacity:1,programImages:['uploads/program/missing-fixture.jpg'],programDesc:'Real disposable program description'};
		const pt=await programs.create({...common,programName:'Fixture PT session',programType:'PT_1ON1'});
		await programs.collection.updateOne({_id:pt._id},{$set:{programImages:[]}}); // Legacy missing-image presentation case, isolated fixture only.
		const group=await programs.create({...common,programName:'Fixture group session',programType:'GROUP_CLASS',programCapacity:2});
		const online=await programs.create({...common,programName:'Fixture online session',programType:'ONLINE',programLocation:'ONLINE'});
		const { trainerScheduleWeekdays } = require(path.join(backend,'apps/gymflow-api/src/libs/enums/trainer-schedule.enum.ts'));
		for (const day of trainerScheduleWeekdays) await schedules.create({memberId:trainer._id,dayOfWeek:day,startTime:'09:00',endTime:'12:00',isAvailable:true});
		const realFetch=global.fetch;
		async function gql(name,input,member=user) {
			const response=await realFetch(uri,{method:'POST',headers:{'Content-Type':'application/json',...(member?{Authorization:'Bearer '+token(member)}:{})},body:JSON.stringify({query:operations[name],variables:{input}})});
			return response.json();
		}
		const tomorrow=booking.addBookingDays(booking.seoulToday(),1);
		const available=(await gql('GET_PROGRAM_AVAILABILITY',{programId:pt._id.toString(),reservationDate:tomorrow},null)).data.getProgramAvailability;
		assert.equal(available.length,3); assert.deepEqual(Object.keys(available[0]).sort(),['endTime','startTime']);
		assert.equal((await gql('GET_PROGRAM_AVAILABILITY',{programId:group._id.toString(),reservationDate:tomorrow},null)).data.getProgramAvailability.length,3);
		assert.deepEqual((await gql('GET_PROGRAM_AVAILABILITY',{programId:online._id.toString(),reservationDate:tomorrow},null)).data.getProgramAvailability,[]);
		pass('real Nest/replica-set frontend operations: PT, GROUP, ONLINE and minimal slots contract');
		const { JSDOM } = require('jsdom'); const dom=new JSDOM('<div id="test-root"></div>',{url:'http://localhost/program/booking?id='+pt._id});
		global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.HTMLElement=dom.window.HTMLElement;
		global.Image=dom.window.Image;
		global.requestAnimationFrame=fn=>setTimeout(fn,0);global.cancelAnimationFrame=clearTimeout;
		const React=require('react'),{createRoot}=require('react-dom/client'),{flushSync}=require('react-dom');
		const {ApolloClient,ApolloProvider,InMemoryCache,HttpLink}=require('@apollo/client');
		const store=loadTs(path.join(__dirname,'../apollo/store.ts'));
		const texts=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales/en/common.json'),'utf8'));
		const t=(key,values={})=>{let value=key.split('.').reduce((a,k)=>a?.[k],texts)||key;return typeof value==='string'?value.replace(/{{(\w+)}}/g,(_,k)=>values[k]??''):key;};
		let currentToken=token(user),fault='',release,releaseProgram,releaseAvailability,requests=[],responses=[],alerts=[];
		const transport=async(url,options)=>{
			const body=JSON.parse(options.body);requests.push(body);
			if(fault==='availability'&&body.operationName==='GetProgramAvailability'){fault='';throw new Error('Test availability transport interruption');}
			const response=await realFetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+currentToken}});
			if(['GetProgram','LikeTargetProgram'].includes(body.operationName)) {
				const result=await response.clone().json();
				responses.push({operation:body.operationName,status:response.status,likes:result.data?.getProgram?.programLikes,meLiked:result.data?.getProgram?.meLiked,errors:result.errors?.map(e=>e.message)});
			}
			if(body.operationName==='GetProgram'&&fault==='program-hold') await new Promise(r=>{releaseProgram=r;});
			if(body.operationName==='GetProgramAvailability'&&body.variables.input.reservationDate===tomorrow&&fault==='availability-hold') await new Promise(r=>{releaseAvailability=r;});
			if(body.operationName==='CreateReservation'&&fault==='hold') await new Promise(r=>{release=r;});
			if(body.operationName==='CreateReservation'&&fault==='unknown'){fault='';await response.text();throw new Error('Test response lost after write');}
			return response;
		};
		client=new ApolloClient({cache:new InMemoryCache(),link:new HttpLink({uri,fetch:transport})});
		const navigations=[];
		const router={isReady:true,query:{id:pt._id.toString()},locale:'en',push:async href=>{navigations.push(href);return true;}};
		const mocks={
			'next/router':{useRouter:()=>router},'next/link':{__esModule:true,default:({href,children,passHref,...props})=>React.createElement('a',{...props,href:typeof href==='string'?href:href.pathname+'?'+new URLSearchParams(href.query)},children)},
			'next/head':{__esModule:true,default:()=>null},
			'next-i18next':{useTranslation:()=>({t})},'next-i18next/serverSideTranslations':{serverSideTranslations:async()=>({})},
			'../../libs/components/layout/LayoutBooking':{__esModule:true,default:c=>c},'../../apollo/store':store,
			'../../libs/components/layout/LayoutFull':{__esModule:true,default:c=>c},'../../../apollo/store':store,
			'../../libs/auth':{getJwtToken:()=>'',updateUserInfo:async()=>{}},
			'../../libs/sweetAlert':{sweetMixinErrorAlert:async message=>{alerts.push(message);}},
		};
		const Page=loadTs(path.join(__dirname,'../pages/program/booking.tsx'),mocks).default;
		root=createRoot(document.getElementById('test-root'));
		const render=()=>root.render(React.createElement(ApolloProvider,{client},React.createElement(Page)));
		const text=()=>document.body.textContent;
		const until=async(fn)=>{const start=Date.now();while(!fn()){if(Date.now()-start>12000)throw new Error('UI assertion timed out: '+text());await new Promise(r=>setTimeout(r,20));}};
		const click=s=>{const el=document.querySelector(s);assert.ok(el,'Missing '+s);flushSync(()=>el.click());};
		const profile=m=>({_id:m._id.toString(),memberType:m.memberType,memberStatus:'ACTIVE'});
		store.authReadyVar(false);store.authErrorVar('');store.userVar(profile(user));render();await until(()=>text().includes(texts.Booking.Initializing));assert.equal(requests.length,0);
		store.authReadyVar(true);store.userVar({_id:'',memberType:'',memberStatus:''});await until(()=>text().includes(texts.Booking['Login required']));assert.equal(requests.length,0);
		assert.ok(document.querySelector('a[href*="referrer=%2Fprogram%2Fbooking"]'));
		for(const member of [trainer,admin]){store.userVar(profile(member));await until(()=>text().includes(texts.Booking['USER only']));assert.equal(requests.length,0);}
		pass('mounted page: auth initialization, guest referrer and TRAINER/ADMIN guards send no queries');
		fault='program-hold';store.userVar(profile(user));await until(()=>Boolean(releaseProgram));
		assert.ok(text().includes(texts['Program detail']['Loading title']));assert.ok(!document.querySelector('.booking-date-strip'));
		fault='';releaseProgram();await until(()=>document.querySelector('.booking-date-strip button'));
		fault='availability-hold';click('.booking-date-strip button:nth-child(2)');await until(()=>Boolean(releaseAvailability));
		assert.ok(text().includes(texts.Booking['Loading availability']));assert.ok(document.querySelector('.booking-primary').disabled);
		fault='';releaseAvailability();await until(()=>document.querySelectorAll('.booking-slot-grid button').length===3);
		pass('genuinely pending Program/availability requests show loading and disable submission');
		assert.equal(document.querySelectorAll('.booking-slot-grid [aria-pressed="true"]').length,0);
		assert.ok(document.querySelector('.booking-primary').disabled);assert.ok(text().includes('₩0'));assert.ok(document.querySelector('.booking-image-fallback'));
		click('.booking-slot-grid button');assert.ok(document.querySelector('.booking-slot-grid button'));
		await until(()=>document.querySelector('.booking-slot-grid [aria-pressed="true"]'));
		click('.booking-date-strip button:nth-child(3)');
		await until(()=>document.querySelectorAll('.booking-slot-grid button').length===3&&!document.querySelector('.booking-slot-grid [aria-pressed="true"]'));
		pass('real availability renders; no auto-selection; date change clears slot; free fee and missing-image fallback');
		const {getAvailabilityWeekday}=require(path.join(backend,'apps/gymflow-api/src/libs/availability.ts'));
		const emptyDate=booking.addBookingDays(booking.seoulToday(),2),emptyWeekday=getAvailabilityWeekday(emptyDate);
		click('.booking-slot-grid button');await until(()=>document.querySelector('.booking-slot-grid [aria-pressed="true"]'));
		await schedules.updateOne({memberId:trainer._id,dayOfWeek:emptyWeekday},{$set:{isAvailable:false}});
		await client.refetchQueries({include:['GetProgramAvailability']});await until(()=>text().includes(texts.Booking['No slots available']));
		assert.ok(document.querySelector('.booking-primary').disabled);assert.equal(document.querySelectorAll('.booking-slot-grid [aria-pressed="true"]').length,0);
		await schedules.updateOne({memberId:trainer._id,dayOfWeek:emptyWeekday},{$set:{isAvailable:true}});
		pass('real empty refetch clears removed selection, leaves loading and disables booking');
		click('.booking-date-strip button:nth-child(2)');await until(()=>document.querySelectorAll('.booking-slot-grid button').length===3);
		click('.booking-slot-grid button');await until(()=>!document.querySelector('.booking-primary').disabled);
		await gql('CREATE_RESERVATION',{programId:pt._id.toString(),reservationDate:tomorrow,startTime:'09:00'},other);
		click('.booking-primary');await until(()=>text().includes(texts.Booking['Slot changed']));
		await until(()=>document.querySelectorAll('.booking-slot-grid button').length===2);
		assert.equal(document.querySelectorAll('.booking-slot-grid [aria-pressed="true"]').length,0);
		pass('real concurrent PT occupancy returns conflict; selection cleared and availability refreshed');
		fault='hold';click('.booking-slot-grid button');await until(()=>!document.querySelector('.booking-primary').disabled);
		const before=requests.filter(r=>r.operationName==='CreateReservation').length;
		const submitButton=document.querySelector('.booking-primary');flushSync(()=>{submitButton.click();submitButton.click();});await until(()=>Boolean(release));
		assert.ok([...document.querySelectorAll('.booking-date-strip button')].every(e=>e.disabled));
		assert.ok([...document.querySelectorAll('.booking-slot-grid button')].every(e=>e.disabled));
		assert.equal(requests.filter(r=>r.operationName==='CreateReservation').length,before+1);
		fault='';release();await until(()=>document.querySelector('.booking-confirmation'));
		assert.ok(text().includes(texts.Booking.Pending));assert.ok(!document.querySelector('a[href*="bookings"]'));
		const written=requests.filter(r=>r.operationName==='CreateReservation').at(-1).variables.input;
		assert.deepEqual(Object.keys(written).sort(),['programId','reservationDate','startTime']);
		pass('real PENDING create; exact payload; synchronous duplicate protection; submit freezes controls; inline receipt');
		root.unmount();root=createRoot(document.getElementById('test-root'));router.query.id=group._id.toString();render();
		await until(()=>document.querySelector('.booking-date-strip button'));click('.booking-date-strip button:nth-child(4)');await until(()=>document.querySelectorAll('.booking-slot-grid button').length===3);
		const image=document.querySelector('.booking-photo img');assert.ok(image.src.includes('missing-fixture.jpg'));
		flushSync(()=>image.dispatchEvent(new window.Event('error')));await until(()=>document.querySelector('.booking-image-fallback'));
		pass('real image takes priority; broken image switches to neutral fitness fallback');
		fault='availability';click('.booking-date-strip button:nth-child(5)');await until(()=>text().includes(texts.Booking['Availability error']));
		click('.booking-slot-state button');await until(()=>document.querySelectorAll('.booking-slot-grid button').length===3);
		pass('availability network error leaves loading; Retry restores real slots on current date');
		click('.booking-slot-grid button');await until(()=>!document.querySelector('.booking-primary').disabled);click('.booking-primary');
		await until(()=>document.querySelector('.booking-confirmation'));assert.ok(text().includes(group.programName));assert.ok(text().includes(texts.Booking.Pending));
		assert.equal(await reservations.countDocuments({programId:group._id}),1);
		pass('real GROUP selected slot creates PENDING reservation and renders receipt');
		root.unmount();root=createRoot(document.getElementById('test-root'));render();
		await until(()=>document.querySelector('.booking-date-strip button'));click('.booking-date-strip button:nth-child(6)');await until(()=>document.querySelectorAll('.booking-slot-grid button').length===3);
		fault='unknown';click('.booking-slot-grid button');await until(()=>!document.querySelector('.booking-primary').disabled);click('.booking-primary');
		await until(()=>text().includes(texts.Booking['Network outcome unknown']));
		assert.ok(document.querySelector('.booking-primary').disabled);assert.ok([...document.querySelectorAll('.booking-date-strip button')].every(e=>e.disabled));
		assert.equal(await reservations.countDocuments({programId:group._id}),2);
		pass('lost real mutation response is ambiguous; stored reservation exists; page blocks unsafe re-submit');
		root.unmount();root=createRoot(document.getElementById('test-root'));router.query.id=online._id.toString();render();await until(()=>text().includes(texts.Booking['Online unavailable']));
		root.unmount();root=createRoot(document.getElementById('test-root'));router.query.id='bad';render();await until(()=>text().includes(texts['Program detail']['Unavailable title']));
		root.unmount();root=createRoot(document.getElementById('test-root'));router.query={};render();await until(()=>text().includes(texts['Program detail']['Unavailable title']));
		assert.ok(!document.querySelector('.booking-primary'));
		pass('direct route ONLINE/invalid ID states; no availability or booking controls');
		// Mount the unchanged detail and card components against the same real GraphQL server.
		await programs.collection.updateOne({_id:pt._id},{$set:{programImages:['uploads/program/first.jpg','uploads/program/second.jpg']}});
		const Detail=loadTs(path.join(__dirname,'../pages/program/detail.tsx'),mocks).default;
		const renderDetail=()=>root.render(React.createElement(ApolloProvider,{client},React.createElement(Detail)));
		root.unmount();root=createRoot(document.getElementById('test-root'));router.query={id:pt._id.toString()};renderDetail();
		await until(()=>document.querySelector('.detail-save')&&document.querySelectorAll('.detail-thumbnail-list button').length===2);
		assert.ok(document.querySelector('.detail-book-session'));click('.detail-thumbnail-list button:nth-child(2)');
		assert.ok(document.querySelector('.detail-main-image img').src.endsWith('second.jpg'));
		assert.ok(document.querySelector('.detail-trainer-link').href.includes('trainerId='+trainer._id));
		await until(()=>document.querySelector('.detail-related-grid a[href*="id='+group._id+'"]'));
		click('.detail-save');
		let detailSaveIssue='';
		try { await until(()=>document.querySelector('.detail-save')?.getAttribute('aria-pressed')==='true'); }
		catch(error) { detailSaveIssue='Save/Saved regression: '+JSON.stringify({alerts,recentResponses:responses.slice(-4),recentOperations:requests.slice(-5).map(r=>r.operationName),pressed:document.querySelector('.detail-save')?.getAttribute('aria-pressed')});output('FAIL '+detailSaveIssue); }
		if(!detailSaveIssue) { click('.detail-save');await until(()=>document.querySelector('.detail-save')?.getAttribute('aria-pressed')==='false');pass('real Program Detail Save/Saved toggles from authoritative refetch'); }
		assert.ok(document.querySelector('.detail-main-image img').src.endsWith('second.jpg'));
		click('.detail-book-session');assert.equal(navigations.at(-1),'/program/booking?id='+pt._id);
		pass('real Program Detail gallery selection, trainer/related links and PT booking CTA regression');
		root.unmount();root=createRoot(document.getElementById('test-root'));router.query={id:group._id.toString()};renderDetail();await until(()=>document.querySelector('.detail-book-session'));
		root.unmount();root=createRoot(document.getElementById('test-root'));router.query={id:online._id.toString()};renderDetail();await until(()=>document.querySelector('.detail-save'));
		assert.ok(!document.querySelector('.detail-book-session'));
		pass('GROUP detail has booking CTA; ONLINE detail keeps Save without booking CTA');
		if(detailSaveIssue) throw new Error(detailSaveIssue);
	} finally {
		console.log=log;root?.unmount();client?.stop();if(app)await app.close();if(mongo)await mongo.stop();
		Module._resolveFilename=originalResolve;require.extensions['.ts']=originalTs;
		if(previousDownload===undefined)delete process.env.MONGOMS_RUNTIME_DOWNLOAD;else process.env.MONGOMS_RUNTIME_DOWNLOAD=previousDownload;
	}
}
(async()=>{unit();if(process.argv.includes('--integration'))await integration();console.log(checks+' booking checks passed.');})().catch(error=>{console.error(error);process.exitCode=1;});
