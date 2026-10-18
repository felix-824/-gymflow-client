import { BoardArticleCategory, BoardArticleStatus } from './enums/board-article.enum';
import { BoardArticle } from './types/board-article/board-article';
import { MemberType } from './enums/member.enum';

export function communityMemberHref(
	memberId: string | undefined,
	memberType: MemberType | undefined,
	mobile: boolean,
	ownerId: string,
) {
	if (!memberId) return undefined;
	if (memberType === MemberType.TRAINER) return `/trainer/detail?trainerId=${memberId}`;
	if (mobile) return undefined;
	return memberId === ownerId ? '/mypage' : `/member?memberId=${memberId}`;
}

export type OwnedArticle = Pick<
	BoardArticle,
	'_id' | 'memberId' | 'articleCategory' | 'articleStatus' | 'articleTitle' | 'articleContent' | 'articleImage'
> & { articleRevision: number };

export function readOwnedArticle(value: unknown, articleId: string, memberId: string): OwnedArticle | null {
	const article = value as OwnedArticle | undefined;
	if (
		!article ||
		article._id !== articleId ||
		article.memberId !== memberId ||
		article.articleStatus !== BoardArticleStatus.ACTIVE ||
		!Object.values(BoardArticleCategory).includes(article.articleCategory) ||
		!Number.isInteger(article.articleRevision) ||
		article.articleRevision < 0 ||
		article.articleRevision >= 2147483647 ||
		typeof article.articleTitle !== 'string' ||
		typeof article.articleContent !== 'string' ||
		(article.articleImage != null && typeof article.articleImage !== 'string')
	)
		return null;
	return article;
}

export function articleUpdateError(error: any): 'conflict' | 'unavailable' | 'auth' | 'rejected' | 'unknown' {
	if (error?.networkError || !error?.graphQLErrors?.length) return 'unknown';
	for (const item of error.graphQLErrors) {
		const status = item.extensions?.originalError?.statusCode ?? item.extensions?.status;
		// The existing application formatter returns code/message without extensions.
		const code = item.extensions?.code ?? item.code;
		if (status === 409 || code === 'CONFLICT' || item.message === 'Article changed; reload before saving again')
			return 'conflict';
		if (status === 404 || code === 'NOT_FOUND' || item.message === 'No data found!') return 'unavailable';
		if (status === 401 || ['UNAUTHENTICATED', 'FORBIDDEN'].includes(code)) return 'auth';
	}
	return error.graphQLErrors.some(
		(item: any) =>
			(item.extensions?.code ?? item.code) === 'INTERNAL_SERVER_ERROR' ||
			(item.extensions?.originalError?.statusCode ?? item.extensions?.status) >= 500,
	)
		? 'unknown'
		: 'rejected';
}

// Text-presence rules mirror Phase 16A; HTML safety is handled separately by article-html.ts.
const spaceEntities = new Set([
	'nbsp',
	'NonBreakingSpace',
	'ensp',
	'emsp',
	'emsp13',
	'emsp14',
	'numsp',
	'puncsp',
	'thinsp',
	'ThinSpace',
	'VeryThinSpace',
	'hairsp',
	'MediumSpace',
	'ThickSpace',
	'NegativeVeryThinSpace',
	'NegativeThinSpace',
	'NegativeMediumSpace',
	'NegativeThickSpace',
	'ZeroWidthSpace',
	'zwnj',
	'zwj',
	'lrm',
	'rlm',
	'NoBreak',
	'ApplyFunction',
	'af',
	'InvisibleTimes',
	'it',
	'InvisibleComma',
	'ic',
	'Tab',
	'NewLine',
	'shy',
]);

// These checks validate text presence, not HTML safety or a new storage format.
export function isArticleTitle(value: unknown): boolean {
	if (typeof value !== 'string' || Array.from(value).length > 50) return false;
	const text = value.replace(/[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu, '').trim();
	return Array.from(text).length >= 3;
}

export function isArticleContent(value: unknown): boolean {
	if (typeof value !== 'string' || Array.from(value).length < 3 || Array.from(value).length > 5000) return false;
	const text = value
		.replace(/<!--[\s\S]*?(?:-->|$)/g, '')
		.replace(/<(script|style|template|head|title|noscript)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
		.replace(/<\/?[a-z][a-z\d:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>|<![^>]*>/gi, ' ')
		.replace(
			/&(?:#([xX][\dA-Fa-f]+|\d+)|([a-zA-Z][a-zA-Z\d]+));?/g,
			(entity, code: string | undefined, name: string | undefined) => {
				if (name)
					return spaceEntities.has(name) && (entity.endsWith(';') || name === 'nbsp' || name === 'shy') ? ' ' : entity;
				if (!code) return entity;
				const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
				return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
			},
		)
		.replace(/[\s\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/gu, '');
	return text.length > 0;
}

export const articleCharacterCount = (value: string): number => Array.from(value).length;
