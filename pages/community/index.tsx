import React, { useMemo } from 'react';
import { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button, CircularProgress, Pagination } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useMutation, useQuery } from '@apollo/client';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import CommunityStory from '../../libs/components/community/CommunityStory';
import { BoardArticle } from '../../libs/types/board-article/board-article';
import { BoardArticlesInquiry } from '../../libs/types/board-article/board-article.input';
import { BoardArticleCategory } from '../../libs/enums/board-article.enum';
import { Direction } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { GET_BOARD_ARTICLES } from '../../apollo/user/query';
import { LIKE_TARGET_BOARD_ARTICLE } from '../../apollo/user/mutation';
import { Messages } from '../../libs/config';
import { sweetMixinErrorAlert, sweetTopSmallSuccessAlert } from '../../libs/sweetAlert';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const Community: NextPage = () => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const categoryValue = router.query.articleCategory;
	const category = Object.values(BoardArticleCategory).find((value) => value === categoryValue);
	const pageValue = Number(router.query.page);
	const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
	const searchCommunity = useMemo<BoardArticlesInquiry>(
		() => ({
			page,
			limit: 6,
			sort: 'createdAt',
			direction: Direction.DESC,
			search: category ? { articleCategory: category } : {},
		}),
		[category, page],
	);
	const categories = [undefined, ...Object.values(BoardArticleCategory)];
	const { articleCategory: ignoredCategory, page: ignoredPage, ...otherQuery } = router.query;
	const categoryHref = (value?: BoardArticleCategory) => ({
		pathname: '/community',
		query: { ...otherQuery, ...(value ? { articleCategory: value } : {}) },
	});

	/** APOLLO REQUESTS **/
	const [likeTargetBoardArticle] = useMutation(LIKE_TARGET_BOARD_ARTICLE);
	const {
		loading,
		data,
		error,
		refetch: boardArticlesRefetch,
	} = useQuery(GET_BOARD_ARTICLES, {
		fetchPolicy: 'network-only',
		variables: { input: searchCommunity },
		skip: !router.isReady,
		notifyOnNetworkStatusChange: true,
	});
	const boardArticles: BoardArticle[] = data?.getBoardArticles?.list ?? [];
	const totalCount: number = data?.getBoardArticles?.metaCounter?.[0]?.total ?? 0;
	const busy = loading || !router.isReady;

	/** HANDLERS **/
	const paginationHandler = async (event: React.ChangeEvent<unknown>, value: number) => {
		const destination = categoryHref(category);
		await router.push({ ...destination, query: { ...destination.query, page: value } }, undefined, {
			shallow: true,
			scroll: false,
		});
	};

	const likeArticleHandler = async (event: React.MouseEvent, user: T, id: string) => {
		try {
			event.stopPropagation();
			if (!id) return;
			if (!user._id) throw new Error(Messages.error2);
			await likeTargetBoardArticle({ variables: { input: id } });
			await boardArticlesRefetch({ input: searchCommunity });
			await sweetTopSmallSuccessAlert('success', 800);
		} catch (err: any) {
			sweetMixinErrorAlert(err.message).then();
		}
	};

	const retryArticlesHandler = async () => {
		try {
			await boardArticlesRefetch({ input: searchCommunity });
		} catch {
			// Apollo exposes request failures through the error state below.
		}
	};

	return (
		<div id="community-list-page">
			<div className="community-discovery-inner">
				<header className="community-intro">
					<div>
						<h1>{t('Community discovery.Title')}</h1>
						<p>{t('Community discovery.Description')}</p>
					</div>
					<Link href="/mypage?category=writeArticle" passHref className="community-write-link">
						<EditOutlinedIcon aria-hidden={true} />
						{t('Community discovery.Write article')}
					</Link>
				</header>
				<nav className="community-categories" aria-label={t('Community discovery.Categories')}>
					{categories.map((value) => (
						<Link
							key={value ?? 'all'}
							href={categoryHref(value)}
							shallow
							scroll={false}
							aria-current={category === value ? 'page' : undefined}
						>
							{t(`Community discovery.${value ?? 'All'}`)}
						</Link>
					))}
				</nav>
				<section className="community-latest" aria-labelledby="community-latest-title" aria-busy={busy}>
					<div className="community-latest-heading">
						<h2 id="community-latest-title">{t('Community discovery.Latest stories')}</h2>
						{!busy && !error && <p>{t('Community discovery.Article count', { count: totalCount })}</p>}
					</div>
					{error ? (
						<div className="community-result-state" role="alert">
							<h3>{t('Community discovery.Error title')}</h3>
							<p>{t('Community discovery.Error description')}</p>
							<Button onClick={retryArticlesHandler} disabled={busy}>
								{t('Community discovery.Retry')}
							</Button>
						</div>
					) : busy ? (
						<div className="community-result-state" role="status">
							<CircularProgress size={24} aria-hidden={true} />
							<p>{t('Community discovery.Loading')}</p>
						</div>
					) : boardArticles.length ? (
						<div className="community-story-list">
							{boardArticles.map((article, index) => (
								<CommunityStory
									key={article._id}
									article={article}
									lead={index === 0}
									likeArticleHandler={likeArticleHandler}
								/>
							))}
						</div>
					) : (
						<div className="community-result-state" role="status">
							<h3>{t('Community discovery.Empty title')}</h3>
							<p>{t('Community discovery.Empty description')}</p>
						</div>
					)}
					{!busy && !error && totalCount > searchCommunity.limit && (
						<Pagination
							className="community-pagination"
							aria-label={t('Community discovery.Pagination')}
							count={Math.ceil(totalCount / searchCommunity.limit)}
							page={page}
							onChange={paginationHandler}
							getItemAriaLabel={(type, value, selected) =>
								type === 'page'
									? t(`Community discovery.${selected ? 'Current page' : 'Go to page'}`, { page: value })
									: t(`Community discovery.${type === 'previous' ? 'Previous' : 'Next'}`)
							}
						/>
					)}
				</section>
			</div>
		</div>
	);
};

export default withLayoutBasic(Community);
