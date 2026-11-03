// Read-only browser QA: all GraphQL traffic is intercepted, including session bootstrap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('graphql');
const { trainer, gyms } = require('./test-trainer-gym-access.cjs');
async function main() {
	const { chromium } = require(process.env.GYMFLOW_QA_PLAYWRIGHT || 'playwright');
	const origin = new URL(process.env.GYMFLOW_QA_URL || 'http://localhost:3000');
	assert(['localhost', '127.0.0.1'].includes(origin.hostname));
	assert(fs.existsSync(process.env.GYMFLOW_QA_BROWSER || ''));
	const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-approved-program-browser-'));
	const browser = await chromium.launch({ executablePath: process.env.GYMFLOW_QA_BROWSER, headless: true });
	const context = await browser.newContext();
	const page = await context.newPage();
	const results = [],
		errors = [],
		notices = [],
		requests = [];
	const approved = gyms.slice(0, 2).map((gym) => ({ ...gym }));
	approved[0].gymName = 'LongVenueName'.repeat(8).slice(0, 100);
	approved[0].gymAddress = 'A long physical venue address in Seoul. '.repeat(3).slice(0, 100);
	const unavailable = {
		...gyms[3],
		gymName: 'PreviousVenueName'.repeat(6).slice(0, 100),
		gymAddress: 'Stored physical address. '.repeat(5).slice(0, 100),
	};
	let state = 'create', hold;
	const id = '9'.repeat(24);
	const program = () => ({
		_id: id,
		memberId: trainer._id,
		programRevision: 4,
		programStatus: 'PAUSED',
		programType: 'GROUP_CLASS',
		programCategory: 'MUSCLE_GAIN',
		programName: 'Fixture strength and mobility',
		programLocation: 'SEOUL',
		programAddress: (state === 'unavailable' ? unavailable : approved[0]).gymAddress,
		gymId: (state === 'unavailable' ? unavailable : approved[0])._id,
		gymData: state === 'unavailable' ? unavailable : approved[0],
		programPrice: 45000,
		programDuration: 60,
		programCapacity: 8,
		programDesc: 'Coached movement and strength sessions.',
		programImages: [],
		programViews: 0,
		programLikes: 0,
		programRank: 0,
		createdAt: '2026-10-01T00:00:00Z',
		updatedAt: '2026-10-01T00:00:00Z',
	});
	const token = [
		'eyJhbGciOiJub25lIn0',
		Buffer.from(
			JSON.stringify({
				sub: trainer._id,
				sid: 'b'.repeat(24),
				purpose: 'access',
				exp: Math.floor(Date.now() / 1000) + 3600,
			}),
		).toString('base64url'),
		'fixture',
	].join('.');
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (['error', 'warning'].includes(message.type())) notices.push(message.text());
	});
	await context.route('**/graphql', async (route) => {
		const request = route.request();
		const headers = {
			'access-control-allow-origin': origin.origin,
			'access-control-allow-credentials': 'true',
			'access-control-allow-headers': '*',
		};
		if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
		const body = request.postDataJSON();
		const field = parse(body.query).definitions.find((item) => item.kind === 'OperationDefinition').selectionSet
			.selections[0].name.value;
		requests.push({ field, input: body.variables?.input });
		const send = (data) =>
			route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ data }) });
		if (field === 'refreshSession') return send({ refreshSession: { accessToken: token } });
		if (field === 'getMyMember')
			return send({
				getMyMember: {
					...trainer,
					memberFullName: 'Fixture Trainer',
					memberAuthType: 'PHONE',
					memberPhone: 'fixture-only',
					memberImage: '',
					memberPrograms: 1,
					memberRank: 0,
					memberArticles: 0,
					memberPoints: 0,
					memberLikes: 0,
					memberViews: 0,
					memberComments: 0,
				},
			});
		if (field === 'getTrainerPrograms')
			return send({ getTrainerPrograms: { list: [program()], metaCounter: [{ total: 1 }] } });
		if (field === 'getTrainerReservations')
			return send({ getTrainerReservations: { list: [], metaCounter: [{ total: 0 }] } });
		if (field === 'getMyApprovedGyms') {
			if (state === 'loading')
				await new Promise((resolve) => {
					hold = resolve;
				});
			if (state === 'error')
				return route.fulfill({
					status: 200,
					headers,
					contentType: 'application/json',
					body: JSON.stringify({ errors: [{ message: 'PRIVATE backend diagnostics' }] }),
				});
			const { page: current, limit, search } = body.variables.input;
			const list =
				state === 'empty'
					? []
					: approved.filter((gym) => !search.text || gym.gymName.toLowerCase().includes(search.text.toLowerCase()));
			return send({
				getMyApprovedGyms: {
					list: list.slice((current - 1) * limit, current * limit),
					metaCounter: [{ total: list.length }],
				},
			});
		}
		errors.push('Blocked unexpected operation: ' + field);
		return route.fulfill({ status: 400, headers, body: 'Unexpected operation blocked' });
	});
	const labels = (locale) =>
		JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'gyms.json'), 'utf8')).venue;
	const capture = async (locale, width, current) => {
		const measures = await page.evaluate(() => {
			const shown = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
			const controls = [
				...document.querySelectorAll(
					'.editor-gym-venue input, .editor-gym-venue select, .editor-gym-venue button, .editor-gym-venue a',
				),
			].filter(shown);
			const bad = [
				...document.querySelectorAll(
					'.editor-gym-venue, .editor-gym-current, .editor-gym-current strong, .editor-gym-current span, .editor-gym-results, .editor-gym-venue p, .editor-location-fields',
				),
			]
				.filter(shown)
				.filter((el) => {
					const rect = el.getBoundingClientRect();
					return rect.left < -1 || rect.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2;
				})
				.map((el) => ({ tag: el.tagName, className: el.className, text: el.textContent.slice(0, 50) }));
			return {
				pageOverflow: document.documentElement.scrollWidth > innerWidth,
				bad,
				smallTargets: controls.filter((el) => el.getBoundingClientRect().height < 43).map((el) => el.tagName),
			};
		});
		assert(!measures.pageOverflow, JSON.stringify({ locale, width, current, measures }));
		assert.deepEqual(measures.bad, [], JSON.stringify({ locale, width, current, measures }));
		assert.deepEqual(measures.smallTargets, []);
		await page.locator('.editor-location').scrollIntoViewIfNeeded();
		await page.screenshot({ path: path.join(output, `${locale}-${width}-${current}.png`), fullPage: true });
		results.push({ locale, width, state: current, ...measures });
	};
	try {
		for (const locale of ['en', 'kr', 'ru'])
			for (const width of [1440, 768, 390]) {
				await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
				for (state of ['create', 'approved', 'unavailable', 'empty']) {
					const editing = ['approved', 'unavailable'].includes(state);
					await page.goto(
						origin.origin +
							(locale === 'en' ? '' : '/' + locale) +
							'/mypage?category=addProgram' +
							(editing ? '&programId=' + id : ''),
						{ waitUntil: 'domcontentloaded', timeout: 120000 },
					);
					await page.locator('#program-gym').waitFor({ timeout: 120000 });
					await page.waitForFunction(
						() => document.querySelector('#program-gym-state')?.getAttribute('aria-busy') === 'false',
					);
					if (editing) await page.waitForFunction(() => !document.querySelector('.editor-gym-current [role=status]'));
				assert.equal(await page.locator('.editor-gym-actions a').getAttribute('href'), (locale === 'en' ? '' : '/' + locale) + '/mypage?category=gymAccess');
					if (state === 'create') {
						assert.equal(await page.locator('#program-gym option').count(), 3);
						await page.locator('#program-gym').selectOption(approved[0]._id);
						assert.equal(await page.locator('#program-address').inputValue(), approved[0].gymAddress);
						assert(await page.locator('#program-address').isDisabled());
					} else if (state === 'unavailable') {
						assert((await page.locator('.editor-gym-current').textContent()).includes(labels(locale).accessInactive));
						assert(await page.locator(`#program-gym option[value="${unavailable._id}"]`).isDisabled());
						assert.equal(await page.locator('#program-gym').inputValue(), unavailable._id);
					} else if (state === 'empty') {
						assert((await page.locator('#program-gym-state').textContent()).includes(labels(locale).noApproved));
						assert.equal(await page.locator('#program-gym option').count(), 1);
					}
					await page.locator('#program-gym').focus();
					const outline = await page.locator('#program-gym').evaluate((el) => getComputedStyle(el).outlineWidth);
					assert(parseFloat(outline) >= 2);
					await page.keyboard.press('Tab');
					assert(await page.locator('.editor-gym-actions a').evaluate((el) => el === document.activeElement));
					await capture(locale, width, state);
				}
			}
		await page.setViewportSize({ width: 390, height: 844 });
		for (state of ['error', 'loading']) {
			await page.goto(origin.origin + '/mypage?category=addProgram', { waitUntil: 'domcontentloaded' });
			await page.locator('#program-gym').waitFor();
			await page
				.locator(state === 'error' ? '#program-gym-state [role=alert]' : '#program-gym-state [role=status]')
				.waitFor();
			assert.equal(await page.locator('#program-gym option').count(), 1);
			assert(!(await page.locator('body').textContent()).includes('PRIVATE'));
			await capture('en', 390, state);
			if (state === 'error') {
				state = 'create';
				await page.locator('.editor-gym-actions button').click();
				await page.locator('#program-gym option').nth(2).waitFor({ state: 'attached' });
			} else {
				state = 'create';
				hold?.();
			}
		}
		const common = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/en/common.json'), 'utf8'))[
			'Trainer programs'
		];
		for (state of ['unavailable', 'approved']) {
			await page.goto(
				origin.origin +
					'/mypage?category=myPrograms&input=' +
					encodeURIComponent(JSON.stringify({ page: 1, limit: 5, search: { programStatus: 'PAUSED' } })),
				{ waitUntil: 'domcontentloaded' },
			);
			await page
				.getByRole('button', { name: common['Resume label'].replace('{{name}}', program().programName), exact: true })
				.click();
			const dialog = page.getByRole('dialog');
			await dialog.waitFor();
			const confirm = dialog.getByRole('button', { name: common['Confirm Resume'], exact: true });
			if (state === 'unavailable') {
				await dialog.getByText(labels('en').resumeBlocked, { exact: true }).waitFor();
				assert(await confirm.isDisabled());
			} else await confirm.waitFor({ state: 'visible' });
			if (state === 'approved')
				await page.waitForFunction(
					(text) =>
						[...document.querySelectorAll('[role=dialog] button')].some(
							(el) => el.textContent === text && !el.disabled,
						),
					common['Confirm Resume'],
				);
			await dialog.getByRole('button', { name: common.Cancel, exact: true }).click();
		}
		assert.deepEqual(errors, []);
		assert(!requests.some(({ field }) => /create|update|submit|revoke|review|getGyms/.test(field)));
		fs.writeFileSync(
			path.join(output, 'results.json'),
			JSON.stringify({ results, errors, notices: [...new Set(notices)], requests }, null, 2),
		);
		console.log(
			`${results.length} responsive captures passed; approved/unavailable reactivation controls passed. All GraphQL intercepted. Artifacts: ${output}`,
		);
		console.log('Browser notices: ' + JSON.stringify([...new Set(notices)]));
	} finally {
		state = 'create';
		hold?.();
		await context.close();
		await browser.close();
	}
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
