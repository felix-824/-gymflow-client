import React, { useEffect, useState } from 'react';
import type { NextPage } from 'next';
import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import { Box, List, ListItem, Stack } from '@mui/material';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { TabContext } from '@mui/lab';
import TablePagination from '@mui/material/TablePagination';
import { ProgramPanelList } from '../../../libs/components/admin/programs/ProgramList';
import { AllProgramsInquiry } from '../../../libs/types/program/program.input';
import { Program } from '../../../libs/types/program/program';
import { ProgramLocation, ProgramStatus } from '../../../libs/enums/program.enum';
import { sweetConfirmAlert, sweetErrorHandling } from '../../../libs/sweetAlert';
import { ProgramUpdate } from '../../../libs/types/program/program.update';
import { useMutation, useQuery } from '@apollo/client';
import { GET_ALL_PROGRAMS_BY_ADMIN } from '../../../apollo/admin/query';
import { REMOVE_PROGRAM_BY_ADMIN, UPDATE_PROGRAM_BY_ADMIN } from '../../../apollo/admin/mutation';
import { T } from '../../../libs/types/common';

const AdminPrograms: NextPage = ({ initialInquiry, ...props }: any) => {
	const [anchorEl, setAnchorEl] = useState<[] | HTMLElement[]>([]);
	const [programsInquiry, setProgramsInquiry] = useState<AllProgramsInquiry>(initialInquiry);
	const [programs, setPrograms] = useState<Program[]>([]);
	const [programsTotal, setProgramsTotal] = useState<number>(0);
	const [value, setValue] = useState(
		programsInquiry?.search?.programStatus ? programsInquiry?.search?.programStatus : 'ALL',
	);
	const [searchType, setSearchType] = useState('ALL');

	/** APOLLO REQUESTS **/
	const [updateProgramByAdmin, { loading: updating }] = useMutation(UPDATE_PROGRAM_BY_ADMIN);
	const [removeProgramByAdmin, { loading: removing }] = useMutation(REMOVE_PROGRAM_BY_ADMIN);

	const {
		loading: getAllProgramsByAdminLoading,
		data: getAllProgramsByAdminData,
		error: getAllProgramsByAdminError,
		refetch: getAllProgramsByAdminRefetch,
	} = useQuery(GET_ALL_PROGRAMS_BY_ADMIN, {
		fetchPolicy: 'network-only',
		variables: { input: programsInquiry },
		notifyOnNetworkStatusChange: true,
		onCompleted: (data: T) => {
			setPrograms(data?.getAllProgramsByAdmin?.list ?? []);
			setProgramsTotal(data?.getAllProgramsByAdmin?.metaCounter?.[0]?.total ?? 0);
			const lastPage = Math.max(
				1,
				Math.ceil((data?.getAllProgramsByAdmin?.metaCounter?.[0]?.total ?? 0) / programsInquiry.limit),
			);
			if (programsInquiry.page > lastPage) setProgramsInquiry({ ...programsInquiry, page: lastPage });
		},
	});

	/** LIFECYCLES **/

	/** HANDLERS **/
	const changePageHandler = async (event: unknown, newPage: number) => {
		setProgramsInquiry({ ...programsInquiry, page: newPage + 1 });
	};

	const changeRowsPerPageHandler = async (event: React.ChangeEvent<HTMLInputElement>) => {
		setProgramsInquiry({ ...programsInquiry, limit: parseInt(event.target.value, 10), page: 1 });
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
		const { programStatus, ...search } = programsInquiry.search;
		setProgramsInquiry({
			...programsInquiry,
			page: 1,
			sort: 'createdAt',
			search: { ...search, ...(newValue === 'ALL' ? {} : { programStatus: newValue as ProgramStatus }) },
		});
	};

	const removeProgramHandler = async (id: string) => {
		if (updating || removing) return;
		try {
			if (await sweetConfirmAlert('Are you sure to remove?')) {
				await removeProgramByAdmin({
					variables: {
						input: id,
					},
				});

				await getAllProgramsByAdminRefetch({ input: programsInquiry });
			}
			menuIconCloseHandler();
		} catch (err: any) {
			void getAllProgramsByAdminRefetch({ input: programsInquiry });
			sweetErrorHandling(err).then();
		}
	};

	const searchTypeHandler = async (newValue: string) => {
		try {
			setSearchType(newValue);

			if (newValue !== 'ALL') {
				setProgramsInquiry({
					...programsInquiry,
					page: 1,
					sort: 'createdAt',
					search: {
						...programsInquiry.search,
						locationList: [newValue as ProgramLocation],
					},
				});
			} else {
				const { locationList, ...search } = programsInquiry.search;
				setProgramsInquiry({ ...programsInquiry, page: 1, search });
			}
		} catch (err: any) {
			console.log('searchTypeHandler: ', err.message);
		}
	};

	const updateProgramHandler = async (updateData: ProgramUpdate) => {
		if (updating || removing) return;
		try {
			console.log('+updateData: ', updateData);
			if (!(await sweetConfirmAlert('Change program status?'))) return;
			await updateProgramByAdmin({
				variables: {
					input: updateData,
				},
			});
			menuIconCloseHandler();
			await getAllProgramsByAdminRefetch({ input: programsInquiry });
		} catch (err: any) {
			menuIconCloseHandler();
			void getAllProgramsByAdminRefetch({ input: programsInquiry });
			sweetErrorHandling(err).then();
		}
	};

	return (
		<Box component={'div'} className={'content'}>
			<Typography variant={'h2'} className={'tit'} sx={{ mb: '24px' }}>
				Program List
			</Typography>
			<Box component={'div'} className={'table-wrap'}>
				<Box component={'div'} sx={{ width: '100%', typography: 'body1' }}>
					<TabContext value={value}>
						<Box component={'div'}>
							<List className={'tab-menu'}>
								<ListItem
									onClick={(e) => tabChangeHandler(e, 'ALL')}
									value="ALL"
									className={value === 'ALL' ? 'li on' : 'li'}
								>
									All
								</ListItem>
								<ListItem
									onClick={(e) => tabChangeHandler(e, 'ACTIVE')}
									value="ACTIVE"
									className={value === 'ACTIVE' ? 'li on' : 'li'}
								>
									Active
								</ListItem>
								<ListItem
									onClick={(e) => tabChangeHandler(e, 'PAUSED')}
									value="PAUSED"
									className={value === 'PAUSED' ? 'li on' : 'li'}
								>
									Paused
								</ListItem>
								<ListItem
									onClick={(e) => tabChangeHandler(e, 'DELETE')}
									value="DELETE"
									className={value === 'DELETE' ? 'li on' : 'li'}
								>
									Delete
								</ListItem>
							</List>
							<Divider />
							<Stack className={'search-area'} sx={{ m: '24px' }}>
								<Select sx={{ width: '160px', mr: '20px' }} value={searchType}>
									<MenuItem value={'ALL'} onClick={() => searchTypeHandler('ALL')}>
										ALL
									</MenuItem>
									{Object.values(ProgramLocation).map((location: string) => (
										<MenuItem value={location} onClick={() => searchTypeHandler(location)} key={location}>
											{location}
										</MenuItem>
									))}
								</Select>
							</Stack>
							<Divider />
						</Box>
						{getAllProgramsByAdminLoading && <p>Loading programs...</p>}
						{getAllProgramsByAdminError && <p role="alert">Could not load programs.</p>}
						<ProgramPanelList
							busy={updating || removing}
							programs={programs}
							anchorEl={anchorEl}
							menuIconClickHandler={menuIconClickHandler}
							menuIconCloseHandler={menuIconCloseHandler}
							updateProgramHandler={updateProgramHandler}
							removeProgramHandler={removeProgramHandler}
						/>

						<TablePagination
							rowsPerPageOptions={[10, 20, 40, 60]}
							component="div"
							count={programsTotal}
							rowsPerPage={programsInquiry?.limit}
							page={programsInquiry?.page - 1}
							onPageChange={changePageHandler}
							onRowsPerPageChange={changeRowsPerPageHandler}
						/>
					</TabContext>
				</Box>
			</Box>
		</Box>
	);
};

AdminPrograms.defaultProps = {
	initialInquiry: {
		page: 1,
		limit: 10,
		sort: 'createdAt',
		direction: 'DESC',
		search: {},
	},
};

export default withAdminLayout(AdminPrograms);
