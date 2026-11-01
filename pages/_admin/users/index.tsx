import React, { useCallback, useRef, useState } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { Button, IconButton, InputAdornment, MenuItem, OutlinedInput, Select, Tab, Tabs } from '@mui/material';
import TablePagination from '@mui/material/TablePagination';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import { MemberPanelList } from '../../../libs/components/admin/users/MemberList';
import { MembersInquiry } from '../../../libs/types/member/member.input';
import { Member, Members } from '../../../libs/types/member/member';
import { MemberStatus, MemberType } from '../../../libs/enums/member.enum';
import { sweetErrorHandling } from '../../../libs/sweetAlert';
import { MemberUpdate } from '../../../libs/types/member/member.update';
import { useMutation, useQuery } from '@apollo/client';
import { GET_ALL_MEMBERS_BY_ADMIN } from '../../../apollo/admin/query';
import { UPDATE_MEMBER_BY_ADMIN } from '../../../apollo/admin/mutation';
import { adminUsersLabels } from '../../../libs/admin-users-labels';

const AdminUsers: NextPage<{ initialInquiry?: MembersInquiry }> = ({ initialInquiry }) => {
	const labels = adminUsersLabels(useRouter().locale);
	const [anchorEl, setAnchorEl] = useState<Record<string, HTMLElement>>({});
	const [membersInquiry, setMembersInquiry] = useState<MembersInquiry>(
		initialInquiry ?? { page: 1, limit: 10, sort: 'createdAt', search: {} },
	);
	const [members, setMembers] = useState<Member[]>([]);
	const [membersTotal, setMembersTotal] = useState(0);
	const [value, setValue] = useState(membersInquiry.search.memberStatus ?? 'ALL');
	const [searchText, setSearchText] = useState('');
	const [searchType, setSearchType] = useState<string>(membersInquiry.search.memberType ?? 'ALL');
	const writing = useRef(false);

	/** APOLLO REQUESTS **/
	const [updateMemberByAdmin, { loading: updating }] = useMutation(UPDATE_MEMBER_BY_ADMIN);
	const {
		loading,
		error,
		refetch: getAllMembersRefetch,
	} = useQuery<{ getAllMembersByAdmin: Members }>(GET_ALL_MEMBERS_BY_ADMIN, {
		fetchPolicy: 'network-only',
		variables: { input: membersInquiry },
		notifyOnNetworkStatusChange: true,
		onCompleted: (data) => {
			setMembers(data.getAllMembersByAdmin.list ?? []);
			setMembersTotal(data.getAllMembersByAdmin.metaCounter?.[0]?.total ?? 0);
		},
	});

	/** HANDLERS **/
	const menuIconCloseHandler = useCallback(() => setAnchorEl({}), []);
	const menuIconClickHandler = (event: React.MouseEvent<HTMLElement>, key: number | string) => {
		setAnchorEl({ [key]: event.currentTarget });
	};
	const changePageHandler = (_event: unknown, page: number) => {
		menuIconCloseHandler();
		setMembersInquiry({ ...membersInquiry, page: page + 1 });
	};
	const changeRowsPerPageHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
		menuIconCloseHandler();
		setMembersInquiry({ ...membersInquiry, limit: parseInt(event.target.value, 10), page: 1 });
	};
	const tabChangeHandler = (_event: React.SyntheticEvent, status: string) => {
		setValue(status);
		setSearchText('');
		menuIconCloseHandler();
		const search = { ...membersInquiry.search };
		delete search.text;
		if (status === 'ALL') delete search.memberStatus;
		else search.memberStatus = status as MemberStatus;
		setMembersInquiry({ ...membersInquiry, page: 1, sort: 'createdAt', search });
	};
	const searchTextHandler = () => {
		const search = { ...membersInquiry.search };
		const text = searchText.trim();
		if (text) search.text = text;
		else delete search.text;
		menuIconCloseHandler();
		setMembersInquiry({ ...membersInquiry, page: 1, search });
	};
	const clearSearchHandler = () => {
		setSearchText('');
		const search = { ...membersInquiry.search };
		delete search.text;
		setMembersInquiry({ ...membersInquiry, page: 1, search });
	};
	const searchTypeHandler = (type: string) => {
		setSearchType(type);
		const search = { ...membersInquiry.search };
		if (type === 'ALL') delete search.memberType;
		else search.memberType = type as MemberType;
		menuIconCloseHandler();
		setMembersInquiry({ ...membersInquiry, page: 1, sort: 'createdAt', search });
	};
	const updateMemberHandler = async (input: MemberUpdate) => {
		if (writing.current || loading) return;
		writing.current = true;
		try {
			await updateMemberByAdmin({ variables: { input } });
			menuIconCloseHandler();
			await getAllMembersRefetch({ input: membersInquiry });
		} catch (err: any) {
			await sweetErrorHandling(err);
		} finally {
			writing.current = false;
		}
	};

	return (
		<div className="content admin-users">
			<h1 id="admin-users-title">{labels.title}</h1>
			<section
				className="table-wrap admin-users-panel"
				aria-labelledby="admin-users-title"
				aria-busy={loading || updating}
			>
				<Tabs
					className="member-tabs"
					value={value}
					onChange={tabChangeHandler}
					variant="fullWidth"
					aria-label={labels.tabsLabel}
				>
					<Tab value="ALL" label={labels.all} />
					<Tab value="ACTIVE" label={labels.active} />
					<Tab value="BLOCK" label={labels.blocked} />
					<Tab value="DELETE" label={labels.deleted} />
				</Tabs>
				<form
					className="member-filters"
					onSubmit={(event) => {
						event.preventDefault();
						searchTextHandler();
					}}
				>
					<div className="member-search-field">
						<label htmlFor="admin-member-search">{labels.search}</label>
						<OutlinedInput
							id="admin-member-search"
							value={searchText}
							onChange={(event) => setSearchText(event.target.value)}
							inputProps={{ maxLength: 100 }}
							placeholder={labels.searchPlaceholder}
							endAdornment={
								<InputAdornment position="end">
									{searchText && (
										<IconButton type="button" aria-label={labels.clearSearch} onClick={clearSearchHandler}>
											<CloseRoundedIcon />
										</IconButton>
									)}
									<IconButton type="submit" aria-label={labels.searchAction}>
										<SearchRoundedIcon />
									</IconButton>
								</InputAdornment>
							}
						/>
					</div>
					<div className="member-type-field">
						<label id="admin-member-type-label" htmlFor="admin-member-type">
							{labels.typeFilter}
						</label>
						<Select
							id="admin-member-type"
							labelId="admin-member-type-label"
							MenuProps={{ PaperProps: { className: 'admin-users-menu' } }}
							value={searchType}
							onChange={(event) => searchTypeHandler(event.target.value)}
						>
							<MenuItem value="ALL">{labels.allTypes}</MenuItem>
							{Object.values(MemberType).map((type) => (
								<MenuItem key={type} value={type}>
									{labels.roles[type]}
								</MenuItem>
							))}
						</Select>
					</div>
				</form>
				{error ? (
					<div className="member-feedback" role="alert">
						<p>{labels.error}</p>
						<Button onClick={() => void getAllMembersRefetch({ input: membersInquiry }).catch(() => undefined)}>
							{labels.retry}
						</Button>
					</div>
				) : loading ? (
					<p className="member-feedback" role="status">
						{labels.loading}
					</p>
				) : (
					<MemberPanelList
						members={members}
						anchorEl={anchorEl}
						pending={updating}
						menuIconClickHandler={menuIconClickHandler}
						menuIconCloseHandler={menuIconCloseHandler}
						updateMemberHandler={updateMemberHandler}
					/>
				)}
				<TablePagination
					rowsPerPageOptions={[10, 20, 40, 60]}
					component="div"
					count={membersTotal}
					rowsPerPage={membersInquiry.limit}
					page={membersInquiry.page - 1}
					onPageChange={changePageHandler}
					onRowsPerPageChange={changeRowsPerPageHandler}
					labelRowsPerPage={labels.rowsPerPage}
					labelDisplayedRows={({ from, to, count }) => from + '–' + to + ' / ' + count}
					getItemAriaLabel={(type) => (type === 'next' ? labels.nextPage : labels.previousPage)}
					backIconButtonProps={{ disabled: loading || updating || membersInquiry.page === 1 }}
					nextIconButtonProps={{
						disabled: loading || updating || membersInquiry.page * membersInquiry.limit >= membersTotal,
					}}
				/>
			</section>
		</div>
	);
};

export default withAdminLayout(AdminUsers);
