// Local frontend only. Every GraphQL request is intercepted; no application DB/session is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('graphql');
const { records, gyms, trainer } = require('./test-trainer-gym-access.cjs');
async function main() {
	const { chromium } = require(process.env.GYMFLOW_QA_PLAYWRIGHT || 'playwright');
	const executablePath = process.env.GYMFLOW_QA_BROWSER;
	assert(executablePath && fs.existsSync(executablePath), 'Set GYMFLOW_QA_BROWSER to an existing browser');
	const origin = new URL(process.env.GYMFLOW_QA_URL || 'http://localhost:3000');
	assert(['localhost', '127.0.0.1'].includes(origin.hostname));
	const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-gym-access-browser-'));
	const results = [],
		errors = [],
		notices = [],
		requests = [];
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
	const browser = await chromium.launch({ executablePath, headless: true });
	const context = await browser.newContext();
	const page = await context.newPage();
	let state = 'full',
		hold,
		memberType = 'TRAINER';
	const rows = records();
	rows[0].gymData.gymName = 'VeryLongVenueName'.repeat(6).slice(0, 100);
	rows[2].rejectionReason = 'LongReasonWithoutSpaces'.repeat(40);
	rows[3].revocationReason = 'Detailed revocation reason. '.repeat(35);
	rows[2].requestNote = 'Request note with long content. '.repeat(30);
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') notices.push(message.text());
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
		requests.push({ field, variables: body.variables });
		const send = (data) =>
			route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ data }) });
		if (field === 'refreshSession') return send({ refreshSession: { accessToken: token } });
		if (field === 'getMyMember')
			return send({
				getMyMember: {
					...trainer,
					memberType,
					memberFullName: 'Fixture Trainer',
					memberAuthType: 'PHONE',
					memberPhone: 'fixture-only',
					memberImage: '',
					memberPrograms: 0,
					memberRank: 0,
					memberArticles: 0,
					memberPoints: 0,
					memberLikes: 0,
					memberViews: 0,
					memberComments: 0,
				},
			});
		if (field === 'getMyTrainerGymAccesses') {
			if (state === 'loading')
				await new Promise((resolve) => {
					hold = resolve;
				});
			if (state === 'error')
				return route.fulfill({
					status: 200,
					headers,
					contentType: 'application/json',
					body: JSON.stringify({ errors: [{ message: 'Private server details must not be shown' }] }),
				});
			const { page: current, limit, search } = body.variables.input;
			const list = state === 'empty' ? [] : rows.filter((row) => !search.gymId || row.gymId === search.gymId);
			return send({
				getMyTrainerGymAccesses: {
					list: list.slice((current - 1) * limit, current * limit),
					metaCounter: [{ total: list.length }],
				},
			});
		}
		if (field === 'getGyms') return send({ getGyms: { list: gyms, metaCounter: [{ total: gyms.length }] } });
		if (field === 'getGym') return send({ getGym: gyms.find((gym) => gym._id === body.variables.gymId) });
		errors.push('Blocked unexpected operation ' + field);
		return route.fulfill({ status: 400, headers, body: 'Unexpected operation blocked' });
	});
	const measure = () =>
		page.evaluate(() => {
			const shown = (element) =>
				Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
			const box = (element) => {
				const rect = element.getBoundingClientRect();
				return {
					left: rect.left,
					right: rect.right,
					width: rect.width,
					height: rect.height,
					top: rect.top,
					bottom: rect.bottom,
				};
			};
			const elements = [
				...document.querySelectorAll(
					'#gym-access-page h1, #gym-access-page h2, #gym-access-page h3, .gym-access-card p, .gym-access-card button, .gym-access-card summary, .gym-access-form-panel input, .gym-access-form-panel select, .gym-access-form-panel textarea, .gym-access-form-panel button, .schedule-desktop-navigation a, .schedule-mobile-navigation a',
				),
			].filter(shown);
			const bad = elements
				.filter((element) => {
					const rect = box(element);
					return rect.left < -1 || rect.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 2;
				})
				.map((element) => ({
					tag: element.tagName,
					text: element.textContent.slice(0, 50),
					...box(element),
					scrollWidth: element.scrollWidth,
					clientWidth: element.clientWidth,
				}));
			const links = [
				...document.querySelectorAll(
					innerWidth < 768 ? '.schedule-mobile-navigation a' : '.schedule-desktop-navigation a',
				),
			].filter(shown);
			const buttons = [...document.querySelectorAll('#gym-access-page button')].filter(shown);
			return {
				pageOverflow: document.documentElement.scrollWidth > innerWidth,
				bad,
				navigationCount: links.length,
				touchTargets: [...links, ...buttons].every((element) => box(element).height >= 36),
				formWidth: document.querySelector('form')?.getBoundingClientRect().width,
			};
		});
	const record = async (locale, width, label) => {
		const metrics = await measure();
		results.push({ locale, width, label, ...metrics });
		await page.screenshot({ path: path.join(output, `${locale}-${width}-${label}.png`), fullPage: true });
		assert(!metrics.pageOverflow && !metrics.bad.length, JSON.stringify({ locale, width, label, ...metrics }));
		assert.equal(metrics.navigationCount, 6);
		assert(metrics.touchTargets);
		console.log(`PASS ${locale} ${width}px ${label}`);
	};
	try {
		for (const locale of ['en', 'kr', 'ru']) {
			const labels = JSON.parse(
				fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'trainer-gym-access.json'), 'utf8'),
			);
			for (const width of [1440, 768, 390]) {
				state = 'full';
				await page.setViewportSize({ width, height: 900 });
				await page.goto(origin.origin + (locale === 'en' ? '' : '/' + locale) + '/mypage?category=gymAccess', {
					waitUntil: 'domcontentloaded',
					timeout: 120000,
				});
				await page.locator('.gym-access-card').first().waitFor();
				assert.equal(await page.locator('h1').textContent(), labels.Title);
				await page.locator('details').nth(2).locator('summary').click();
				await record(locale, width, 'history');
				await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
				await page.locator('.gym-access-card').first().waitFor();
				assert(page.url().includes('category=gymAccess'));
				const requestButton = page.getByRole('button', { name: labels['Request gym access'], exact: true });
				await requestButton.focus();
				const outline = await requestButton.evaluate((element) => {
					const style = getComputedStyle(element);
					return { style: style.outlineStyle, width: style.outlineWidth };
				});
				assert.notEqual(outline.style, 'none');
				assert(parseFloat(outline.width) >= 2);
				await requestButton.click();
				await page.locator('#gym-access-gym option').nth(5).waitFor({ state: 'attached' });
				await page.locator('#gym-access-gym').selectOption(gyms[4]._id);
				await page.locator('#gym-access-relationship').selectOption('FACILITY_PERMISSION');
				await page.locator('#gym-access-note').fill('A detailed request note. '.repeat(35));
				await page.getByRole('button', { name: labels['Submit request'], exact: true }).waitFor({ state: 'visible' });
				await record(locale, width, 'request-form');
				await page.getByRole('button', { name: labels.Cancel, exact: true }).click();
				await page.waitForFunction(
					() => document.activeElement === document.querySelector('.gym-access-page-heading > button'),
				);
			}
		}
		await page.setViewportSize({ width: 390, height: 844 });
		for (const next of ['empty', 'error', 'loading']) {
			state = next;
			await page.goto(origin.origin + '/mypage?category=gymAccess', { waitUntil: 'domcontentloaded' });
			await page.locator('.gym-access-page-heading').waitFor();
			await page.locator(next === 'loading' ? '.gym-access-loading' : '.gym-access-state').waitFor();
			await record('en', 390, next);
			assert(!(await page.locator('body').textContent()).includes('Private server details'));
			if (next === 'loading') {
				state = 'full';
				hold?.();
				await page.locator('.gym-access-card').first().waitFor();
			}
		}
		for (memberType of ['USER', 'ADMIN']) {
			state = 'full';
			await page.goto(origin.origin + '/mypage?category=gymAccess');
			await page.getByText('Gym Access is available to active trainers.', { exact: true }).waitFor();
			assert.equal(await page.locator('form, .schedule-desktop-navigation, .schedule-mobile-navigation').count(), 0);
		}
		assert.equal(errors.length, 0, errors.join('\n'));
		assert(!requests.some((request) => /submit|review|revoke/i.test(request.field)));
		fs.writeFileSync(
			path.join(output, 'results.json'),
			JSON.stringify({ results, errors, notices, requests }, null, 2),
		);
		console.log(
			`${results.length} browser layout/state captures passed (EN/KR/RU, 1440/768/390); USER/ADMIN fallback passed. All GraphQL traffic mocked. Artifacts: ${output}`,
		);
		console.log('Browser notices: ' + JSON.stringify([...new Set(notices)]));
	} finally {
		hold?.();
		await context.close();
		await browser.close();
	}
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
