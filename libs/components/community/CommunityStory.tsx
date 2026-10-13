import React, { useState } from 'react';
import Link from 'next/link';
import { Box, IconButton } from '@mui/material';
import { useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { userVar } from '../../../apollo/store';
import { REACT_APP_API_URL } from '../../config';
import { BoardArticle } from '../../types/board-article/board-article';
import { T } from '../../types/common';

interface CommunityStoryProps {
	article: BoardArticle;
	lead: boolean;
	likeArticleHandler: (event: React.MouseEvent, user: T, id: string) => Promise<void>;
}

const CommunityStory = ({ article, lead, likeArticleHandler }: CommunityStoryProps) => {
	const { t, i18n } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const [failedImage, setFailedImage] = useState('');
	const imageSrc = article.articleImage ? `${REACT_APP_API_URL}/${article.articleImage}` : '';
	const href = { pathname: '/community/detail', query: { articleCategory: article.articleCategory, id: article._id } };
	const author = article.memberData?.memberNick?.trim();
	const authorId = article.memberData?._id;
	const date = article.createdAt ? new Date(article.createdAt) : null;
	const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
	const locale = i18n.language === 'kr' ? 'ko' : i18n.language || 'en';
	const liked = Boolean(article.meLiked?.[0]?.myFavorite);
	const [liking, setLiking] = useState(false);
	const stats = [
		{ label: 'Views', value: article.articleViews, Icon: RemoveRedEyeOutlinedIcon },
		{ label: 'Comments', value: article.articleComments, Icon: ChatBubbleOutlineRoundedIcon },
	];

	const likeHandler = async (event: React.MouseEvent) => {
		setLiking(true);
		try {
			await likeArticleHandler(event, user, article._id);
		} finally {
			setLiking(false);
		}
	};

	return (
		<article className={`community-story${lead ? ' is-lead' : ''}`}>
			<Link href={href} className="community-story-media" aria-label={article.articleTitle}>
				{imageSrc && failedImage !== imageSrc ? (
					<Box
						component="img"
						src={imageSrc}
						alt=""
						width={720}
						height={450}
						loading={lead ? 'eager' : 'lazy'}
						onError={() => setFailedImage(imageSrc)}
					/>
				) : (
					<span className="community-story-fallback" aria-hidden={true}>
						<ArticleOutlinedIcon />
					</span>
				)}
			</Link>
			<div className="community-story-content">
				<span className="community-story-category">{t(`Community discovery.${article.articleCategory}`)}</span>
				<h3>
					<Link href={href}>{article.articleTitle}</Link>
				</h3>
				{(author || validDate) && (
					<div className="community-story-byline">
						{author &&
							(authorId ? (
								<Link href={authorId === user._id ? '/mypage' : `/member?memberId=${authorId}`}>{author}</Link>
							) : (
								<span>{author}</span>
							))}
						{validDate && (
							<time dateTime={validDate.toISOString()}>
								{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(validDate)}
							</time>
						)}
					</div>
				)}
				<div className="community-story-stats">
					{stats.map(({ label, value, Icon }) =>
						typeof value === 'number' && Number.isFinite(value) ? (
							<span key={label}>
								<Icon aria-hidden={true} />
								<span className="community-sr-only">{t(`Community discovery.${label}`)}: </span>
								{value.toLocaleString(locale)}
							</span>
						) : null,
					)}
					{typeof article.articleLikes === 'number' && Number.isFinite(article.articleLikes) && (
						<span>
							<IconButton
								className="community-story-like"
								aria-label={t(`Community discovery.${liked ? 'Unlike article' : 'Like article'}`, {
									title: article.articleTitle,
								})}
								aria-pressed={liked}
								disabled={liking}
								onClick={likeHandler}
							>
								{liked ? <FavoriteRoundedIcon /> : <FavoriteBorderRoundedIcon />}
							</IconButton>
							<span className="community-sr-only">{t('Community discovery.Likes')}: </span>
							{article.articleLikes.toLocaleString(locale)}
						</span>
					)}
				</div>
			</div>
		</article>
	);
};

export default CommunityStory;
