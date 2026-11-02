import React, { useEffect, useState } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { adminCommunityLabels } from '../../../libs/admin-community-labels';
import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import { MenuItem, Tab, Tabs } from '@mui/material';
import Select from '@mui/material/Select';
import TablePagination from '@mui/material/TablePagination';
import CommunityArticleList from '../../../libs/components/admin/community/CommunityArticleList';
import { AllBoardArticlesInquiry } from '../../../libs/types/board-article/board-article.input';
import { BoardArticle } from '../../../libs/types/board-article/board-article';
import { BoardArticleCategory, BoardArticleStatus } from '../../../libs/enums/board-article.enum';
import { sweetConfirmAlert, sweetErrorHandling } from '../../../libs/sweetAlert';
import { BoardArticleUpdate } from '../../../libs/types/board-article/board-article.update';
import { useMutation, useQuery } from '@apollo/client';
import { REMOVE_BOARD_ARTICLE_BY_ADMIN, UPDATE_BOARD_ARTICLE_BY_ADMIN } from '../../../apollo/admin/mutation';
import { GET_ALL_BOARD_ARTICLES_BY_ADMIN } from '../../../apollo/admin/query';
import { T } from '../../../libs/types/common';

const AdminCommunity: NextPage = ({ initialInquiry, ...props }: any) => {
	const labels = adminCommunityLabels(useRouter().locale);
	const [anchorEl, setAnchorEl] = useState<any>([]);
	const [communityInquiry, setCommunityInquiry] = useState<AllBoardArticlesInquiry>(initialInquiry);
	const [articles, setArticles] = useState<BoardArticle[]>([]);
	const [articleTotal, setArticleTotal] = useState<number>(0);
	const [value, setValue] = useState(
		communityInquiry?.search?.articleStatus ? communityInquiry?.search?.articleStatus : 'ALL',
	);
	const [searchType, setSearchType] = useState('ALL');

	/** APOLLO REQUESTS **/
	const [updateBoardArticleByAdmin] = useMutation(UPDATE_BOARD_ARTICLE_BY_ADMIN);
	const [removeBoardArticleByAdmin] = useMutation(REMOVE_BOARD_ARTICLE_BY_ADMIN);

	const { refetch: getAllBoardArticlesByAdminRefetch } = useQuery(GET_ALL_BOARD_ARTICLES_BY_ADMIN, {
		fetchPolicy: 'network-only',
		variables: { input: communityInquiry },
		notifyOnNetworkStatusChange: true,
		onCompleted: (data: T) => {
			setArticles(data?.getAllBoardArticlesByAdmin?.list ?? []);
			setArticleTotal(data?.getAllBoardArticlesByAdmin?.metaCounter?.[0]?.total ?? 0);
			const lastPage = Math.max(
				1,
				Math.ceil((data?.getAllBoardArticlesByAdmin?.metaCounter?.[0]?.total ?? 0) / communityInquiry.limit),
			);
			if (communityInquiry.page > lastPage) setCommunityInquiry({ ...communityInquiry, page: lastPage });
		},
	});

	/** LIFECYCLES **/
	useEffect(() => {
		getAllBoardArticlesByAdminRefetch({ input: communityInquiry }).then();
	}, [communityInquiry, getAllBoardArticlesByAdminRefetch]);

	/** HANDLERS **/
	const changePageHandler = async (event: unknown, newPage: number) => {
		setCommunityInquiry({ ...communityInquiry, page: newPage + 1 });
	};

	const changeRowsPerPageHandler = async (event: React.ChangeEvent<HTMLInputElement>) => {
		setCommunityInquiry({ ...communityInquiry, limit: parseInt(event.target.value, 10), page: 1 });
	};

	const menuIconClickHandler = (e: any, index: number) => {
		const tempAnchor = anchorEl.slice();
		tempAnchor[index] = e.currentTarget;
		setAnchorEl(tempAnchor);
	};

	const menuIconCloseHandler = () => {
		setAnchorEl([]);
	};

	const tabChangeHandler = async (event: any, newValue: string) => {
		setValue(newValue);
		const { articleStatus, ...search } = communityInquiry.search;
		setCommunityInquiry({
			...communityInquiry,
			page: 1,
			sort: 'createdAt',
			search: { ...search, ...(newValue === 'ALL' ? {} : { articleStatus: newValue as BoardArticleStatus }) },
		});
	};

	const searchTypeHandler = async (newValue: string) => {
		try {
			setSearchType(newValue);

			if (newValue !== 'ALL') {
				setCommunityInquiry({
					...communityInquiry,
					page: 1,
					sort: 'createdAt',
					search: {
						...communityInquiry.search,
						articleCategory: newValue as BoardArticleCategory,
					},
				});
			} else {
				const { articleCategory, ...search } = communityInquiry.search;
				setCommunityInquiry({ ...communityInquiry, page: 1, search });
			}
		} catch (err: any) {
			console.log('searchTypeHandler: ', err.message);
		}
	};

	const updateArticleHandler = async (updateData: BoardArticleUpdate) => {
		try {
			await updateBoardArticleByAdmin({
				variables: {
					input: updateData,
				},
			});

			menuIconCloseHandler();
			await getAllBoardArticlesByAdminRefetch({ input: communityInquiry });
		} catch (err: any) {
			menuIconCloseHandler();
			sweetErrorHandling(err).then();
		}
	};

	const removeArticleHandler = async (id: string) => {
		try {
			if (await sweetConfirmAlert('Are you sure to remove?')) {
				await removeBoardArticleByAdmin({
					variables: {
						input: id,
					},
				});

				await getAllBoardArticlesByAdminRefetch({ input: communityInquiry });
			}
		} catch (err: any) {
			sweetErrorHandling(err).then();
		}
	};

	return (
		<div className="content admin-community">
			<h1>{labels.title}</h1>
			<div className="table-wrap">
				<Tabs
					value={value}
					onChange={tabChangeHandler}
					aria-label={labels.tabsLabel}
					variant="fullWidth"
					className="article-tabs"
				>
					<Tab value="ALL" label={labels.all} />
					{Object.values(BoardArticleStatus).map((status) => (
						<Tab key={status} value={status} label={labels.statuses[status]} />
					))}
				</Tabs>
				<div className="article-filters">
					<label htmlFor="admin-article-category">{labels.category}</label>
					<Select
						id="admin-article-category"
						value={searchType}
						onChange={(event) => searchTypeHandler(event.target.value)}
						inputProps={{ 'aria-label': labels.category }}
						MenuProps={{ className: 'admin-community-menu' }}
					>
						<MenuItem value="ALL">{labels.allCategories}</MenuItem>
						{Object.values(BoardArticleCategory).map((category) => (
							<MenuItem value={category} key={category}>
								{labels.categories[category]}
							</MenuItem>
						))}
					</Select>
				</div>
				<CommunityArticleList
					articles={articles}
					anchorEl={anchorEl}
					menuIconClickHandler={menuIconClickHandler}
					menuIconCloseHandler={menuIconCloseHandler}
					updateArticleHandler={updateArticleHandler}
					removeArticleHandler={removeArticleHandler}
				/>
				<TablePagination
					rowsPerPageOptions={[10, 20, 40, 60]}
					component="div"
					count={articleTotal}
					rowsPerPage={communityInquiry.limit}
					page={Math.min(communityInquiry.page - 1, Math.max(0, Math.ceil(articleTotal / communityInquiry.limit) - 1))}
					onPageChange={changePageHandler}
					onRowsPerPageChange={changeRowsPerPageHandler}
					labelRowsPerPage={labels.rowsPerPage}
					labelDisplayedRows={({ from, to, count }) =>
						labels.pagination
							.replace('{{from}}', String(from))
							.replace('{{to}}', String(to))
							.replace('{{total}}', String(count))
					}
					getItemAriaLabel={(type) => (type === 'previous' ? labels.previousPage : labels.nextPage)}
				/>
			</div>
		</div>
	);
};

AdminCommunity.defaultProps = {
	initialInquiry: {
		page: 1,
		limit: 10,
		sort: 'createdAt',
		direction: 'DESC',
		search: {},
	},
};

export default withAdminLayout(AdminCommunity);
