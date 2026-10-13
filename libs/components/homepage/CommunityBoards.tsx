import React, { useState } from 'react';
import Link from 'next/link';
import { Button, CircularProgress } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useTranslation } from 'next-i18next';
import CommunityCard from './CommunityCard';
import { BoardArticle } from '../../types/board-article/board-article';
import { GET_BOARD_ARTICLES } from '../../../apollo/user/query';
import { useQuery } from '@apollo/client';
import { BoardArticleCategory } from '../../enums/board-article.enum';
import { T } from '../../types/common';

const CommunityBoards = () => {
	const { t } = useTranslation('common');
	const [searchCommunity] = useState({ page: 1, sort: 'articleViews', direction: 'DESC' });
	const [newsArticles, setNewsArticles] = useState<BoardArticle[]>([]);
	const [freeArticles, setFreeArticles] = useState<BoardArticle[]>([]);

	/** APOLLO REQUESTS **/
	const {
		loading: getNewsArticlesLoading,
		error: getNewsArticlesError,
		refetch: getNewsArticlesRefetch,
	} = useQuery(GET_BOARD_ARTICLES, {
		fetchPolicy: 'network-only',
		variables: {
			input: { ...searchCommunity, limit: 6, search: { articleCategory: BoardArticleCategory.NEWS } },
		},
		notifyOnNetworkStatusChange: true,
		onCompleted: (data: T) => setNewsArticles(data?.getBoardArticles?.list ?? []),
	});
	const {
		loading: getFreeArticlesLoading,
		error: getFreeArticlesError,
		refetch: getFreeArticlesRefetch,
	} = useQuery(GET_BOARD_ARTICLES, {
		fetchPolicy: 'network-only',
		variables: {
			input: { ...searchCommunity, limit: 3, search: { articleCategory: BoardArticleCategory.FREE } },
		},
		notifyOnNetworkStatusChange: true,
		onCompleted: (data: T) => setFreeArticles(data?.getBoardArticles?.list ?? []),
	});

	const loading = getNewsArticlesLoading || getFreeArticlesLoading;
	const hasError = Boolean(getNewsArticlesError || getFreeArticlesError);
	const supportedCategories = ['FREE', 'TIP', 'SUCCESS_STORY', 'NEWS'];
	const articles = newsArticles
		.flatMap((article, index) => [article, freeArticles[index]])
		.concat(freeArticles.slice(newsArticles.length))
		.filter(
			(article, index, list): article is BoardArticle =>
				Boolean(article) &&
				supportedCategories.includes(article.articleCategory) &&
				list.findIndex((item) => item?._id === article._id) === index,
		)
		.slice(0, 3);

	const retryArticlesHandler = async () => {
		try {
			await Promise.all([getNewsArticlesRefetch(), getFreeArticlesRefetch()]);
		} catch {
			// Apollo exposes failed requests through the section's error state.
		}
	};

	return (
		<section className="home-community-highlights" aria-labelledby="home-community-title">
			<div className="home-community-inner">
				<header className="home-community-header">
					<div>
						<h2 id="home-community-title">{t('Home community.Title')}</h2>
						<p>{t('Home community.Description')}</p>
					</div>
					<Link href="/community?articleCategory=FREE" passHref className="home-community-view-all">
						{t('Home community.View all')}
						<ArrowForwardRoundedIcon aria-hidden={true} />
					</Link>
				</header>
				<div className="home-community-content" aria-busy={loading}>
					{articles.length > 0 && (
						<div className="home-community-grid">
							{articles.map((article, index) => (
								<CommunityCard article={article} featured={index === 0} key={article._id} />
							))}
						</div>
					)}
					{hasError ? (
						<div className="home-community-state" role="alert">
							<p>{t('Home community.Error')}</p>
							<Button onClick={retryArticlesHandler} disabled={loading}>
								{t('Home community.Retry')}
							</Button>
						</div>
					) : loading ? (
						<div className="home-community-state" role="status">
							<CircularProgress size={22} aria-hidden={true} />
							<p>{t('Home community.Loading')}</p>
						</div>
					) : articles.length === 0 ? (
						<div className="home-community-state" role="status">
							<p>{t('Home community.Empty')}</p>
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
};

export default CommunityBoards;
