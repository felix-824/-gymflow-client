import React, { useState } from 'react';
import Link from 'next/link';
import { Box } from '@mui/material';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { useTranslation } from 'next-i18next';
import { BoardArticle } from '../../types/board-article/board-article';
import { REACT_APP_API_URL } from '../../config';

interface CommunityCardProps {
	article: BoardArticle;
	featured: boolean;
}

const CommunityCard = ({ article, featured }: CommunityCardProps) => {
	const { t, i18n } = useTranslation('common');
	const [failedImage, setFailedImage] = useState('');
	const imageSrc = article.articleImage ? `${REACT_APP_API_URL}/${article.articleImage}` : '';
	const date = article.createdAt ? new Date(article.createdAt) : null;
	const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
	const locale = i18n.language === 'kr' ? 'ko' : i18n.language || 'en';
	const author = article.memberData?.memberNick?.trim();
	const stats = [
		{ label: 'Views', value: article.articleViews, Icon: RemoveRedEyeOutlinedIcon },
		{ label: 'Likes', value: article.articleLikes, Icon: FavoriteBorderRoundedIcon },
		{ label: 'Comments', value: article.articleComments, Icon: ChatBubbleOutlineRoundedIcon },
	];

	return (
		<article className={`home-community-article${featured ? ' is-featured' : ''}`}>
			<Link
				href={`/community/detail?articleCategory=${article.articleCategory}&id=${article._id}`}
				passHref
				className="home-community-article-link"
			>
				<div className="home-community-media">
					{imageSrc && imageSrc !== failedImage ? (
						<Box
							component="img"
							src={imageSrc}
							alt=""
							loading="lazy"
							width={640}
							height={420}
							onError={() => setFailedImage(imageSrc)}
						/>
					) : (
						<span className="home-community-image-fallback" aria-hidden={true}>
							<ArticleOutlinedIcon />
						</span>
					)}
				</div>
				<div className="home-community-story">
					<span className="home-community-category">{t(`Home community.${article.articleCategory}`)}</span>
					<h3>{article.articleTitle}</h3>
					{(author || validDate) && (
						<div className="home-community-byline">
							{author && <span>{author}</span>}
							{validDate && (
								<time dateTime={validDate.toISOString()}>
									{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(
										validDate,
									)}
								</time>
							)}
						</div>
					)}
					<div className="home-community-stats">
						{stats.map(({ label, value, Icon }) =>
							typeof value === 'number' && Number.isFinite(value) ? (
								<span key={label}>
									<Icon aria-hidden={true} />
									<span className="home-community-sr-only">{t(`Home community.${label}`)}: </span>
									{value.toLocaleString(locale)}
								</span>
							) : null,
						)}
					</div>
				</div>
			</Link>
		</article>
	);
};

export default CommunityCard;
