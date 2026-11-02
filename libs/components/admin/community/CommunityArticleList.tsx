import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
	Avatar,
	Button,
	Fade,
	Menu,
	MenuItem,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	useMediaQuery,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import Moment from 'react-moment';
import { BoardArticle } from '../../../types/board-article/board-article';
import { BoardArticleStatus } from '../../../enums/board-article.enum';
import { REACT_APP_API_URL } from '../../../config';
import { adminCommunityLabels } from '../../../admin-community-labels';

type Labels = ReturnType<typeof adminCommunityLabels>;
interface CommunityArticleListProps {
	articles: BoardArticle[];
	anchorEl: any;
	menuIconClickHandler: any;
	menuIconCloseHandler: any;
	updateArticleHandler: any;
	removeArticleHandler: any;
}

const ArticleIdentity = ({ article }: { article: BoardArticle }) =>
	article.articleStatus === BoardArticleStatus.ACTIVE ? (
		<Link
			className="article-identity"
			href={`/community/detail?articleCategory=${article.articleCategory}&id=${article._id}`}
		>
			{article.articleTitle}
		</Link>
	) : (
		<span className="article-identity">{article.articleTitle}</span>
	);

const ArticleWriter = ({ article }: { article: BoardArticle }) => {
	const content = (
		<>
			<Avatar
				alt=""
				src={
					article.memberData?.memberImage
						? `${REACT_APP_API_URL}/${article.memberData.memberImage}`
						: '/img/profile/defaultUser.svg'
				}
			/>
			<span>{article.memberData?.memberNick ?? '—'}</span>
		</>
	);
	return article.memberData?._id ? (
		<Link className="article-writer" href={`/member?memberId=${article.memberData._id}`}>
			{content}
		</Link>
	) : (
		<span className="article-writer">{content}</span>
	);
};

const ArticleDetails = ({ article, labels }: { article: BoardArticle; labels: Labels }) => (
	<details className="article-details">
		<summary aria-label={`${labels.details}: ${article.articleTitle}`}>
			{labels.details}
			<ExpandMoreRoundedIcon aria-hidden="true" />
		</summary>
		<dl>
			<div>
				<dt>{labels.articleId}</dt>
				<dd>{article._id}</dd>
			</div>
			<div>
				<dt>{labels.category}</dt>
				<dd>{labels.categories[article.articleCategory]}</dd>
			</div>
			<div>
				<dt>{labels.views}</dt>
				<dd>{article.articleViews}</dd>
			</div>
			<div>
				<dt>{labels.likes}</dt>
				<dd>{article.articleLikes}</dd>
			</div>
			<div>
				<dt>{labels.registerDate}</dt>
				<dd>
					<Moment format="DD.MM.YY HH:mm">{article.createdAt}</Moment>
				</dd>
			</div>
		</dl>
	</details>
);

const ArticleControl = ({
	article,
	index,
	labels,
	controls,
}: {
	article: BoardArticle;
	index: number;
	labels: Labels;
	controls: CommunityArticleListProps;
}) => {
	const id = 'article-status-' + article._id;
	const anchor = controls.anchorEl[index];
	const open = Boolean(anchor?.isConnected);
	return article.articleStatus === BoardArticleStatus.DELETE ? (
		<Button
			className="article-control is-delete"
			aria-label={`${labels.remove}: ${article.articleTitle}`}
			onClick={() => controls.removeArticleHandler(article._id)}
			startIcon={<DeleteOutlineRoundedIcon />}
		>
			{labels.statuses.DELETE}
		</Button>
	) : (
		<>
			<Button
				id={id}
				className="article-control"
				aria-label={`${labels.changeStatus}: ${article.articleTitle}, ${labels.statuses[article.articleStatus]}`}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? id + '-menu' : undefined}
				onClick={(event) => controls.menuIconClickHandler(event, index)}
				endIcon={<ExpandMoreRoundedIcon />}
			>
				{labels.statuses[article.articleStatus]}
			</Button>
			<Menu
				className="admin-community-menu"
				anchorEl={open ? anchor : null}
				open={open}
				onClose={controls.menuIconCloseHandler}
				TransitionComponent={Fade}
				MenuListProps={{ id: id + '-menu', 'aria-labelledby': id }}
			>
				{Object.values(BoardArticleStatus)
					.filter((status) => status !== article.articleStatus)
					.map((status) => (
						<MenuItem
							key={status}
							onClick={() => controls.updateArticleHandler({ _id: article._id, articleStatus: status })}
						>
							{labels.statuses[status]}
						</MenuItem>
					))}
			</Menu>
		</>
	);
};

const CommunityArticleList = (props: CommunityArticleListProps) => {
	const { articles } = props;
	const labels = adminCommunityLabels(useRouter().locale);
	const mobile = useMediaQuery('(max-width:599px)');
	if (!articles.length) return <p className="article-empty">{labels.empty}</p>;
	return mobile ? (
		<ul className="article-mobile-list" aria-label={labels.title}>
			{articles.map((article, index) => (
				<li className="article-mobile-row" key={article._id}>
					<ArticleIdentity article={article} />
					<p className="article-mobile-category">{labels.categories[article.articleCategory]}</p>
					<div className="article-mobile-operation">
						<div>
							<span className="article-writer-label">{labels.writer}</span>
							<ArticleWriter article={article} />
						</div>
						<ArticleControl article={article} index={index} labels={labels} controls={props} />
					</div>
					<ArticleDetails article={article} labels={labels} />
				</li>
			))}
		</ul>
	) : (
		<TableContainer>
			<Table aria-label={labels.title} className="article-table">
				<TableHead>
					<TableRow>
						{[
							['article', labels.article],
							['writer', labels.writer],
							['category', labels.category],
							['engagement', labels.engagement],
							['date', labels.registerDate],
							['status', labels.status],
						].map(([key, label]) => (
							<TableCell className={'article-col-' + key} key={key}>
								{label}
							</TableCell>
						))}
					</TableRow>
				</TableHead>
				<TableBody>
					{articles.map((article, index) => (
						<TableRow hover key={article._id}>
							<TableCell className="article-col-article">
								<ArticleIdentity article={article} />
								<ArticleDetails article={article} labels={labels} />
							</TableCell>
							<TableCell className="article-col-writer">
								<ArticleWriter article={article} />
							</TableCell>
							<TableCell className="article-col-category">{labels.categories[article.articleCategory]}</TableCell>
							<TableCell className="article-col-engagement">
								<span>
									{labels.views}: {article.articleViews}
								</span>
								<span>
									{labels.likes}: {article.articleLikes}
								</span>
							</TableCell>
							<TableCell className="article-col-date">
								<Moment format="DD.MM.YY HH:mm">{article.createdAt}</Moment>
							</TableCell>
							<TableCell className="article-col-status">
								<ArticleControl article={article} index={index} labels={labels} controls={props} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	);
};
export default CommunityArticleList;
