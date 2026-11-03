// Styling-only QA. Every GraphQL request is intercepted; all writes are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('graphql');
const { trainer, gyms, records } = require('./test-trainer-gym-access.cjs');
const { adminFixture } = require('./test-admin-programs-responsive.cjs');
const { records: accessRecords } = require('./test-admin-gym-access.cjs');
const baseline = process.argv.includes('--before');
const coral = 'rgb(165, 52, 37)';
const gym = {
	...gyms[0],
	gymStatus: 'PAUSED',
	gymRevision: 1,
	gymImages: ['uploads/gym/12345678-1234-4123-8123-123456789abc.webp'],
	gymDesc: 'Fixture venue',
	gymPhone: null,
	amenities: [],
	openingHours: null,
};
const program = {
	_id: '9'.repeat(24),
	memberId: trainer._id,
	programRevision: 1,
	programStatus: 'PAUSED',
	programType: 'GROUP_CLASS',
	programCategory: 'MUSCLE_GAIN',
	programName: 'Fixture program',
	programLocation: 'SEOUL',
	programAddress: gyms[0].gymAddress,
	gymId: gyms[0]._id,
	gymData: gyms[0],
	programPrice: 45000,
	programDuration: 60,
	programCapacity: 8,
	programDesc: 'Fixture description',
	programImages: [],
	createdAt: '2026-10-01T00:00:00Z',
	updatedAt: '2026-10-01T00:00:00Z',
	programViews: 0,
	programLikes: 0,
	programRank: 0,
};
const cases = [
	{ name: 'schedule', route: '/mypage?category=trainerSchedule', selector: '.schedule-time-control input' },
	{
		name: 'global-search',
		route: '/program',
		selector: '.global-program-search-form input:visible',
		guest: true,
		underline: true,
		setup: async (page) => page.locator('.global-program-search-trigger:visible').click(),
	},
	{ name: 'login', route: '/account/join', selector: '#auth-nick', guest: true },
	{
		name: 'register',
		route: '/account/join',
		selector: '#auth-phone',
		guest: true,
		setup: async (page) => page.locator('.auth-mode-switch button').nth(1).click(),
	},
	{ name: 'program-create', route: '/mypage?category=addProgram', selector: '#program-name' },
	{
		name: 'program-number',
		route: '/mypage?category=addProgram',
		selector: '#programPrice',
		wrapper: '.editor-number-control',
	},
	{ name: 'program-edit', route: '/mypage?category=addProgram&programId=' + program._id, selector: '#program-gym' },
	{
		name: 'gym-access',
		route: '/mypage?category=gymAccess',
		selector: '#gym-access-search',
		setup: async (page) => page.locator('.gym-access-page-heading button').click(),
	},
	{
		name: 'application',
		route: '/mypage?category=trainerApplication',
		selector: '#application-fullName',
		role: 'USER',
	},
	{
		name: 'application-textarea',
		route: '/mypage?category=trainerApplication',
		selector: '#application-bio',
		role: 'USER',
	},
	{
		name: 'trainer-profile',
		route: '/mypage?category=myProfile',
		selector: '#trainer-profile-nick',
		wrapper: '.trainer-profile-field > div',
	},
	{
		name: 'user-profile',
		route: '/mypage?category=myProfile',
		selector: '#user-profile-nick',
		role: 'USER',
		wrapper: '.user-profile-field > div',
	},
	{ name: 'admin-access', route: '/_admin/gym-access', selector: '#access-trainer-filter', role: 'ADMIN', mui: true },
	{ name: 'admin-gym-create', route: '/_admin/gyms/detail', selector: '#gym-gymName', role: 'ADMIN', mui: true },
	{
		name: 'admin-gym-edit',
		route: '/_admin/gyms/detail?id=' + gym._id,
		selector: '#gym-gymAddress',
		role: 'ADMIN',
		mui: true,
	},
	{
		name: 'admin-gym-textarea',
		route: '/_admin/gyms/detail?id=' + gym._id,
		selector: '#gym-gymDesc',
		role: 'ADMIN',
		mui: true,
	},
	{
		name: 'admin-select',
		route: '/_admin/programs',
		selector: '.program-filters .MuiSelect-select',
		role: 'ADMIN',
		mui: true,
	},
	{ name: 'public-program', route: '/program', selector: '#program-name-search', guest: true, mui: true },
	{ name: 'public-gym', route: '/gym', selector: '.gym-name-search input', guest: true, wrapper: '.gym-name-search' },
	{
		name: 'public-trainer',
		route: '/trainer',
		selector: '.trainer-search-input input',
		guest: true,
		wrapper: '.trainer-search-input',
	},
	{ name: 'help', route: '/help', selector: '#help-search', guest: true, wrapper: '.help-search' },
];
async function main() {
	const { chromium } = require(process.env.GYMFLOW_QA_PLAYWRIGHT || 'playwright');
	const origin = new URL(process.env.GYMFLOW_QA_URL || 'http://localhost:3000');
	assert(['localhost', '127.0.0.1'].includes(origin.hostname));
	const output = fs.mkdtempSync(path.join(os.tmpdir(), baseline ? 'gymflow-focus-before-' : 'gymflow-focus-after-'));
	console.log('Artifacts: ' + output);
	const browser = await chromium.launch({ executablePath: process.env.GYMFLOW_QA_BROWSER, headless: true });
	const context = await browser.newContext();
	const page = await context.newPage();
	let current;
	const results = [],
		errors = [],
		notices = [],
		operations = [],
		failures = [];
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
		const operation = parse(body.query).definitions.find((item) => item.kind === 'OperationDefinition');
		const field = operation.selectionSet.selections[0].name.value;
		operations.push({ field, operation: operation.operation });
		const send = (value) =>
			route.fulfill({
				status: 200,
				headers,
				contentType: 'application/json',
				body: JSON.stringify({ data: { [field]: value } }),
			});
		if (field === 'refreshSession') {
			if (current.guest) return send(null);
			const token = [
				'eyJhbGciOiJub25lIn0',
				Buffer.from(
					JSON.stringify({
						sub: current.role === 'ADMIN' ? adminFixture._id : trainer._id,
						sid: 'b'.repeat(24),
						purpose: 'access',
						exp: Math.floor(Date.now() / 1000) + 3600,
					}),
				).toString('base64url'),
				'fixture',
			].join('.');
			return send({ accessToken: token });
		}
		if (field === 'getMyMember')
			return send({
				...trainer,
				...(current.role === 'ADMIN' ? adminFixture : {}),
				memberType: current.role || 'TRAINER',
				memberStatus: 'ACTIVE',
				memberFullName: 'Fixture member',
				memberAuthType: 'PHONE',
				memberPhone: 'fixture-only',
				memberImage: '',
				memberPrograms: 1,
				memberArticles: 0,
				memberPoints: 0,
				memberLikes: 0,
				memberViews: 0,
				memberComments: 0,
				memberRank: 0,
			});
		if (operation.operation === 'mutation') {
			failures.push('Blocked write: ' + field);
			return route.fulfill({ status: 400, headers, body: 'Write blocked' });
		}
		if (field === 'getMyTrainerApplication') return send(null);
		if (field === 'getMyTrainerSchedule')
			return send(
				['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((dayOfWeek, index) => ({
					_id: String(index + 1).padStart(24, '0'),
					memberId: trainer._id,
					dayOfWeek,
					isAvailable: true,
					startTime: '09:00',
					endTime: '18:00',
					createdAt: '2026-10-01T00:00:00Z',
					updatedAt: '2026-10-01T00:00:00Z',
				})),
			);
		if (field === 'getGymByAdmin') return send(gym);
		if (field === 'getGym') return send(gyms.find((row) => row._id === body.variables.gymId));
		if (field === 'getMyTrainerGymAccesses')
			return send({ list: records(), metaCounter: [{ total: records().length }] });
		if (field === 'getTrainerGymAccessesByAdmin')
			return send({ list: accessRecords().slice(0, 10), metaCounter: [{ total: 13 }] });
		if (field === 'getTrainerPrograms') return send({ list: [program], metaCounter: [{ total: 1 }] });
		if (['getMyApprovedGyms', 'getGyms'].includes(field))
			return send({ list: gyms.slice(0, 2), metaCounter: [{ total: 2 }] });
		if (['getPrograms', 'getTrainers', 'getTrainerReservations', 'getAllProgramsByAdmin'].includes(field))
			return send({ list: [], metaCounter: [{ total: 0 }] });
		failures.push('Unexpected read: ' + field);
		return route.fulfill({ status: 400, headers, body: 'Unexpected operation blocked' });
	});
	const sample = async (control, item) =>
		control.evaluate(
			(el, item) => {
				const owner = item.underline
					? el.closest('.MuiFormControl-root')
					: item.mui
					? el.closest('.MuiOutlinedInput-root').querySelector('fieldset')
					: item.wrapper
					? el.closest(item.wrapper)
					: el;
				const s = getComputedStyle(el),
					o = getComputedStyle(owner),
					b = owner.getBoundingClientRect();
				return {
					focus: el === document.activeElement,
					visible: el.matches(':focus-visible'),
					outline: s.outlineStyle,
					outlineWidth: s.outlineWidth,
					outlineOffset: s.outlineOffset,
					outlineColor: s.outlineColor,
					shadow: s.boxShadow,
					border: o.borderTopColor,
					borderWidth: o.borderTopWidth,
					ownerOutline: o.outlineStyle,
					ownerOutlineWidth: o.outlineWidth,
					ownerOffset: o.outlineOffset,
					ownerColor: o.outlineColor,
					ownerShadow: o.boxShadow,
					width: b.width,
					height: b.height,
					disabled: el.disabled,
					readOnly: el.readOnly,
					invalid: el.getAttribute('aria-invalid') === 'true' || el.matches(':user-invalid'),
					underlineColor: getComputedStyle(owner, '::after').backgroundColor,
					underlineHeight: getComputedStyle(owner, '::after').height,
				};
			},
			{ mui: item.mui, wrapper: item.wrapper, underline: item.underline },
		);
	try {
		for (const width of baseline ? [1440] : [1440, 768, 390]) {
			await page.setViewportSize({ width, height: 1000 });
			for (current of cases.filter(
				(item) =>
					!process.argv.some((arg) => arg.startsWith('--only=')) ||
					process.argv
						.find((arg) => arg.startsWith('--only='))
						.slice(7)
						.split(',')
						.includes(item.name),
			)) {
				try {
					await page.goto(origin.origin + current.route, { waitUntil: 'domcontentloaded', timeout: 120000 });
					if (current.setup) await current.setup(page);
					const control = page.locator(current.selector).first();
					await control.waitFor({ timeout: 45000 });
					await control.scrollIntoViewIfNeeded();
					await page.evaluate(() => document.activeElement?.blur());
					await page.mouse.move(0, 0);
					const normal = await sample(control, current);
					await control.hover();
					const hover = await sample(control, current);
					// Pointer focus without opening native/Material select popups.
					if (current.mui && current.selector.includes('Select')) await control.focus();
					else {
						await control.click();
						if (await control.evaluate((el) => el.tagName === 'SELECT')) await page.keyboard.press('Escape');
					}
					await page.waitForTimeout(180);
					const mouse = await sample(control, current);
					await control.focus();
					await page.keyboard.press('Tab');
					await page.keyboard.press('Shift+Tab');
					await page.waitForTimeout(180);
					const keyboard = await sample(control, current);
					assert(keyboard.focus && keyboard.visible, current.name + ' keyboard focus not restored');
					if (!baseline) {
						assert.equal(keyboard.shadow, 'none');
						assert.equal(keyboard.ownerShadow, 'none');
						if (current.underline) {
							assert.equal(keyboard.outline, 'none');
							assert.equal(keyboard.underlineColor, coral);
						} else if (current.mui) {
							assert.equal(keyboard.outline, 'none');
							assert.equal(keyboard.ownerOutline, 'none');
							assert.equal(keyboard.border, keyboard.invalid ? 'rgb(211, 47, 47)' : coral);
						} else if (current.wrapper) {
							assert.equal(keyboard.outline, 'none');
							assert.equal(keyboard.ownerColor, coral);
							assert.equal(keyboard.ownerOffset, '-2px');
						} else {
							assert.equal(keyboard.border, coral);
							assert.equal(keyboard.outlineColor, coral);
							assert.equal(keyboard.outlineOffset, '-2px');
						}
						assert(
							Math.abs(normal.width - keyboard.width) < 0.5 && Math.abs(normal.height - keyboard.height) < 0.5,
							'Focus layout shift',
						);
					}
					const shotOwner = current.mui
						? control.locator('xpath=..')
						: current.wrapper
						? control.locator('xpath=..')
						: control;
					const box = await shotOwner.boundingBox();
					const clip = { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 28) };
					clip.width = Math.min(width - clip.x, box.width + 24);
					clip.height = Math.min(1000 - clip.y, box.height + 44);
					await page.screenshot({ path: path.join(output, `${width}-${current.name}.png`), clip });
					// Exercise style states on real rendered controls, restoring DOM attributes afterward; no form submission.
					let invalid, disabled, readOnly;
					if (!current.wrapper && !current.underline) {
						await control.evaluate((el, mui) => {
							el.setAttribute('aria-invalid', 'true');
							if (mui) el.closest('.MuiOutlinedInput-root').classList.add('Mui-error');
						}, current.mui);
						invalid = await sample(control, current);
						if (!baseline)
							assert.notEqual(current.mui ? invalid.border : invalid.outlineColor, coral, 'Error color preserved');
						await control.evaluate((el, mui) => {
							el.removeAttribute('aria-invalid');
							if (mui) el.closest('.MuiOutlinedInput-root').classList.remove('Mui-error');
						}, current.mui);
					}
					if (await control.evaluate((el) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) {
						await control.evaluate((el) => {
							el.blur();
							el.disabled = true;
						});
						disabled = await sample(control, current);
						await control.evaluate((el) => {
							el.disabled = false;
							el.readOnly = true;
						});
						await control.focus();
						readOnly = await sample(control, current);
						await control.evaluate((el) => {
							el.readOnly = false;
						});
					}
					await page.emulateMedia({ forcedColors: 'active' });
					await control.focus();
					const forcedColors = await sample(control, current);
					if (!baseline) {
						assert(
							parseFloat(
								current.underline
									? forcedColors.underlineHeight
									: current.mui
									? forcedColors.borderWidth
									: forcedColors.ownerOutlineWidth,
							) >= 2,
						);
						assert.notEqual(current.mui ? forcedColors.border : forcedColors.ownerColor, 'rgba(0, 0, 0, 0)');
					}
					await page.emulateMedia({ forcedColors: 'none' });
					results.push({
						width,
						page: current.name,
						normal,
						hover,
						mouse,
						keyboard,
						invalid,
						disabled,
						readOnly,
						forcedColors,
					});
					console.log('PASS ' + width + ' ' + current.name);
				} catch (error) {
					failures.push(width + ' ' + current.name + ': ' + error.message);
					console.log('FAIL ' + failures.at(-1));
				}
			}
		}
	} finally {
		fs.writeFileSync(
			path.join(output, 'results.json'),
			JSON.stringify({ baseline, results, failures, errors, notices: [...new Set(notices)], operations }, null, 2),
		);
		await browser.close();
	}
	assert.deepEqual(failures, []);
	assert.deepEqual(errors, []);
	console.log(
		results.length + ' form-focus page/viewport checks passed. All GraphQL intercepted. Artifacts: ' + output,
	);
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
