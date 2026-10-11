import React, { ChangeEvent, MouseEvent, useEffect, useState } from 'react';
import { NextPage } from 'next';
import { Box, Button, Menu, MenuItem, Pagination, Stack, Typography } from '@mui/material';
import ProgramCard from '../../libs/components/program/ProgramCard';
import useDeviceDetect from '../../libs/hooks/useDeviceDetect';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import Filter from '../../libs/components/program/Filter';
import { useRouter } from 'next/router';
import { ProgramsInquiry } from '../../libs/types/program/program.input';
import { Program } from '../../libs/types/program/program';
import { readProgramsInquiry, initialProgramsInquiry } from '../../libs/program';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { Direction, Message } from '../../libs/enums/common.enum';
import { GET_PROGRAMS } from '../../apollo/user/query';
import { T } from '../../libs/types/common';
import { useMutation, useQuery } from '@apollo/client';
import { LIKE_TARGET_PROGRAM } from '../../apollo/user/mutation';
import { sweetMixinErrorAlert, sweetTopSmallSuccessAlert } from '../../libs/sweetAlert';

export const getStaticProps = async ({ locale }: any) => ({
	props: {
		...(await serverSideTranslations(locale, ['common'])),
	},
});

const ProgramList: NextPage = ({ initialInput, ...props }: any) => {
	const device = useDeviceDetect();
	const router = useRouter();
	const [searchFilter, setSearchFilter] = useState<ProgramsInquiry>(
		readProgramsInquiry(router.query.input, initialInput),
	);
	const [programs, setPrograms] = useState<Program[]>([]);
	const [total, setTotal] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState<number>(1);
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const [sortingOpen, setSortingOpen] = useState(false);
	const [filterSortName, setFilterSortName] = useState('New');

	/** APOLLO REQUESTS **/
	const [likeTargetProgram] = useMutation(LIKE_TARGET_PROGRAM);

	const {
		loading: getProgramsLoading,
		data: getProgramsData,
		error: getProgramsError,
		refetch: getProgramsRefetch,
	} = useQuery(GET_PROGRAMS, {
		fetchPolicy: 'network-only',
		variables: { input: searchFilter },
		notifyOnNetworkStatusChange: true,
		onCompleted: (data: T) => {
			setPrograms(data?.getPrograms?.list ?? []);
			setTotal(data?.getPrograms?.metaCounter?.[0]?.total ?? 0);
		},
	});

	/** LIFECYCLES **/
	useEffect(() => {
		if (!router.isReady) return;
		const input = readProgramsInquiry(router.query.input, initialInput);
		setSearchFilter(input);
		setCurrentPage(input.page);
		setFilterSortName(
			input.sort === 'programPrice' ? (input.direction === Direction.ASC ? 'Lowest Price' : 'Highest Price') : 'New',
		);
	}, [router.isReady, router.query.input, initialInput]);

	/** HANDLERS **/
	const handlePaginationChange = async (event: ChangeEvent<unknown>, value: number) => {
		await router.push(
			{ pathname: '/program', query: { input: JSON.stringify({ ...searchFilter, page: value }) } },
			undefined,
			{ scroll: false },
		);
		setCurrentPage(value);
	};

	const likeProgramHandler = async (user: T, id: string) => {
		try {
			if (!id) return;
			if (!user._id) throw new Error(Message.NOT_AUTHENTICATED);

			await likeTargetProgram({
				variables: { input: id },
			});

			await getProgramsRefetch({ input: searchFilter });

			await sweetTopSmallSuccessAlert('success', 800);
		} catch (err: any) {
			console.log('ERROR, likeProgramHandler:', err.message);
			sweetMixinErrorAlert(err.message).then();
		}
	};

	const sortingClickHandler = (e: MouseEvent<HTMLElement>) => {
		setAnchorEl(e.currentTarget);
		setSortingOpen(true);
	};

	const sortingCloseHandler = () => {
		setSortingOpen(false);
		setAnchorEl(null);
	};

	const sortingHandler = (e: React.MouseEvent<HTMLLIElement>) => {
		switch (e.currentTarget.id) {
			case 'new':
				void router.push(
					{
						pathname: '/program',
						query: {
							input: JSON.stringify({ ...searchFilter, page: 1, sort: 'createdAt', direction: Direction.DESC }),
						},
					},
					undefined,
					{ scroll: false },
				);
				setFilterSortName('New');
				break;
			case 'lowest':
				void router.push(
					{
						pathname: '/program',
						query: {
							input: JSON.stringify({ ...searchFilter, page: 1, sort: 'programPrice', direction: Direction.ASC }),
						},
					},
					undefined,
					{ scroll: false },
				);
				setFilterSortName('Lowest Price');
				break;
			case 'highest':
				void router.push(
					{
						pathname: '/program',
						query: {
							input: JSON.stringify({ ...searchFilter, page: 1, sort: 'programPrice', direction: Direction.DESC }),
						},
					},
					undefined,
					{ scroll: false },
				);
				setFilterSortName('Highest Price');
		}
		setSortingOpen(false);
		setAnchorEl(null);
	};

	if (device === 'mobile') {
		return <h1>PROGRAMS MOBILE</h1>;
	} else {
		return (
			<div id="program-list-page" style={{ position: 'relative' }}>
				<div className="container">
					<Box component={'div'} className={'right'}>
						<span>Sort by</span>
						<div>
							<Button onClick={sortingClickHandler} endIcon={<KeyboardArrowDownRoundedIcon />}>
								{filterSortName}
							</Button>
							<Menu anchorEl={anchorEl} open={sortingOpen} onClose={sortingCloseHandler} sx={{ paddingTop: '5px' }}>
								<MenuItem
									onClick={sortingHandler}
									id={'new'}
									disableRipple
									sx={{ boxShadow: 'rgba(149, 157, 165, 0.2) 0px 8px 24px' }}
								>
									New
								</MenuItem>
								<MenuItem
									onClick={sortingHandler}
									id={'lowest'}
									disableRipple
									sx={{ boxShadow: 'rgba(149, 157, 165, 0.2) 0px 8px 24px' }}
								>
									Lowest Price
								</MenuItem>
								<MenuItem
									onClick={sortingHandler}
									id={'highest'}
									disableRipple
									sx={{ boxShadow: 'rgba(149, 157, 165, 0.2) 0px 8px 24px' }}
								>
									Highest Price
								</MenuItem>
							</Menu>
						</div>
					</Box>
					<Stack className={'program-page'}>
						<Stack className={'filter-config'}>
							{/* @ts-ignore */}
							<Filter
								searchFilter={searchFilter}
								setSearchFilter={(input) => {
									void router.push({ pathname: '/program', query: { input: JSON.stringify(input) } }, undefined, {
										scroll: false,
									});
								}}
								initialInput={initialInput}
							/>
						</Stack>
						<Stack className="main-config" mb={'76px'}>
							<Stack className={'list-config'}>
								{getProgramsLoading && <p>Loading programs...</p>}
								{getProgramsError && <p role="alert">Could not load programs. Please retry.</p>}
								{programs?.length === 0 ? (
									<div className={'no-data'}>
										<img src="/img/icons/icoAlert.svg" alt="" />
										<p>No Programs found!</p>
									</div>
								) : (
									programs.map((program: Program) => {
										return (
											<ProgramCard
												program={program}
												likeProgramHandler={likeProgramHandler}
												variant={'discovery'}
												key={program?._id}
											/>
										);
									})
								)}
							</Stack>
							<Stack className="pagination-config">
								{programs.length !== 0 && (
									<Stack className="pagination-box">
										<Pagination
											page={currentPage}
											count={Math.ceil(total / searchFilter.limit)}
											onChange={handlePaginationChange}
											shape="circular"
											color="primary"
										/>
									</Stack>
								)}

								{programs.length !== 0 && (
									<Stack className="total-result">
										<Typography>
											Total {total} program{total > 1 ? 's' : ''} available
										</Typography>
									</Stack>
								)}
							</Stack>
						</Stack>
					</Stack>
				</div>
			</div>
		);
	}
};

ProgramList.defaultProps = { initialInput: initialProgramsInquiry };

export default withLayoutBasic(ProgramList);
