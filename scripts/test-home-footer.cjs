// Compiled Home surface coverage only; no server requests or application data.
const assert = require('node:assert/strict');
const path = require('node:path');
const sass = require('sass');
const postcss = require('postcss');
const { JSDOM } = require('jsdom');

const base = path.resolve(__dirname, '..');
const css = ['final-cta.scss', 'footer.scss'].map((file) =>
	sass.compile(path.join(base, 'scss/pc/homepage', file)).css,
).join('\n');
const parsed = postcss.parse(css);
const snapshot = (window, element) => {
	const style = window.getComputedStyle(element);
	return Object.fromEntries(Array.from(style).map((property) => [property, style.getPropertyValue(property)]));
};

for (const width of [1440, 768, 390]) {
	// JSDOM does not evaluate viewport media queries; resolve the existing width rules explicitly.
	const active = postcss.root();
	parsed.walkRules((rule) => {
		for (let parent = rule.parent; parent; parent = parent.parent) {
			if (parent.type === 'atrule' && parent.name === 'media' &&
				![...parent.params.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].every(([, bound, value]) =>
					bound === 'min' ? width >= Number(value) : width <= Number(value))) return;
		}
		active.append(rule.clone());
	});
	const dom = new JSDOM('<main id="pc-wrap"><div class="home-page"><section class="home-final-cta"></section></div>' +
		'<div id="footer" class="home-footer-shell"><footer class="home-footer"><div class="home-footer-bottom"></div></footer></div></main>' +
		'<main id="mobile-wrap"><div id="footer" class="home-footer-shell"><footer class="home-footer"></footer></div></main>' +
		'<aside id="shared"><div id="pc-wrap"><div id="footer"><div class="footer-container"><a href="/help">Help</a></div></div></div>' +
		'<div id="mobile-wrap"><div id="footer"><div class="footer-container"></div></div></div>' +
		'<div id="pc-wrap" class="program-discovery-layout"><div id="footer"><div class="programs-footer"><a href="/gym">Gyms</a></div></div></div></aside>');
	try {
		const { window } = dom, { document } = window;
		const color = (value) => {
			const probe = document.createElement('span');
			probe.style.color = value;
			return probe.style.color;
		};
		const shared = [...document.querySelectorAll('#shared, #shared *')];
		const before = shared.map((element) => snapshot(window, element));
		const style = document.createElement('style');
		style.textContent = active.toString();
		document.head.appendChild(style);
		assert.equal(window.getComputedStyle(document.querySelector('.home-final-cta')).backgroundColor, 'rgb(18, 21, 29)');
		for (const wrap of ['pc-wrap', 'mobile-wrap']) {
			const shell = document.querySelector('#' + wrap + ' .home-footer-shell');
			const footer = window.getComputedStyle(shell.querySelector('.home-footer'));
			assert.equal(window.getComputedStyle(shell).backgroundColor, 'rgb(24, 26, 32)');
			assert.equal(footer.backgroundColor, 'rgb(24, 26, 32)');
			assert.equal(color(footer.borderTopColor), color('#3a414e'));
			assert.equal(footer.borderTopWidth, '1px');
			assert.equal(footer.borderTopStyle, 'solid');
		}
		assert.equal(color(window.getComputedStyle(document.querySelector('.home-footer-bottom')).borderTopColor), color('#2b303a'));
		assert.deepEqual(shared.map((element) => snapshot(window, element)), before);
		console.log('PASS ' + width + 'px: distinct CTA/Home surfaces, approved 1px border, unchanged copyright and shared variants');
	} finally {
		dom.window.close();
	}
}
console.log('3 homepage Footer surface checks passed.');
