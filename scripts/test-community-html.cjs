const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gymflow.test/community/detail' });
global.window = dom.window;
global.document = dom.window.document;
const file = path.join(__dirname, '../libs/article-html.ts');
const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
}).outputText;
const loaded = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output + '\n})', { filename: file })(
	require,
	loaded,
	loaded.exports,
);
const { sanitizeArticleHtml, articleHtmlPlugin } = loaded.exports;
let checks = 0;
function check(name, fn) {
	fn();
	checks++;
	console.log('PASS ' + name);
}
function render(html) {
	const element = document.createElement('div');
	element.innerHTML = sanitizeArticleHtml(html);
	return element;
}
function assertSafe(element) {
	assert.equal(element.querySelector('script,svg,math,iframe,object,embed,style,form,input,template'), null);
	for (const node of element.querySelectorAll('*')) {
		for (const attribute of node.attributes) {
			assert(!attribute.name.toLowerCase().startsWith('on'), attribute.name);
			assert(!['style', 'srcdoc', 'srcset', 'xlink:href'].includes(attribute.name), attribute.name);
			if (['src', 'href'].includes(attribute.name)) {
				assert(['http:', 'https:'].includes(new URL(attribute.value, dom.window.location.href).protocol));
			}
		}
	}
}

const attacks = [
	['script', '<p>Story</p><script>window.__articleAttack=1</script>'],
	[
		'event handlers',
		'<img src="/uploads/article/a.png" onerror="alert(1)"><div onclick="alert(1)">text</div><body onload="alert(1)">',
	],
	['javascript links', '<a href="javascript:alert(1)">bad</a><a href="java&#x09;script:alert(1)">encoded</a>'],
	[
		'dangerous image protocols',
		'<img src="data:image/svg+xml,&lt;svg onload=alert(1)&gt;"><img src="javascript:alert(1)"><img src="vbscript:msgbox(1)"><img src="blob:https://gymflow.test/id">',
	],
	[
		'executable embeds',
		'<iframe src="https://example.com" srcdoc="<script>alert(1)</script>"></iframe><object data="https://example.com"></object><embed src="https://example.com">',
	],
	[
		'SVG / MathML',
		'<svg><a xlink:href="javascript:alert(1)"><circle onload="alert(1)" /></a></svg><math><mtext><img src=x onerror=alert(1)></mtext></math>',
	],
	[
		'nested mutation XSS',
		'<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">',
	],
	[
		'malformed namespace nesting',
		'<svg></p><style><g title="</style><img src=x onerror=alert(1)>"><a href="javascript:alert(1)">x',
	],
	[
		'CSS, URL overrides and active forms',
		'<base href="javascript:alert(1)"><form><input autofocus onfocus=alert(1)></form><p style="background:url(javascript:alert(1))">text</p><img srcset="javascript:alert(1) 1x">',
	],
];
for (const [name, html] of attacks)
	check(name + ' is inert across repeated DOM parsing', () => {
		const element = render(html);
		assertSafe(element);
		const reparsed = document.createElement('div');
		reparsed.innerHTML = element.innerHTML;
		assertSafe(reparsed);
	});

check('paragraphs, headings and inline formatting survive', () => {
	const element = render(
		'<h1>Title</h1><h2>Section</h2><p>Text <strong>bold</strong><em>italic</em><del>strike</del><s>also strike</s><br>end</p>',
	);
	for (const tag of ['h1', 'h2', 'p', 'strong', 'em', 'del', 's', 'br']) assert(element.querySelector(tag), tag);
	assert.equal(element.querySelector('strong').textContent, 'bold');
});
check('blockquotes, ordered/unordered lists and tasks survive', () => {
	const element = render(
		'<blockquote><p>Quote</p></blockquote><ol start="3"><li>Ordered</li></ol><ul><li>Unordered</li><li class="task-list-item" data-task data-task-checked>Done</li></ul>',
	);
	assert.equal(element.querySelector('blockquote p').textContent, 'Quote');
	assert.equal(element.querySelector('ol').getAttribute('start'), '3');
	assert.equal(element.querySelectorAll('li').length, 3);
	assert(element.querySelector('.task-list-item').hasAttribute('data-task-checked'));
});
check('HTTP/HTTPS and relative links survive; blank targets are protected', () => {
	const element = render(
		'<a href="http://example.com/a">http</a><a href="https://example.com/b" target="_blank">https</a><a href="/community">relative</a><a href="https://example.com/c" target="_BLANK">uppercase target</a>',
	);
	assert.deepEqual(
		[...element.querySelectorAll('a')].map((node) => node.getAttribute('href')),
		['http://example.com/a', 'https://example.com/b', '/community', 'https://example.com/c'],
	);
	for (const link of element.querySelectorAll('a[target]')) {
		assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
	}
	assertSafe(element);
});
check('uploaded relative and normalized absolute image URLs are unchanged', () => {
	const sources = [
		'uploads/article/real.png',
		'/uploads/article/real.jpg',
		'http://localhost:3007/uploads/article/real.png',
		'https://example.com/photo.jpg',
	];
	const element = render(
		sources.map((src) => '<p><img src="' + src + '" alt="Article photo" title="Training"></p>').join(''),
	);
	assert.deepEqual(
		[...element.querySelectorAll('img')].map((node) => node.getAttribute('src')),
		sources,
	);
	assert([...element.querySelectorAll('img')].every((node) => node.alt === 'Article photo'));
});
check('editor tables, code blocks and existing div/big formatting survive', () => {
	const element = render(
		'<div><big>Intro</big><pre><code class="language-js" data-language="js">const a = 1;</code></pre><table><thead><tr><th align="center">Header</th></tr></thead><tbody><tr><td colspan="2">Value</td></tr></tbody></table></div>',
	);
	assert.equal(element.querySelector('big').textContent, 'Intro');
	assert.equal(element.querySelector('code').textContent, 'const a = 1;');
	assert.equal(element.querySelector('th').getAttribute('align'), 'center');
	assert.equal(element.querySelector('td').getAttribute('colspan'), '2');
});
check('WYSIWYG clipboard plugin uses the shared policy before DOM parsing', () => {
	const { Plugin } = require('prosemirror-state');
	const plugin = articleHtmlPlugin({ pmState: { Plugin } }).wysiwygPlugins[0]();
	for (const [, html] of attacks) {
		const element = document.createElement('div');
		element.innerHTML = plugin.props.transformPastedHTML(html);
		assertSafe(element);
	}
	assert.equal(
		plugin.props.transformPastedHTML('<p><strong>Valid paste</strong></p>'),
		'<p><strong>Valid paste</strong></p>',
	);
});
check('WYSIWYG model removes unsafe Markdown/command URLs before rendering', () => {
	const { Schema } = require('prosemirror-model');
	const { Plugin, EditorState } = require('prosemirror-state');
	const schema = new Schema({
		nodes: {
			doc: { content: 'paragraph+' },
			paragraph: { content: 'inline*', group: 'block' },
			text: { group: 'inline' },
			image: { inline: true, group: 'inline', attrs: { imageUrl: {} } },
		},
		marks: { link: { attrs: { linkUrl: {} } }, strong: {} },
	});
	const plugin = articleHtmlPlugin({ pmState: { Plugin } }).wysiwygPlugins[0]();
	const state = EditorState.create({ schema, plugins: [plugin] });
	const content = schema.node('paragraph', null, [
		schema.node('image', { imageUrl: 'data:image/svg+xml,attack' }),
		schema.text('Unsafe link', [schema.mark('link', { linkUrl: 'javascript:alert(1)' }), schema.mark('strong')]),
		schema.node('image', { imageUrl: 'uploads/article/valid.png' }),
		schema.text('Safe link', [schema.mark('link', { linkUrl: 'https://example.com' })]),
		schema.node('image', { imageUrl: 'vbscript:attack' }),
	]);
	const result = state.applyTransaction(state.tr.replaceWith(0, state.doc.content.size, content));
	assert.equal(result.transactions.length, 2);
	const children = [];
	result.state.doc.firstChild.forEach((node) => children.push(node));
	assert.equal(children.length, 3);
	assert.equal(children[0].text, 'Unsafe link');
	assert.deepEqual(
		children[0].marks.map((mark) => mark.type.name),
		['strong'],
	);
	assert.equal(children[1].attrs.imageUrl, 'uploads/article/valid.png');
	assert.equal(children[2].marks[0].attrs.linkUrl, 'https://example.com');
	const clean = result.state.applyTransaction(result.state.tr.insertText(' more', 1));
	assert.equal(clean.transactions.length, 1, 'ordinary edits must not be rewritten');
});
check('Viewer and Editor wire the shared boundary without changing upload/save code', () => {
	const viewer = fs.readFileSync(path.join(__dirname, '../libs/components/community/TViewer.tsx'), 'utf8');
	const editor = fs.readFileSync(path.join(__dirname, '../libs/components/community/Teditor.tsx'), 'utf8');
	assert(viewer.includes('customHTMLSanitizer={sanitizeArticleHtml}'));
	assert(!viewer.includes("tagName: 'iframe'"));
	assert(editor.includes('customHTMLSanitizer={sanitizeArticleHtml}'));
	assert(editor.includes('plugins={[articleHtmlPlugin]}'));
});
check('server calls fail closed without adding server-side DOM emulation', () => {
	delete global.window;
	assert.equal(sanitizeArticleHtml('<script>alert(1)</script>'), '');
	global.window = dom.window;
});
dom.window.close();
console.log(checks + ' Community HTML security checks passed.');
