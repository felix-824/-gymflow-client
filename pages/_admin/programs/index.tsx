import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { adminProgramsLabels } from '../../../libs/admin-programs-labels';
import type { NextPage } from 'next';
import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import { Button, Tab, Tabs } from '@mui/material';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
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
	const labels = adminProgramsLabels(useRouter().locale);
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
		<div className="content admin-programs">
			<h1>{labels.title}</h1>
			<div className="table-wrap">
				<Tabs
					value={value}
					onChange={tabChangeHandler}
					aria-label={labels.tabsLabel}
					variant="fullWidth"
					className="program-tabs"
				>
					<Tab value="ALL" label={labels.all} />
					{Object.values(ProgramStatus).map((status) => (
						<Tab key={status} value={status} label={labels.statuses[status]} />
					))}
				</Tabs>
				<div className="program-filters">
					<label htmlFor="admin-program-location">{labels.location}</label>
					<Select
						id="admin-program-location"
						value={searchType}
						onChange={(event) => searchTypeHandler(event.target.value)}
						inputProps={{ 'aria-label': labels.location }}
						MenuProps={{ className: 'admin-programs-menu' }}
					>
						<MenuItem value="ALL">{labels.allLocations}</MenuItem>
						{Object.values(ProgramLocation).map((location) => (
							<MenuItem value={location} key={location}>
								{labels.locations[location]}
							</MenuItem>
						))}
					</Select>
				</div>
				<ProgramPanelList
					busy={updating || removing}
					programs={programs}
					anchorEl={anchorEl}
					menuIconClickHandler={menuIconClickHandler}
					menuIconCloseHandler={menuIconCloseHandler}
					updateProgramHandler={updateProgramHandler}
					removeProgramHandler={removeProgramHandler}
					feedback={
						getAllProgramsByAdminLoading ? (
							<p role="status">{labels.loading}</p>
						) : getAllProgramsByAdminError ? (
							<div role="alert">
								<p>{labels.error}</p>
								<Button onClick={() => void getAllProgramsByAdminRefetch().catch(() => undefined)}>
									{labels.retry}
								</Button>
							</div>
						) : undefined
					}
				/>
				<TablePagination
					rowsPerPageOptions={[10, 20, 40, 60]}
					component="div"
					count={programsTotal}
					rowsPerPage={programsInquiry?.limit}
					page={Math.min(programsInquiry?.page - 1, Math.max(0, Math.ceil(programsTotal / programsInquiry.limit) - 1))}
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
					backIconButtonProps={{ disabled: getAllProgramsByAdminLoading || programsInquiry.page === 1 }}
					nextIconButtonProps={{
						disabled: getAllProgramsByAdminLoading || programsInquiry.page * programsInquiry.limit >= programsTotal,
					}}
				/>
			</div>
		</div>
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
