// Real local Next/MUI UI with intercepted, query-only application fixtures.
// Run via Yarn with GYMFLOW_QA_BROWSER and GYMFLOW_QA_PLAYWRIGHT set to existing tools.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('graphql');
const { adminFixture } = require('./test-admin-programs-responsive.cjs');

async function main() {
	const { chromium } = require(process.env.GYMFLOW_QA_PLAYWRIGHT || 'playwright');
	const executablePath = process.env.GYMFLOW_QA_BROWSER;
	assert(
		executablePath && fs.existsSync(executablePath),
		'Set GYMFLOW_QA_BROWSER to an existing Chromium/Edge executable',
	);
	const origin = new URL(process.env.GYMFLOW_QA_URL || 'http://localhost:3000');
	assert(['localhost', '127.0.0.1'].includes(origin.hostname), 'Browser regression must target a local frontend');
	const base = path.resolve(__dirname, '..');
	const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-applications-browser-'));
	const applications = ['PENDING', 'REJECTED', 'APPROVED'].flatMap((status, group) =>
		Array.from({ length: 13 }, (_, index) => ({
			_id: String(group * 100 + index + 1).padStart(24, '0'),
			status,
			fullName:
				index === 0
					? 'Alexandra Park'
					: index === 1
					? 'Ekaterina Aleksandrovna Konstantinopolskaya'
					: 'Applicant ' + (index + 1),
			categories:
				index === 1 ? ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'YOGA', 'PILATES', 'CROSSFIT', 'CARDIO', 'REHAB'] : ['YOGA'],
			createdAt: '2026-10-21T09:00:00Z',
			experienceSummary: 'Eight years coaching strength, mobility and small-group fitness.',
			bio: 'Purposeful, welcoming coaching for sustainable training habits.',
			rejectionReason: status === 'REJECTED' ? 'Please explain your coaching experience in more detail.' : null,
		})),
	);
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
	const browser = await chromium.launch({ executablePath, headless: true });
	const context = await browser.newContext();
	const page = await context.newPage();
	const results = [],
		errors = [],
		operations = [],
		notices = [];
	let empty = false;
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') notices.push(message.text());
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
		operations.push({ field, variables: body.variables });
		let data;
		if (field === 'refreshSession') data = { refreshSession: { accessToken: token } };
		else if (field === 'getMyMember') data = { getMyMember: adminFixture };
		else if (field === 'getTrainerApplicationsByAdmin') {
			const input = body.variables.input;
			const list = empty ? [] : applications.filter((item) => item.status === input.search.status);
			data = {
				getTrainerApplicationsByAdmin: {
					list: list.slice((input.page - 1) * input.limit, input.page * input.limit),
					metaCounter: [{ total: list.length }],
				},
			};
		} else if (field === 'getTrainerApplicationByAdmin') {
			data = { getTrainerApplicationByAdmin: applications.find((item) => item._id === body.variables.applicationId) };
		} else {
			errors.push('Blocked unexpected operation: ' + field);
			return route.fulfill({ status: 400, headers, body: 'Unexpected operation blocked' });
		}
		return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ data }) });
	});
	const measure = () =>
		page.evaluate(() => {
			const box = (element) => {
				const rect = element.getBoundingClientRect();
				return {
					left: rect.left,
					right: rect.right,
					top: rect.top,
					bottom: rect.bottom,
					width: rect.width,
					height: rect.height,
				};
			};
			const shown = (element) => Boolean(element.getClientRects().length) && !element.closest('.MuiTouchRipple-root');
			const fits = (element) => {
				const rect = box(element);
				return (
					rect.left >= -1 &&
					rect.right <= innerWidth + 1 &&
					(!element.clientWidth || element.scrollWidth <= element.clientWidth + 1)
				);
			};
			const table = document.querySelector('.admin-application-list table');
			const container = table?.parentElement;
			const panel = document.querySelector('.admin-application-list .table-wrap');
			const rows = [...document.querySelectorAll('.admin-application-mobile-row, .admin-application-list tbody tr')];
			const actions = [
				...document.querySelectorAll('.admin-application-mobile-action, .admin-application-list tbody a'),
			].map((element) => {
				const range = document.createRange();
				range.selectNodeContents(element);
				const style = getComputedStyle(element);
				return {
					text: element.textContent,
					rect: box(element),
					textRect: box(range),
					outlineStyle: style.outlineStyle,
					outlineWidth: style.outlineWidth,
					outlineOffset: style.outlineOffset,
					boxShadow: style.boxShadow,
					focused: element === document.activeElement,
				};
			});
			return {
				pageOverflow: document.documentElement.scrollWidth > innerWidth,
				table: table ? box(table) : null,
				container: container
					? { ...box(container), scrollWidth: container.scrollWidth, clientWidth: container.clientWidth }
					: null,
				panel: box(panel),
				contentFits: rows.every((row) => [...row.querySelectorAll('*')].filter(shown).every(fits)),
				badElements: rows.flatMap((row) =>
					[...row.querySelectorAll('*')]
						.filter(shown)
						.filter((element) => !fits(element))
						.map((element) => ({
							tag: element.tagName,
							text: element.textContent.slice(0, 70),
							rect: box(element),
							scrollWidth: element.scrollWidth,
							clientWidth: element.clientWidth,
						})),
				),
				tabsFit: [...document.querySelectorAll('[role=tab], .MuiTabs-scroller')].filter(shown).every(fits),
				paginationFits: [...document.querySelectorAll('.MuiTablePagination-toolbar, .MuiTablePagination-toolbar>*')]
					.filter(shown)
					.every(fits),
				headerFits: [...document.querySelectorAll('.workspace-header, .workspace-header a, .workspace-header button')]
					.filter(shown)
					.every(fits),
				headers: [...document.querySelectorAll('thead th')].map((element) => element.textContent),
				actions,
			};
		});
	const record = async (locale, width, state) => {
		const metrics = await measure();
		results.push({ locale, width, state, ...metrics });
		await page.screenshot({ path: path.join(output, `${locale}-${width}-${state}.png`) });
		const description = `${locale} ${width} ${state}`;
		assert(
			!metrics.pageOverflow && metrics.contentFits && metrics.tabsFit && metrics.paginationFits && metrics.headerFits,
			description + ': content/control overflow ' + JSON.stringify(metrics.badElements),
		);
		if (metrics.table)
			assert(
				metrics.container.scrollWidth <= metrics.container.clientWidth + 1,
				description + ': table must fit its container',
			);
		for (const action of metrics.actions) {
			assert(
				action.rect.left >= metrics.panel.left && action.rect.right <= metrics.panel.right,
				description + ': complete action must fit',
			);
			assert(action.textRect.right <= action.rect.right + 1, description + ': action text must fit its target');
			if (width < 1200)
				assert(action.rect.width >= 44 && action.rect.height >= 44, description + ': practical action target');
			if (action.focused) {
				assert.equal(action.outlineStyle, 'solid', description + ': visible keyboard focus');
				assert.equal(action.outlineWidth, '2px', description + ': one focus ring');
				assert.equal(action.boxShadow, 'none', description + ': no duplicate focus shadow');
				const edge = parseFloat(action.outlineWidth) + parseFloat(action.outlineOffset);
				assert(
					action.rect.left - edge >= metrics.panel.left && action.rect.right + edge <= metrics.panel.right,
					description + ': unclipped focus ring',
				);
			}
		}
	};
	console.log('OUTPUT ' + output);
	try {
		for (const locale of ['ru', 'en', 'kr'])
			for (const [width, height] of [
				[768, 1024],
				[1440, 1000],
				[390, 844],
			]) {
				const labels = JSON.parse(
					fs.readFileSync(path.join(base, `public/locales/${locale}/admin-trainer-applications.json`), 'utf8'),
				);
				const url = origin.origin + (locale === 'en' ? '' : '/' + locale) + '/_admin/trainer-applications';
				await page.setViewportSize({ width, height });
				empty = false;
				await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
				for (const status of ['PENDING', 'REJECTED', 'APPROVED']) {
					await page.getByRole('tab', { name: labels[status], exact: true }).click();
					await page.waitForFunction(
						(text) => document.querySelector('.admin-application-status')?.textContent === text,
						labels['Status ' + status],
					);
					assert.equal(await page.locator('table').count(), width > 599 ? 1 : 0);
					const action = page.locator('.admin-application-mobile-action, .admin-application-list tbody a').first();
					assert.equal(await action.textContent(), labels[status === 'PENDING' ? 'Review' : 'View']);
					await record(locale, width, 'populated-' + status.toLowerCase());
				}
				await page.getByRole('tab', { name: labels.PENDING, exact: true }).click();
				await page.waitForFunction(
					(text) => document.querySelector('.admin-application-status')?.textContent === text,
					labels['Status PENDING'],
				);
				const action = page.locator('.admin-application-mobile-action, .admin-application-list tbody a').first();
				const before = await action.boundingBox();
				await action.focus();
				await page.keyboard.press('Tab');
				await page.keyboard.press('Shift+Tab');
				assert(
					await action.evaluate((element) => element === document.activeElement),
					'Action must remain keyboard reachable',
				);
				assert.deepEqual(await action.boundingBox(), before, 'Keyboard focus must not shift action geometry');
				await record(locale, width, 'action-focus');
				await page.getByRole('button', { name: labels['Next page'], exact: true }).click();
				await page.waitForFunction(
					() => document.querySelectorAll('.admin-application-mobile-row, tbody a').length === 3,
				);
				await record(locale, width, 'page-two');
				await page.locator('.MuiTablePagination-select').click();
				await page.keyboard.press('Escape');
				await page.getByRole('listbox').waitFor({ state: 'hidden' });
				await page.locator('.MuiTablePagination-select').click();
				await page.getByRole('option', { name: '20', exact: true }).click();
				await page.waitForFunction(
					() => document.querySelectorAll('.admin-application-mobile-row, tbody a').length === 13,
				);
				await record(locale, width, 'page-size-20');
				await page.getByRole('tab', { name: labels.PENDING, exact: true }).focus();
				await page.keyboard.press('ArrowRight');
				await page.keyboard.press('Enter');
				assert.equal(
					await page.locator('[role=tab]:focus').getAttribute('aria-selected'),
					'true',
					'Tabs must activate from the keyboard',
				);
				await page.getByRole('tab', { name: labels.PENDING, exact: true }).click();
				await page.waitForFunction(
					(text) => document.querySelector('.admin-application-status')?.textContent === text,
					labels['Status PENDING'],
				);
				await page.locator('.admin-application-mobile-action, .admin-application-list tbody a').first().press('Enter');
				await page.waitForURL((url) => url.pathname.endsWith('/trainer-applications/detail'), { timeout: 120000 });
				await page.locator('.admin-application-detail h2').waitFor();
				results.push({ locale, width, state: 'detail-navigation', passed: true });
				empty = true;
				await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
				for (const status of ['PENDING', 'REJECTED', 'APPROVED']) {
					await page.getByRole('tab', { name: labels[status], exact: true }).click();
					await page.getByText(labels['Empty ' + status], { exact: true }).waitFor();
					await record(locale, width, 'empty-' + status.toLowerCase());
				}
				console.log(
					'PASS ' + locale + ' ' + width + ': populated/empty states, action focus, tabs, pagination and detail route',
				);
			}
		assert.deepEqual(errors, []);
	} finally {
		fs.writeFileSync(
			path.join(output, 'results.json'),
			JSON.stringify({ results, errors, notices, operations }, null, 2),
		);
		await browser.close();
	}
	console.log(
		results.length + ' Trainer Applications browser state groups passed. All GraphQL intercepted; no database writes.',
	);
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
