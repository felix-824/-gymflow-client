import React, { useEffect, useState } from 'react';
import { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { Avatar, Box, Button, CircularProgress, IconButton, Pagination } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import { userVar } from '../../apollo/store';
import { BoardArticle } from '../../libs/types/board-article/board-article';
import { BoardArticleCategory } from '../../libs/enums/board-article.enum';
import { Comment } from '../../libs/types/comment/comment';
import { CommentInput, CommentsInquiry } from '../../libs/types/comment/comment.input';
import { CommentUpdate } from '../../libs/types/comment/comment.update';
import { CommentStatus } from '../../libs/enums/comment.enum';
import { T } from '../../libs/types/common';
import { Messages, REACT_APP_API_URL } from '../../libs/config';
import { GET_BOARD_ARTICLE, GET_COMMENTS } from '../../apollo/user/query';
import { CREATE_COMMENT, LIKE_TARGET_BOARD_ARTICLE, UPDATE_COMMENT } from '../../apollo/user/mutation';
import {
	sweetConfirmAlert,
	sweetMixinErrorAlert,
	sweetMixinSuccessAlert,
	sweetTopSmallSuccessAlert,
} from '../../libs/sweetAlert';

const ToastViewerComponent = dynamic(() => import('../../libs/components/community/TViewer'), { ssr: false });

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const CommunityDetail: NextPage = ({ initialInput }: T) => {
	const router = useRouter();
	const { query } = router;

	const articleId = typeof query?.id === 'string' ? query.id : '';
	const { t, i18n } = useTranslation('common');
	const [failedImage, setFailedImage] = useState('');
	const articleCategory = query?.articleCategory as string;

	const [comment, setComment] = useState<string>('');
	const [wordsCnt, setWordsCnt] = useState<number>(0);
	const [updatedCommentWordsCnt, setUpdatedCommentWordsCnt] = useState<number>(0);
	const user = useReactiveVar(userVar);
	const [comments, setComments] = useState<Comment[]>([]);
	const [total, setTotal] = useState<number>(0);
	const [searchFilter, setSearchFilter] = useState<CommentsInquiry>({
		...initialInput,
	});
	const [openBackdrop, setOpenBackdrop] = useState<boolean>(false);
	const [updatedComment, setUpdatedComment] = useState<string>('');
	const [updatedCommentId, setUpdatedCommentId] = useState<string>('');
	const [likeLoading, setLikeLoading] = useState<boolean>(false);
	const [boardArticle, setBoardArticle] = useState<BoardArticle>();

	/** APOLLO REQUESTS **/
	const [likeTargetBoardArticle] = useMutation(LIKE_TARGET_BOARD_ARTICLE);
	const [createComment, { loading: creatingComment }] = useMutation(CREATE_COMMENT);
	const [updateComment, { loading: updatingComment }] = useMutation(UPDATE_COMMENT);

	const {
		loading: boardArticleLoading,
		data: boardArticleData,
		error: getBoardArticleError,
		refetch: boardArticleRefetch,
	} = useQuery(GET_BOARD_ARTICLE, {
		fetchPolicy: 'network-only',
		variables: {
			input: articleId,
		},
		skip: !router.isReady || !articleId,
		notifyOnNetworkStatusChange: true,
		onCompleted(data: any) {
			setBoardArticle(data?.getBoardArticle);
		},
	});

	const {
		loading: getCommentsLoading,
		error: getCommentsError,
		refetch: getCommentsRefetch,
	} = useQuery(GET_COMMENTS, {
		fetchPolicy: 'cache-and-network',
		variables: {
			input: searchFilter,
		},
		skip: !searchFilter.search.articleId,
		notifyOnNetworkStatusChange: true,
		onCompleted(data: any) {
			setComments(data?.getComments?.list ?? []);
			setTotal(data?.getComments?.metaCounter?.[0]?.total || 0);
		},
	});

	/** LIFECYCLES **/
	useEffect(() => {
		if (articleId) setSearchFilter((previous) => ({ ...previous, page: 1, search: { articleId } }));
	}, [articleId]);

	/** HANDLERS **/
	const likeBoArticleHandler = async (user: any, id: any) => {
		try {
			if (likeLoading) return;
			if (!id) return;
			if (!user._id) throw new Error(Messages.error2);

			setLikeLoading(true);

			await likeTargetBoardArticle({
				variables: {
					input: id,
				},
			});

			await boardArticleRefetch({ input: articleId });
			await sweetTopSmallSuccessAlert('Success!', 800);
		} catch (err: any) {
			console.log('ERROR, likeBoArticleHandler:', err.message);
			sweetMixinErrorAlert(err.message).then();
		} finally {
			setLikeLoading(false);
		}
	};

	const createCommentHandler = async () => {
		if (creatingComment || !comment.trim()) return;

		try {
			if (!user?._id) throw new Error(Messages.error2);
			if (comment.trim().length > 100) throw new Error('Comments must contain 1–100 characters.');

			const commentInput: CommentInput = {
				articleId: articleId,
				commentContent: comment.trim(),
			};

			await createComment({
				variables: {
					input: commentInput,
				},
			});

			await getCommentsRefetch({ input: searchFilter });
			await boardArticleRefetch({ input: articleId });
			setComment('');
			setWordsCnt(0);
			await sweetMixinSuccessAlert('Successfully commented!');
		} catch (error: any) {
			await sweetMixinErrorAlert(error.message);
		}
	};

	const updateButtonHandler = async (commentId: string, commentStatus?: CommentStatus.DELETE) => {
		if (updatingComment) return;
		try {
			if (!user?._id) throw new Error(Messages.error2);
			if (!commentId) throw new Error('Select a comment to update!');
			if (updatedComment === comments?.find((comment) => comment?._id === commentId)?.commentContent) return;

			const updateData: CommentUpdate = {
				_id: commentId,
				...(commentStatus && { commentStatus: commentStatus }),
				...(!commentStatus && { commentContent: updatedComment.trim() }),
			};

			if (!updateData?.commentContent && !updateData?.commentStatus)
				throw new Error('Provide data to update your comment!');

			if (commentStatus) {
				if (await sweetConfirmAlert('Do you want to delete the comment?')) {
					await updateComment({
						variables: {
							input: updateData,
						},
					});
					await sweetMixinSuccessAlert('Successfully deleted!');
				} else return;
			} else {
				await updateComment({
					variables: {
						input: updateData,
					},
				});
				await sweetMixinSuccessAlert('Successfully updated!');
			}

			await getCommentsRefetch({ input: searchFilter });
			await boardArticleRefetch({ input: articleId });
		} catch (error: any) {
			await sweetMixinErrorAlert(error.message);
		} finally {
			setOpenBackdrop(false);
			setUpdatedComment('');
			setUpdatedCommentWordsCnt(0);
			setUpdatedCommentId('');
		}
	};

	const cancelButtonHandler = () => {
		setOpenBackdrop(false);
		setUpdatedComment('');
		setUpdatedCommentWordsCnt(0);
	};

	const updateCommentInputHandler = (value: string) => {
		if (value.length > 100) return;
		setUpdatedCommentWordsCnt(value.length);
		setUpdatedComment(value);
	};

	const paginationHandler = (e: T, value: number) => {
		setSearchFilter({ ...searchFilter, page: value });
	};

	const candidate: BoardArticle | undefined = boardArticleData?.getBoardArticle ?? boardArticle;
	const article = candidate?._id === articleId ? candidate : undefined;
	const category =
		article?.articleCategory ?? Object.values(BoardArticleCategory).find((value) => value === articleCategory);
	const communityHref = { pathname: '/community', query: category ? { articleCategory: category } : {} };
	const locale = i18n.language === 'kr' ? 'ko' : i18n.language || 'en';
	const memberHref = (memberId: string) => (memberId === user._id ? '/mypage' : '/member?memberId=' + memberId);
	const renderDate = (value?: Date) => {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return (
			<time dateTime={date.toISOString()}>
				{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(date)}
			</time>
		);
	};
	const author = article?.memberData;
	const authorName = author?.memberFullName?.trim() || author?.memberNick?.trim();
	const authorId = author?._id || article?.memberId;
	const imageSrc = article?.articleImage ? REACT_APP_API_URL + '/' + article.articleImage : '';
	const liked = Boolean(article?.meLiked?.[0]?.myFavorite);
	const loadingArticle = !router.isReady || (boardArticleLoading && !article);
	const commentsLoading = searchFilter.search.articleId !== articleId || getCommentsLoading;
	const retryCommentsHandler = async () => {
		try {
			await getCommentsRefetch({ input: searchFilter });
		} catch {
			/* Apollo exposes the error below. */
		}
	};

	return (
		<div id="community-detail-page">
			<div className="article-detail-inner">
				<nav className="article-breadcrumb" aria-label={t('Article detail.Breadcrumb')}>
					<Link href={communityHref} passHref>
						<ArrowBackRoundedIcon aria-hidden={true} />
						{t('Community')}
					</Link>
					{category && (
						<>
							<span aria-hidden={true}>/</span>
							<span>{t('Community discovery.' + category)}</span>
						</>
					)}
				</nav>
				{loadingArticle ? (
					<div className="article-state" role="status">
						<CircularProgress size={24} aria-hidden={true} />
						<p>{t('Article detail.Loading')}</p>
					</div>
				) : getBoardArticleError || !articleId || !article ? (
					<div className="article-state" role="alert">
						<h1>{t('Article detail.Unavailable')}</h1>
						<p>{t('Article detail.Unavailable description')}</p>
						<Link href={communityHref}>{t('Article detail.Back to community')}</Link>
					</div>
				) : (
					<>
						<article>
							<header className="article-header">
								<span className="article-category">{t('Community discovery.' + article.articleCategory)}</span>
								<h1>{article.articleTitle}</h1>
								<div className="article-byline">
									{(authorName || author?.memberImage) && authorId && (
										<Link
											href={memberHref(authorId)}
											className="article-author"
											passHref
											aria-label={t('Article detail.Author profile')}
										>
											<Avatar
												src={author?.memberImage ? REACT_APP_API_URL + '/' + author.memberImage : undefined}
												alt=""
											>
												<AccountCircleOutlinedIcon />
											</Avatar>
											{authorName && (
												<span>
													<strong>{authorName}</strong>
													{author?.memberFullName?.trim() &&
														author.memberNick?.trim() &&
														authorName !== author.memberNick.trim() && (
															<span className="article-author-nick">{author.memberNick}</span>
														)}
												</span>
											)}
										</Link>
									)}
									{renderDate(article.createdAt)}
								</div>
							</header>
							{imageSrc && failedImage !== imageSrc && (
								<figure className="article-cover">
									<Box
										component="img"
										src={imageSrc}
										alt=""
										width={1200}
										height={750}
										onError={() => setFailedImage(imageSrc)}
									/>
								</figure>
							)}
							<div className="article-reading-column">
								<div className="article-body">
									<ToastViewerComponent key={article._id} markdown={article.articleContent} />
								</div>
								<div className="article-engagement" aria-label={t('Article detail.Engagement')}>
									<Button
										className="article-like"
										aria-pressed={liked}
										disabled={likeLoading}
										onClick={() => likeBoArticleHandler(user, article._id)}
										startIcon={liked ? <FavoriteRoundedIcon /> : <FavoriteBorderRoundedIcon />}
									>
										{t('Article detail.' + (liked ? 'Unlike' : 'Like'))}
										{typeof article.articleLikes === 'number' && (
											<span>{article.articleLikes.toLocaleString(locale)}</span>
										)}
									</Button>
									{typeof article.articleViews === 'number' && (
										<span>
											<RemoveRedEyeOutlinedIcon aria-hidden={true} />
											{t('Article detail.Views', { count: article.articleViews })}
										</span>
									)}
									{typeof article.articleComments === 'number' && (
										<span>
											<ChatBubbleOutlineRoundedIcon aria-hidden={true} />
											{t('Article detail.Comment count', { count: article.articleComments })}
										</span>
									)}
								</div>
							</div>
						</article>
						<section className="article-comments article-reading-column" aria-labelledby="article-comments-title">
							<div className="article-comments-heading">
								<h2 id="article-comments-title">{t('Article detail.Comments')}</h2>
								{!commentsLoading && !getCommentsError && <span>{total.toLocaleString(locale)}</span>}
							</div>
							<form
								className="article-comment-form"
								onSubmit={(event) => {
									event.preventDefault();
									void createCommentHandler();
								}}
							>
								<label htmlFor="article-new-comment">{t('Article detail.Leave comment')}</label>
								<textarea
									id="article-new-comment"
									value={comment}
									maxLength={100}
									rows={3}
									onChange={(event) => {
										if (event.target.value.length > 100) return;
										setWordsCnt(event.target.value.length);
										setComment(event.target.value);
									}}
								/>
								<div className="article-comment-form-actions">
									<span>{wordsCnt}/100</span>
									<Button type="submit" disabled={creatingComment || !comment.trim()}>
										{t('Article detail.Post comment')}
									</Button>
								</div>
							</form>
							<div aria-busy={commentsLoading}>
								{getCommentsError ? (
									<div className="article-comments-state" role="alert">
										<p>{t('Article detail.Comments error')}</p>
										<Button onClick={retryCommentsHandler} disabled={commentsLoading}>
											{t('Article detail.Retry')}
										</Button>
									</div>
								) : commentsLoading ? (
									<p className="article-comments-state" role="status">
										{t('Article detail.Comments loading')}
									</p>
								) : comments.length ? (
									<div className="article-comment-list">
										{comments.map((commentData) => {
											const name =
												commentData.memberData?.memberFullName?.trim() || commentData.memberData?.memberNick?.trim();
											const memberId = commentData.memberData?._id || commentData.memberId;
											const editing = openBackdrop && updatedCommentId === commentData._id;
											return (
												<article className="article-comment" key={commentData._id}>
													<header className="article-comment-header">
														<div className="article-comment-identity">
															<Link
																href={memberHref(memberId)}
																className="article-author"
																aria-label={t('Article detail.Author profile')}
																passHref
															>
																<Avatar
																	src={
																		commentData.memberData?.memberImage
																			? REACT_APP_API_URL + '/' + commentData.memberData.memberImage
																			: undefined
																	}
																	alt=""
																>
																	<AccountCircleOutlinedIcon />
																</Avatar>
																{name && <strong>{name}</strong>}
															</Link>
															{renderDate(commentData.createdAt)}
														</div>
														{commentData.memberId === user._id && !editing && (
															<div className="article-comment-tools">
																<IconButton
																	aria-label={t('Article detail.Edit comment')}
																	disabled={updatingComment}
																	onClick={() => {
																		setUpdatedComment(commentData.commentContent);
																		setUpdatedCommentWordsCnt(commentData.commentContent.length);
																		setUpdatedCommentId(commentData._id);
																		setOpenBackdrop(true);
																	}}
																>
																	<EditOutlinedIcon />
																</IconButton>
																<IconButton
																	aria-label={t('Article detail.Delete comment')}
																	disabled={updatingComment}
																	onClick={() => {
																		setUpdatedCommentId(commentData._id);
																		void updateButtonHandler(commentData._id, CommentStatus.DELETE);
																	}}
																>
																	<DeleteOutlineRoundedIcon />
																</IconButton>
															</div>
														)}
													</header>
													{editing ? (
														<form
															className="article-comment-form article-comment-edit"
															onSubmit={(event) => {
																event.preventDefault();
																void updateButtonHandler(updatedCommentId);
															}}
														>
															<label htmlFor={'article-edit-' + commentData._id}>
																{t('Article detail.Edit comment')}
															</label>
															<textarea
																autoFocus
																id={'article-edit-' + commentData._id}
																value={updatedComment}
																maxLength={100}
																rows={3}
																onChange={(event) => updateCommentInputHandler(event.target.value)}
															/>
															<div className="article-comment-form-actions">
																<span>{updatedCommentWordsCnt}/100</span>
																<div>
																	<Button onClick={cancelButtonHandler} disabled={updatingComment}>
																		{t('Article detail.Cancel')}
																	</Button>
																	<Button type="submit" disabled={updatingComment || !updatedComment.trim()}>
																		{t('Article detail.Save')}
																	</Button>
																</div>
															</div>
														</form>
													) : (
														<p className="article-comment-content">{commentData.commentContent}</p>
													)}
												</article>
											);
										})}
									</div>
								) : (
									<p className="article-comments-state" role="status">
										{t('Article detail.No comments')}
									</p>
								)}
							</div>
							{!getCommentsError && !commentsLoading && total > searchFilter.limit && (
								<Pagination
									className="article-comments-pagination"
									aria-label={t('Article detail.Comment pages')}
									count={Math.ceil(total / searchFilter.limit)}
									page={searchFilter.page}
									onChange={paginationHandler}
									getItemAriaLabel={(type, page, selected) =>
										type === 'page'
											? t('Community discovery.' + (selected ? 'Current page' : 'Go to page'), { page })
											: t('Community discovery.' + (type === 'previous' ? 'Previous' : 'Next'))
									}
								/>
							)}
						</section>
						<nav
							className="article-bottom-navigation article-reading-column"
							aria-label={t('Article detail.Article navigation')}
						>
							<Link href={communityHref} passHref>
								<ArrowBackRoundedIcon aria-hidden={true} />
								{t('Article detail.Back to community')}
							</Link>
							<Link href="/mypage?category=writeArticle" passHref>
								<EditOutlinedIcon aria-hidden={true} />
								{t('Community discovery.Write article')}
							</Link>
						</nav>
					</>
				)}
			</div>
		</div>
	);
};
CommunityDetail.defaultProps = {
	initialInput: { page: 1, limit: 5, sort: 'createdAt', direction: 'DESC', search: { articleId: '' } },
};

export default withLayoutBasic(CommunityDetail);
