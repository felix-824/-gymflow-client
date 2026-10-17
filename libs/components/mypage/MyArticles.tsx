import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Pagination } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { useApolloClient, useMutation, useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { GET_MY_BOARD_ARTICLES } from '../../../apollo/user/query';
import { UPDATE_BOARD_ARTICLE } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getAuthSessionId, invalidateSession, updateUserInfo } from '../../auth';
import { articleUpdateError, readOwnedArticle } from '../../article';
import { sanitizeArticleHtml } from '../../article-html';
import { BoardArticleCategory, BoardArticleStatus } from '../../enums/board-article.enum';
import { BoardArticle, BoardArticles } from '../../types/board-article/board-article';
import { REACT_APP_API_URL } from '../../config';
import { sweetConfirmAlert } from '../../sweetAlert';

const articlesLimit = 6;
const authorRoles = ['USER', 'TRAINER', 'ADMIN'];

function articleExcerpt(html: string): string {
	if (typeof document === 'undefined') return '';
	const template = document.createElement('template');
	template.innerHTML = sanitizeArticleHtml(html);
	template.content
		.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6, tr, td, th, blockquote, pre, hr')
		.forEach((node) => {
			node.before(document.createTextNode(' '));
			node.after(document.createTextNode(' '));
		});
	const text = (template.content.textContent ?? '').replace(/\s+/g, ' ').trim();
	const characters = Array.from(text);
	if (characters.length <= 220) return text;
	const shortened = characters.slice(0, 220).join('');
	const boundary = shortened.lastIndexOf(' ');
	return (boundary > 160 ? shortened.slice(0, boundary) : shortened).trimEnd() + '…';
}

function ArticleRow({
	article,
	disabled,
	pending,
	onDelete,
	memberId,
}: {
	article: BoardArticle;
	disabled: boolean;
	pending: boolean;
	onDelete: (id: string) => void;
	memberId: string;
}) {
	const { t, i18n } = useTranslation('common');
	const [failedImage, setFailedImage] = useState('');
	const image = article.articleImage ? `${REACT_APP_API_URL}/${article.articleImage}` : '';
	const locale = i18n.language === 'kr' ? 'ko' : i18n.language || 'en';
	const date = new Date(article.createdAt);
	const validDate = !Number.isNaN(date.getTime());
	const href = `/community/detail?articleCategory=${article.articleCategory}&id=${article._id}`;
	const stats = [
		{ label: 'Views', value: article.articleViews, Icon: RemoveRedEyeOutlinedIcon },
		{ label: 'Likes', value: article.articleLikes, Icon: FavoriteBorderRoundedIcon },
		{ label: 'Comments', value: article.articleComments, Icon: ChatBubbleOutlineRoundedIcon },
	];
	return (
		<article className="my-article-row" data-article-id={article._id}>
			{image && image !== failedImage && (
				<Link href={href} passHref className="my-article-media" aria-label={article.articleTitle}>
					<img src={image} alt="" width={440} height={275} loading="lazy" onError={() => setFailedImage(image)} />
				</Link>
			)}
			<div className="my-article-content">
				<span className="my-article-category">{t(`Community discovery.${article.articleCategory}`)}</span>
				<h2>
					<Link href={href}>{article.articleTitle}</Link>
				</h2>
				<p className="my-article-excerpt">{articleExcerpt(article.articleContent)}</p>
				<div className="my-article-details">
					<div className="my-article-meta">
						{validDate && (
							<time dateTime={date.toISOString()}>
								{t('My articles.Published', {
									date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(
										date,
									),
								})}
							</time>
						)}
						{stats.map(({ label, value, Icon }) => (
							<span key={label}>
								<Icon aria-hidden="true" />
								{value.toLocaleString(locale)} <span>{t(`Community discovery.${label}`)}</span>
							</span>
						))}
					</div>
					<div className="my-article-actions">
						<Link href={href} passHref className="my-article-read">
							{t('My articles.Read Article')}
							<ArrowForwardRoundedIcon aria-hidden="true" />
						</Link>
						<div>
							<Link
								href={`/mypage?category=editArticle&articleId=${article._id}`}
								passHref
								className="my-article-edit"
								aria-label={t('My articles.Edit label', { title: article.articleTitle })}
							>
								<EditOutlinedIcon aria-hidden="true" />
								{t('My articles.Edit')}
							</Link>
							<button
								type="button"
								className="my-article-delete"
								aria-label={t('My articles.Delete label', { title: article.articleTitle })}
								aria-busy={pending}
								disabled={disabled || !readOwnedArticle(article, article._id, memberId)}
								onClick={() => onDelete(article._id)}
							>
								<DeleteOutlineRoundedIcon aria-hidden="true" />
								{t('My articles.Delete')}
							</button>
						</div>
					</div>
				</div>
			</div>
		</article>
	);
}

function ArticlesContent({ memberId, sessionIdentity, page }: { memberId: string; sessionIdentity: string; page: number }) {
	const { t } = useTranslation('common');
	const router = useRouter();
	const client = useApolloClient();
	const [updateBoardArticle] = useMutation(UPDATE_BOARD_ARTICLE);
	const [result, setResult] = useState<{ page: number; data: BoardArticles } | null>(null);
	const [loading, setLoading] = useState(true);
	const [listError, setListError] = useState(false);
	const [feedback, setFeedback] = useState('');
	const [pendingId, setPendingId] = useState('');
	const mounted = useRef(false);
	const request = useRef(0);
	const actionEpoch = useRef(0);
	const actionLock = useRef(false);
	const reading = useRef(false);
	const synchronized = useRef(false);
	const pageRef = useRef(page);
	const feedbackRef = useRef<HTMLDivElement>(null);
	if (pageRef.current !== page) synchronized.current = false;
	pageRef.current = page;
	const activeAccount = useCallback(
		() =>
			mounted.current &&
			authReadyVar() &&
			!authErrorVar() &&
			userVar()._id === memberId &&
			userVar().memberStatus === 'ACTIVE' &&
			authorRoles.includes(userVar().memberType) &&
			getAuthSessionId() === sessionIdentity &&
			Boolean(sessionIdentity),
		[memberId, sessionIdentity],
	);
	const pageHref = useCallback(
		(value: number) => ({
			pathname: '/mypage',
			query: {
				category: 'myArticles',
				...(value > 1 ? { page: value } : {}),
			},
		}),
		[],
	);

	/** APOLLO REQUESTS **/
	const loadArticles = useCallback(async () => {
		if (!activeAccount()) return false;
		const sequence = ++request.current;
		const requestedPage = pageRef.current;
		const current = () => activeAccount() && sequence === request.current && requestedPage === pageRef.current;
		reading.current = true;
		synchronized.current = false;
		setLoading(true);
		setListError(false);
		try {
			const { data } = await client.query<{ getMyBoardArticles: BoardArticles }>({
				query: GET_MY_BOARD_ARTICLES,
				variables: { input: { page: requestedPage, limit: articlesLimit } },
				fetchPolicy: 'no-cache',
				context: { queryDeduplication: false, handleErrorLocally: true },
			});
			if (!current()) return false;
			const next = data?.getMyBoardArticles;
			const total = next?.metaCounter?.[0]?.total ?? 0;
			if (
				!next ||
				!Array.isArray(next.list) ||
				!Number.isInteger(total) ||
				total < 0 ||
				next.list.some(
					(article) =>
						!article ||
						!/^[a-f\d]{24}$/i.test(article._id) ||
						article.memberId !== memberId ||
						article.articleStatus !== BoardArticleStatus.ACTIVE ||
						!Object.values(BoardArticleCategory).includes(article.articleCategory) ||
						typeof article.articleTitle !== 'string' ||
						typeof article.articleContent !== 'string' ||
						[article.articleViews, article.articleLikes, article.articleComments].some(
							(value) => !Number.isInteger(value) || value < 0,
						),
				)
			)
				throw new Error('Invalid owner article list');
			const lastPage = Math.max(1, Math.ceil(total / articlesLimit));
			if (requestedPage > lastPage) {
				const navigated = await router.replace(pageHref(lastPage), undefined, { shallow: true, scroll: false });
				if (!navigated) throw new Error('Could not update article page');
				return true;
			}
			if ((total === 0) !== (next.list.length === 0)) throw new Error('Inconsistent owner article list');
			setResult({ page: requestedPage, data: next });
			synchronized.current = true;
			return true;
		} catch (error) {
			if (current()) {
				if (articleUpdateError(error) === 'auth') void invalidateSession();
				else setListError(true);
			}
		} finally {
			if (current()) {
				reading.current = false;
				setLoading(false);
			}
		}
		return false;
	}, [activeAccount, client, memberId, pageHref, router]);

	/** LIFECYCLES **/
	useEffect(() => {
		mounted.current = true;
		const leave = () => {
			actionEpoch.current++;
		};
		router.events.on('routeChangeStart', leave);
		return () => {
			mounted.current = false;
			request.current++;
			actionEpoch.current++;
			router.events.off('routeChangeStart', leave);
		};
	}, [router.events]);
	useEffect(() => {
		void loadArticles();
	}, [loadArticles, page]);
	useEffect(() => {
		if (feedback) {
			feedbackRef.current?.focus();
			feedbackRef.current?.scrollIntoView({ block: 'center' });
		}
	}, [feedback]);

	/** HANDLERS **/
	const deleteArticle = async (id: string) => {
		if (
			!activeAccount() ||
			actionLock.current ||
			reading.current ||
			!synchronized.current ||
			result?.page !== pageRef.current
		)
			return;
		const target = result.data.list.find((article) => article._id === id);
		const owned = readOwnedArticle(target, id, memberId);
		if (!owned) return;
		// Lock before confirmation: React's pending state cannot guard two clicks in the same tick.
		actionLock.current = true;
		setPendingId(id);
		const sequence = request.current;
		const scope = actionEpoch.current;
		try {
			if (!(await sweetConfirmAlert(t('My articles.Confirm delete', { title: owned.articleTitle })))) return;
			if (
				!activeAccount() ||
				sequence !== request.current ||
				scope !== actionEpoch.current ||
				result.page !== pageRef.current
			)
				return;
			setFeedback('');
			synchronized.current = false;
			let outcome = 'Deleted';
			try {
				const response = await updateBoardArticle({
					variables: {
						input: { _id: id, articleStatus: BoardArticleStatus.DELETE, expectedRevision: owned.articleRevision },
					},
					fetchPolicy: 'no-cache',
					context: { handleErrorLocally: true },
				});
				const deleted = response.data?.updateBoardArticle;
				if (
					deleted?._id !== id ||
					deleted.articleStatus !== BoardArticleStatus.DELETE ||
					deleted.articleRevision !== owned.articleRevision + 1
				)
					throw new Error('Deletion unconfirmed');
			} catch (error) {
				const kind = articleUpdateError(error);
				if (kind === 'auth') {
					if (activeAccount()) void invalidateSession();
					return;
				}
				outcome =
					kind === 'conflict'
						? 'Conflict'
						: kind === 'unavailable'
						? 'Unavailable'
						: kind === 'rejected'
						? 'Delete failed'
						: 'Uncertain';
			}
			if (!activeAccount()) return;
			setFeedback(outcome);
			const refreshed = await loadArticles();
			if (activeAccount() && !refreshed && outcome === 'Deleted') setFeedback('Sync failed');
		} catch {
			if (activeAccount()) setFeedback('Delete failed');
		} finally {
			if (activeAccount()) {
				actionLock.current = false;
				setPendingId('');
			}
		}
	};
	const retry = async () => {
		if (reading.current || actionLock.current || !activeAccount()) return;
		const refreshed = await loadArticles();
		if (activeAccount() && refreshed && feedback === 'Sync failed') setFeedback('Deleted');
	};
	const paginationHandler = async (_event: React.ChangeEvent<unknown>, value: number) => {
		if (reading.current || actionLock.current || !activeAccount()) return;
		synchronized.current = false;
		reading.current = true;
		setLoading(true);
		try {
			if (!(await router.push(pageHref(value), undefined, { shallow: true, scroll: false }))) await loadArticles();
		} catch {
			if (activeAccount()) {
				reading.current = false;
				setLoading(false);
				setListError(true);
			}
		}
	};
	const current = result?.page === page ? result.data : null;
	const total = current?.metaCounter?.[0]?.total ?? 0;
	const pages = Math.ceil(total / articlesLimit);
	const busy = loading || Boolean(pendingId);
	return (
		<section className="my-articles-library" aria-label={t('My articles.Title')} aria-busy={busy}>
			{feedback && (
				<div
					ref={feedbackRef}
					tabIndex={-1}
					className="my-articles-feedback"
					role={feedback === 'Deleted' ? 'status' : 'alert'}
				>
					<p>{t(`My articles.${feedback}`)}</p>
				</div>
			)}
			{loading && (
				<p className="my-articles-state" role="status">
					{t('My articles.Loading')}
				</p>
			)}
			{listError && (
				<div className="my-articles-state" role="alert">
					<p>{t('My articles.Load failed')}</p>
					<button type="button" onClick={() => void retry()} disabled={busy}>
						{t('My articles.Retry')}
					</button>
				</div>
			)}
			{!loading &&
				!listError &&
				current &&
				(total === 0 ? (
					<div className="my-articles-empty">
						<h2>{t('My articles.Empty title')}</h2>
						<p>{t('My articles.Empty description')}</p>
					</div>
				) : (
					<>
						<div className="my-articles-list">
							{current.list.map((article) => (
								<ArticleRow
									key={article._id}
									article={article}
									memberId={memberId}
									onDelete={(id) => void deleteArticle(id)}
									disabled={busy || !synchronized.current}
									pending={pendingId === article._id}
								/>
							))}
						</div>
						<div className="my-articles-pagination">
							<p>
								{t('My articles.Page summary', {
									start: (page - 1) * articlesLimit + 1,
									end: (page - 1) * articlesLimit + current.list.length,
									total,
								})}
							</p>
							{pages > 1 && (
								<Pagination
									count={pages}
									page={page}
									shape="rounded"
									size="small"
									disabled={busy}
									onChange={(event, value) => void paginationHandler(event, value)}
									aria-label={t('My articles.Pagination')}
									getItemAriaLabel={(type, value, selected) =>
										t(
											`My articles.${
												type === 'page'
													? selected
														? 'Current page'
														: 'Go to page'
													: type === 'previous'
													? 'Previous page'
													: 'Next page'
											}`,
											{ page: value },
										)
									}
								/>
							)}
						</div>
					</>
				))}
		</section>
	);
}

const MyArticles = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const sessionIdentity = getAuthSessionId();
	const ready =
		authReady &&
		router.isReady &&
		!authError &&
		user._id &&
		user.memberStatus === 'ACTIVE' &&
		authorRoles.includes(user.memberType) &&
		sessionIdentity;
	const value =
		typeof router.query.page === 'string' && /^\d+$/.test(router.query.page) ? Number(router.query.page) : 1;
	const page = Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : 1;
	return (
		<div id="my-articles-page">
			<nav className="my-articles-context" aria-label={t('My articles.Context')}>
				<Link href="/community">{t('Community')}</Link>
				<span aria-hidden="true">/</span>
				<span aria-current="page">{t('My articles.Title')}</span>
			</nav>
			<header className="my-articles-intro">
				<div>
					<p className="my-articles-eyebrow">{t('Write article.COMMUNITY')}</p>
					<h1>{t('My articles.Title')}</h1>
					<p>{t('My articles.Description')}</p>
				</div>
				<Link href="/mypage?category=writeArticle" passHref className="my-articles-write">
					<AddRoundedIcon aria-hidden="true" />
					{t('Write article.Write Article')}
				</Link>
			</header>
			{ready ? (
				<ArticlesContent key={`${user._id}:${sessionIdentity}`} memberId={user._id} sessionIdentity={sessionIdentity} page={page} />
			) : (
				<div className="my-articles-state" role={authError ? 'alert' : 'status'}>
					<p>
						{t(
							`My articles.${
								authError ? 'Auth error' : !authReady || !router.isReady ? 'Restoring' : 'Login required'
							}`,
						)}
					</p>
					{authError ? (
						<button type="button" onClick={() => void updateUserInfo()}>
							{t('My articles.Retry')}
						</button>
					) : (
						authReady &&
						router.isReady && (
							<Link href={{ pathname: '/account/join', query: { referrer: '/mypage?category=myArticles' } }} passHref>
								{t('Login')} / {t('Register')}
							</Link>
						)
					)}
				</div>
			)}
		</div>
	);
};

export default MyArticles;
