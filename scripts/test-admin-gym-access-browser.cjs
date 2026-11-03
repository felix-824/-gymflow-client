// Query-only browser QA. All application GraphQL/session traffic is intercepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parse } = require('graphql');
const { records } = require('./test-admin-gym-access.cjs');
const { adminFixture } = require('./test-admin-programs-responsive.cjs');
async function main() {
	const { chromium } = require(process.env.GYMFLOW_QA_PLAYWRIGHT || 'playwright');
	assert(fs.existsSync(process.env.GYMFLOW_QA_BROWSER || ''));
	const origin = new URL(process.env.GYMFLOW_QA_URL || 'http://localhost:3000');
	assert(['localhost', '127.0.0.1'].includes(origin.hostname));
	const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-admin-access-browser-'));
	const browser = await chromium.launch({ executablePath: process.env.GYMFLOW_QA_BROWSER, headless: true });
	const context = await browser.newContext(),
		page = await context.newPage();
	const rows = records(),
		results = [],
		errors = [],
		notices = [],
		operations = [];
	rows.forEach((row) => {
		row.trainerData.memberFullName = 'AlexandraKonstantinopolskaya'.repeat(3).slice(0, 80);
		row.gymData.gymName = 'LongVenueName'.repeat(8).slice(0, 100);
		row.gymData.gymAddress = 'A detailed physical address in Seoul. '.repeat(3).slice(0, 100);
		row.requestNote = 'LongRequestWithoutSpaces'.repeat(45).slice(0, 1000);
		if (row.rejectionReason) row.rejectionReason = 'Detailed rejection reason. '.repeat(45).slice(0, 1000);
		if (row.revocationReason) row.revocationReason = 'LongRevocationReason'.repeat(50).slice(0, 1000);
	});
	let role = 'ADMIN',
		state = 'normal',
		release;
	const token = [
		'eyJhbGciOiJub25lIn0',
		Buffer.from(
			JSON.stringify({
				sub: adminFixture._id,
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
		const request = route.request(),
			headers = {
				'access-control-allow-origin': origin.origin,
				'access-control-allow-credentials': 'true',
				'access-control-allow-headers': '*',
			};
		if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
		const body = request.postDataJSON();
		const field = parse(body.query).definitions.find((item) => item.kind === 'OperationDefinition').selectionSet
			.selections[0].name.value;
		operations.push({ field, variables: body.variables });
		const send = (data) =>
			route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ data }) });
		if (field === 'refreshSession') return send({ refreshSession: { accessToken: token } });
		if (field === 'getMyMember') return send({ getMyMember: { ...adminFixture, memberType: role } });
		if (field === 'getTrainerGymAccessesByAdmin' || field === 'getTrainerGymAccessByAdmin') {
			if (state === 'loading')
				await new Promise((resolve) => {
					release = resolve;
				});
			if (state === 'error')
				return route.fulfill({
					status: 200,
					headers,
					contentType: 'application/json',
					body: JSON.stringify({ errors: [{ message: 'PRIVATE backend diagnostic' }] }),
				});
			if (field === 'getTrainerGymAccessByAdmin')
				return send({ getTrainerGymAccessByAdmin: rows.find((row) => row._id === body.variables.accessId) });
			const { page: current, limit, search } = body.variables.input;
			const list =
				state === 'empty'
					? []
					: rows.filter(
							(row) =>
								(!search.status || row.status === search.status) &&
								(!search.trainerId || row.trainerData._id === search.trainerId) &&
								(!search.gymId || row.gymData._id === search.gymId),
					  );
			return send({
				getTrainerGymAccessesByAdmin: {
					list: list.slice((current - 1) * limit, current * limit),
					metaCounter: [{ total: list.length }],
				},
			});
		}
		errors.push('Blocked unexpected operation ' + field);
		return route.fulfill({ status: 400, headers, body: 'Unexpected operation blocked' });
	});
	const labels = (locale) =>
		JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'admin-gym-access.json'), 'utf8'));
	const workspace = (locale) =>
		JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', locale, 'admin-workspace.json'), 'utf8'));
	const capture = async (locale, width, current) => {
		const measure = await page.evaluate(() => {
			const shown = (el) => Boolean(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
			const selector = document.querySelector('[role=dialog]') ? '.admin-access-dialog' : '.admin-gym-access';
			const nodes = [
				...document.querySelectorAll(
					selector +
						' h1, ' +
						selector +
						' h2, ' +
						selector +
						' h3, ' +
						selector +
						' p, ' +
						selector +
						' dd, ' +
						selector +
						' td, ' +
						selector +
						' button, ' +
						selector +
						' a, ' +
						selector +
						' textarea',
				),
			].filter(shown);
			const bad = nodes
				.filter((el) => {
					const box = el.getBoundingClientRect();
					// Scrollable Tabs intentionally clip off-page choices; measure their viewport, not clipped tabs.
					const scroller = el.closest('.MuiTabs-scroller');
					if (
						scroller &&
						(box.left < scroller.getBoundingClientRect().left || box.right > scroller.getBoundingClientRect().right)
					)
						return false;
					return (
						box.left < -1 ||
						box.right > innerWidth + 1 ||
						(el.tagName !== 'TEXTAREA' && el.scrollWidth > el.clientWidth + 2)
					);
				})
				.map((el) => ({
					tag: el.tagName,
					className: el.className,
					text: el.textContent.slice(0, 50),
					clientWidth: el.clientWidth,
					scrollWidth: el.scrollWidth,
				}));
			const smallTargets = [...document.querySelectorAll(selector + ' button, ' + selector + ' a')]
				.filter(shown)
				.filter((el) => el.getBoundingClientRect().height < 43)
				.map((el) => ({ tag: el.tagName, text: el.textContent }));
			const reason = document.querySelector('#access-decision-reason');
			const reasonRect = reason?.getBoundingClientRect();
			const inputRect = reason?.closest('.MuiOutlinedInput-root')?.getBoundingClientRect();
			const reasonContained =
				!reason || (reasonRect.top >= inputRect.top - 1 && reasonRect.bottom <= inputRect.bottom + 1);
			const luminance = (color) =>
				color
					.match(/[\d.]+/g)
					.slice(0, 3)
					.map(Number)
					.map((value) => {
						const channel = value / 255;
						return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
					})
					.reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
			const contrastFailures = [...document.querySelectorAll(selector + ' button.MuiButton-contained:not(:disabled)')]
				.filter(shown)
				.filter((el) => {
					const style = getComputedStyle(el),
						foreground = luminance(style.color),
						background = luminance(style.backgroundColor);
					return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) < 4.5;
				})
				.map((el) => el.textContent);
			return {
				pageOverflow: document.documentElement.scrollWidth > innerWidth,
				reasonContained,
				contrastFailures,
				bad,
				smallTargets,
				cardList: Boolean(document.querySelector('.access-mobile-list')),
				table: Boolean(document.querySelector('.access-list table')),
			};
		});
		assert(!measure.pageOverflow, JSON.stringify({ locale, width, current, measure }));
		assert(measure.reasonContained, JSON.stringify({ locale, width, current, measure }));
		assert.deepEqual(measure.contrastFailures, []);
		assert.deepEqual(measure.bad, [], JSON.stringify({ locale, width, current, measure }));
		assert.deepEqual(measure.smallTargets, [], JSON.stringify({ locale, width, current, measure }));
		await page.screenshot({ path: path.join(output, `${locale}-${width}-${current}.png`), fullPage: true });
		results.push({ locale, width, state: current, ...measure });
	};
	try {
		for (const locale of ['en', 'kr', 'ru'])
			for (const width of [1440, 768, 390]) {
				const copy = labels(locale),
					prefix = locale === 'en' ? '' : '/' + locale;
				await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
				for (const current of [
					'pending-list',
					'PENDING',
					'APPROVED',
					'REJECTED',
					'REVOKED',
					'reject-dialog',
					'revoke-dialog',
				]) {
					const list = current === 'pending-list',
						dialog = current.endsWith('dialog');
					const status = current === 'reject-dialog' ? 'PENDING' : current === 'revoke-dialog' ? 'APPROVED' : current;
					const row = rows.find((item) => item.status === status);
					await page.goto(origin.origin + prefix + '/_admin/gym-access' + (list ? '' : '/detail?id=' + row._id), {
						waitUntil: 'domcontentloaded',
						timeout: 120000,
					});
					if (list) {
						await page.locator('[data-access-id]').first().waitFor({ timeout: 120000 });
						assert.equal(await page.locator('[data-access-id]').count(), 10);
						assert.equal(await page.locator('.access-mobile-list').count(), width < 900 ? 1 : 0);
						await page.reload({ waitUntil: 'domcontentloaded' });
						await page.locator('[data-access-id]').first().waitFor();
						if (width < 1200) {
							await page.getByRole('button', { name: workspace(locale).openMenu, exact: true }).click();
							const destination = page.locator('#admin-navigation a[href$="/_admin/gym-access"]');
							await destination.waitFor();
							assert.equal(await destination.getAttribute('aria-current'), 'page');
							await destination.focus();
							assert(await destination.evaluate((el) => el === document.activeElement));
							await page.keyboard.press('Escape');
						}
					} else {
						await page.locator('.access-detail-surface[aria-busy=false]').waitFor({ timeout: 120000 });
						assert((await page.locator('.access-detail-surface').textContent()).includes(copy.status[status]));
						if (dialog) {
							const action = current === 'reject-dialog' ? 'Reject' : 'Revoke';
							await page.getByRole('button', { name: copy[action], exact: true }).click();
							await page
								.locator('#access-decision-reason')
								.fill('A clear reason for this decision. '.repeat(35).slice(0, 1000));
							assert.equal(await page.locator('#access-decision-reason').getAttribute('maxlength'), '1000');
							assert(await page.locator('#access-decision-reason').evaluate((el) => el === document.activeElement));
							await capture(locale, width, current);
							await page.keyboard.press('Escape');
							await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
							await page.waitForFunction(
								(label) =>
									[...document.querySelectorAll('.access-decisions button')].some(
										(el) => el.textContent === label && el === document.activeElement,
									),
								copy[action],
							);
							assert(
								await page
									.getByRole('button', { name: copy[action], exact: true })
									.evaluate((el) => el === document.activeElement),
							);
							continue;
						}
					}
					await capture(locale, width, current);
				}
			}
		await page.setViewportSize({ width: 390, height: 844 });
		for (state of ['empty', 'error', 'loading']) {
			await page.goto(origin.origin + '/_admin/gym-access', { waitUntil: 'domcontentloaded' });
			await page.locator('.access-list').waitFor();
			await page
				.getByText(
					state === 'empty'
						? labels('en')['Empty pending']
						: state === 'error'
						? labels('en')['Load error']
						: labels('en').Loading,
					{ exact: true },
				)
				.waitFor();
			assert(!(await page.locator('body').textContent()).includes('PRIVATE'));
			await capture('en', 390, state);
			if (state === 'loading') {
				state = 'normal';
				release?.();
			}
		}
		state = 'normal';
		for (role of ['USER', 'TRAINER'])
			for (const route of ['/_admin/gym-access', '/_admin/gym-access/detail?id=' + rows[0]._id]) {
				await page.goto(origin.origin + route, { waitUntil: 'domcontentloaded' });
				await page.getByText(workspace('en').forbidden, { exact: true }).waitFor();
				assert.equal(await page.locator('.admin-gym-access').count(), 0);
			}
		assert.deepEqual(errors, []);
		assert(
			!operations.some(({ field }) =>
				/reviewTrainerGymAccess|revokeTrainerGymAccess|submitTrainerGymAccess/.test(field),
			),
		);
		fs.writeFileSync(
			path.join(output, 'results.json'),
			JSON.stringify({ results, errors, notices: [...new Set(notices)], operations }, null, 2),
		);
		console.log(
			`${results.length} Admin Gym Access browser captures passed; USER/TRAINER denial passed. All GraphQL intercepted. Artifacts: ${output}`,
		);
		console.log('Browser notices: ' + JSON.stringify([...new Set(notices)]));
	} finally {
		state = 'normal';
		release?.();
		await context.close();
		await browser.close();
	}
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
