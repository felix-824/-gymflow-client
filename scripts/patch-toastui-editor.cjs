const fs = require('node:fs');
const path = require('node:path');

// Toast UI 3.2.2 disconnects its toolbar observer but leaves a throttled resize
// queued. Cancel that tick on destroy so it cannot rerender removed DOM.
const dist = path.dirname(require.resolve('@toast-ui/editor'));
const version = JSON.parse(fs.readFileSync(path.join(dist, '../package.json'), 'utf8')).version;
if (version !== '3.2.2') throw new Error('Review the Toast UI toolbar cleanup patch before changing editor versions.');
const marker = '// GymFlow: cancel the queued toolbar resize before removing its DOM.';

function replaceOnce(source, before, after) {
	if (source.split(before).length !== 2)
		throw new Error('Unexpected Toast UI source; toolbar cleanup patch was not applied.');
	return source.replace(before, after);
}

function patchFunction(source, signature, before, after) {
	const start = source.indexOf(signature);
	if (start < 0) throw new Error('Missing Toast UI function: ' + signature);
	const end = source.indexOf('\n}', start) + 2;
	const body = replaceOnce(source.slice(start, end), before, after);
	return source.slice(0, start) + body + source.slice(end);
}

const entries = [
	['toastui-editor.js', 'debounce', 'throttle'],
	['esm/index.js', 'debounce$1', 'throttle$1'],
];
const patches = entries.map(([relative, debounce, throttle]) => {
	const file = path.join(dist, relative);
	let source = fs.readFileSync(file, 'utf8');
	if (source.includes(marker)) return { file, source };
	source = patchFunction(
		source,
		'function ' + debounce + '(fn, delay)',
		'  return debounced;',
		'  debounced.cancel = function() { window.clearTimeout(timer); };\n\n  return debounced;',
	);
	source = patchFunction(
		source,
		'function ' + throttle + '(fn, interval)',
		'  throttled.reset = reset;',
		'  throttled.reset = reset;\n  throttled.cancel = debounced.cancel;',
	);
	source = replaceOnce(
		source,
		'Toolbar.prototype.beforeDestroy = function () {\n',
		'Toolbar.prototype.beforeDestroy = function () {\n        ' + marker + '\n        this.handleResize.cancel();\n',
	);
	return { file, source };
});
for (const { file, source } of patches) {
	if (fs.readFileSync(file, 'utf8') !== source) fs.writeFileSync(file, source);
}
console.log('Toast UI 3.2.2 toolbar cleanup patch applied (ESM and CommonJS; idempotent).');
