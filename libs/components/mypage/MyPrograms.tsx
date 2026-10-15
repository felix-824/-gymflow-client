import React, { useEffect, useState } from 'react';
import { readTrainerProgramsInquiry } from '../../program';
import { NextPage } from 'next';
import { Pagination, Stack, Typography } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { ProgramCard } from './ProgramCard';
import { Program } from '../../types/program/program';
import { TrainerProgramsInquiry } from '../../types/program/program.input';
import { T } from '../../types/common';
import { ProgramStatus } from '../../enums/program.enum';
import { userVar, authReadyVar } from '../../../apollo/store';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { UPDATE_PROGRAM } from '../../../apollo/user/mutation';
import { GET_TRAINER_PROGRAMS } from '../../../apollo/user/query';
import { sweetConfirmAlert, sweetErrorHandling } from './../../sweetAlert';

const MyPrograms: NextPage<{ initialInput?: TrainerProgramsInquiry; allowMobile?: boolean }> = ({ initialInput, allowMobile = false }) => {
	const device = useDeviceDetect();
	const router = useRouter();
	const [searchFilter, setSearchFilter] = useState<TrainerProgramsInquiry>(
		readTrainerProgramsInquiry(router.query.input ?? initialInput),
	);
	const [trainerPrograms, setTrainerPrograms] = useState<Program[]>([]);
	const [total, setTotal] = useState<number>(0);
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);

	/** APOLLO REQUESTS **/
	const [updateProgram, { loading: changingStatus }] = useMutation(UPDATE_PROGRAM);

	const {
		loading: getTrainerProgramsLoading,
		data: getTrainerProgramsData,
		error: getTrainerProgramsError,
		refetch: getTrainerProgramsRefetch,
	} = useQuery(GET_TRAINER_PROGRAMS, {
		fetchPolicy: 'network-only',
		skip: !authReady || user.memberType !== 'TRAINER',
		variables: { input: searchFilter },
		notifyOnNetworkStatusChange: true,
		onCompleted: (data: T) => {
			setTrainerPrograms(data?.getTrainerPrograms?.list ?? []);
			setTotal(data?.getTrainerPrograms?.metaCounter?.[0]?.total ?? 0);
			const lastPage = Math.max(
				1,
				Math.ceil((data?.getTrainerPrograms?.metaCounter?.[0]?.total ?? 0) / searchFilter.limit),
			);
			if (searchFilter.page > lastPage) setSearchFilter({ ...searchFilter, page: lastPage });
		},
	});

	/** HANDLERS **/
	useEffect(() => {
		if (router.isReady) setSearchFilter(readTrainerProgramsInquiry(router.query.input ?? initialInput));
	}, [router.isReady, router.query.input, initialInput]);
	const paginationHandler = (e: T, value: number) => {
		setSearchFilter({ ...searchFilter, page: value });
		void router.push(
			{
				pathname: '/mypage',
				query: { category: 'myPrograms', input: JSON.stringify({ ...searchFilter, page: value }) },
			},
			undefined,
			{ scroll: false },
		);
	};

	const changeStatusHandler = (value: ProgramStatus) => {
		setSearchFilter({ ...searchFilter, page: 1, search: { programStatus: value } });
		void router.push(
			{
				pathname: '/mypage',
				query: {
					category: 'myPrograms',
					input: JSON.stringify({ ...searchFilter, page: 1, search: { programStatus: value } }),
				},
			},
			undefined,
			{ scroll: false },
		);
	};

	const deleteProgramHandler = async (id: string) => {
		if (changingStatus) return;
		try {
			if (await sweetConfirmAlert('Are you sure to delete this program?')) {
				await updateProgram({
					variables: {
						input: {
							_id: id,
							programStatus: 'DELETE',
						},
					},
				});

				await getTrainerProgramsRefetch({ input: searchFilter });
			}
		} catch (err: any) {
			void getTrainerProgramsRefetch({ input: searchFilter });
			await sweetErrorHandling(err);
		}
	};

	const updateProgramHandler = async (status: string, id: string) => {
		if (changingStatus) return;
		try {
			if (await sweetConfirmAlert(`Are you sure change to ${status} status?`)) {
				await updateProgram({
					variables: {
						input: {
							_id: id,
							programStatus: status,
						},
					},
				});

				await getTrainerProgramsRefetch({ input: searchFilter });
			}
		} catch (err: any) {
			void getTrainerProgramsRefetch({ input: searchFilter });
			await sweetErrorHandling(err);
		}
	};

	if (!authReady) return <p>Loading profile...</p>;
	if (user.memberType !== 'TRAINER') return <p>Only trainers can manage programs.</p>;

	if (device === 'mobile' && !allowMobile) {
		return <div>GYMFLOW PROGRAMS MOBILE</div>;
	} else {
		return (
			<div id="my-program-page">
				<Stack className="main-title-box">
					<Stack className="right-box">
						<Typography className="main-title">My Programs</Typography>
						<Typography className="sub-title">We are glad to see you again!</Typography>
					</Stack>
				</Stack>
				<Stack className="program-list-box">
					<Stack className="tab-name-box">
						<Typography
							onClick={() => changeStatusHandler(ProgramStatus.ACTIVE)}
							className={searchFilter.search.programStatus === 'ACTIVE' ? 'active-tab-name' : 'tab-name'}
						>
							Active
						</Typography>
						<Typography
							onClick={() => changeStatusHandler(ProgramStatus.PAUSED)}
							className={searchFilter.search.programStatus === 'PAUSED' ? 'active-tab-name' : 'tab-name'}
						>
							Paused
						</Typography>
					</Stack>
					<Stack className="list-box">
						{getTrainerProgramsLoading && <p>Loading programs...</p>}
						{getTrainerProgramsError && <p role="alert">Could not load programs. Please retry.</p>}
						<Stack className="listing-title-box">
							<Typography className="title-text">Listing title</Typography>
							<Typography className="title-text">Date Published</Typography>
							<Typography className="title-text">Status</Typography>
							<Typography className="title-text">View</Typography>
							<Typography className="title-text">Action</Typography>
						</Stack>

						{trainerPrograms?.length === 0 ? (
							<div className={'no-data'}>
								<img src="/img/icons/icoAlert.svg" alt="" />
								<p>No Program found!</p>
							</div>
						) : (
							trainerPrograms.map((program: Program) => {
								return (
									<ProgramCard
										program={program}
										allowMobile={allowMobile}
										key={program._id}
										managementInput={searchFilter}
										busy={changingStatus}
										deleteProgramHandler={deleteProgramHandler}
										updateProgramHandler={updateProgramHandler}
									/>
								);
							})
						)}

						{trainerPrograms.length !== 0 && (
							<Stack className="pagination-config">
								<Stack className="pagination-box">
									<Pagination
										count={Math.ceil(total / searchFilter.limit)}
										page={searchFilter.page}
										shape="circular"
										color="primary"
										onChange={paginationHandler}
									/>
								</Stack>
								<Stack className="total-result">
									<Typography>{total} program available</Typography>
								</Stack>
							</Stack>
						)}
					</Stack>
				</Stack>
			</div>
		);
	}
};

MyPrograms.defaultProps = {
	initialInput: {
		page: 1,
		limit: 5,
		sort: 'createdAt',
		search: {
			programStatus: ProgramStatus.ACTIVE,
		},
	},
};

export default MyPrograms;
