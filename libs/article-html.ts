import createDOMPurify from 'dompurify';
import type { PluginContext, PluginInfo } from '@toast-ui/editor';

let articlePurifier: ReturnType<typeof createDOMPurify> | undefined;

const isArticleWebUrl = (value: string): boolean => {
	try {
		// Relative upload paths stay unchanged. Only web URLs may render or navigate.
		const protocol = new URL(value, 'https://gymflow.invalid/').protocol;
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
};

export const sanitizeArticleHtml = (html: string): string => {
	// These rendering surfaces are client-only; fail closed if called without a DOM.
	if (typeof window === 'undefined') return '';
	if (!articlePurifier) {
		articlePurifier = createDOMPurify(window);
		articlePurifier.addHook('uponSanitizeAttribute', (_node, data) => {
			if (data.attrName === 'href' || data.attrName === 'src') {
				if (!isArticleWebUrl(data.attrValue)) data.keepAttr = false;
			}
		});
		articlePurifier.addHook('afterSanitizeAttributes', (node) => {
			if (node instanceof window.HTMLAnchorElement && node.getAttribute('target')?.toLowerCase() === '_blank') {
				node.setAttribute('rel', 'noopener noreferrer');
			}
		});
	}
	if (!articlePurifier.isSupported) return '';
	return articlePurifier.sanitize(html, {
		// Toast UI formatting, including tables/tasks/code and the existing div/big renderer.
		ALLOWED_TAGS: [
			'p',
			'br',
			'hr',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'strong',
			'b',
			'em',
			'i',
			's',
			'strike',
			'del',
			'blockquote',
			'ul',
			'ol',
			'li',
			'a',
			'img',
			'pre',
			'code',
			'table',
			'thead',
			'tbody',
			'tfoot',
			'tr',
			'th',
			'td',
			'div',
			'span',
			'big',
		],
		ALLOWED_ATTR: [
			'href',
			'src',
			'alt',
			'title',
			'target',
			'rel',
			'class',
			'width',
			'height',
			'align',
			'colspan',
			'rowspan',
			'start',
			'data-task',
			'data-task-checked',
			'data-language',
		],
		ALLOW_DATA_ATTR: false,
		ALLOW_ARIA_ATTR: false,
	});
};

// Toast UI's sanitizer hook does not cover clipboard parsing or Markdown/command URLs
// entering the WYSIWYG model. Its plugin API guards both before the view renders.
export const articleHtmlPlugin = ({ pmState }: PluginContext): PluginInfo => ({
	wysiwygPlugins: [
		() =>
			new pmState.Plugin({
				props: { transformPastedHTML: sanitizeArticleHtml },
				appendTransaction(transactions, _oldState, state) {
					if (!transactions.some((transaction) => transaction.docChanged)) return null;
					const transaction = state.tr;
					state.doc.descendants((node, position) => {
						const from = transaction.mapping.map(position);
						const to = transaction.mapping.map(position + node.nodeSize);
						if (node.type.name === 'image' && !isArticleWebUrl(node.attrs.imageUrl)) {
							transaction.delete(from, to);
							return false;
						}
						for (const mark of node.marks) {
							if (mark.type.name === 'link' && !isArticleWebUrl(mark.attrs.linkUrl)) {
								transaction.removeMark(from, to, mark);
							}
						}
					});
					return transaction.docChanged ? transaction : null;
				},
			}),
	],
});
