import React, { ChangeEvent, MouseEvent, useEffect, useState } from 'react';
import { NextPage } from 'next';
import {
	Box,
	Button,
	Chip,
	Drawer,
	InputAdornment,
	Menu,
	MenuItem,
	Pagination,
	Stack,
	TextField,
	Typography,
	useMediaQuery,
} from '@mui/material';
import ProgramCard from '../../libs/components/program/ProgramCard';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import { DiscoveryFilter } from '../../libs/components/program/Filter';
import { ProgramCategory, ProgramLocation, ProgramType } from '../../libs/enums/program.enum';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { useTranslation } from 'next-i18next';
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
	const router = useRouter();
	const { t } = useTranslation('common');
	const isCompactViewport = useMediaQuery('(max-width:1023px)');
	const [searchFilter, setSearchFilter] = useState<ProgramsInquiry>(
		readProgramsInquiry(router.query.input, initialInput),
	);
	const [draft, setDraft] = useState<ProgramsInquiry>(searchFilter);
	const [filterError, setFilterError] = useState('');
	const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
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
		setDraft(input);
		setFilterError('');
		setCurrentPage(input.page);
		setFilterSortName(
			input.sort === 'programPrice' ? (input.direction === Direction.ASC ? 'Lowest Price' : 'Highest Price') : 'New',
		);
	}, [router.isReady, router.query.input, initialInput]);

	useEffect(() => {
		if (!isCompactViewport) setFilterDrawerOpen(false);
	}, [isCompactViewport]);

	/** HANDLERS **/
	const applySearchHandler = () => {
		const range = draft.search.pricesRange;
		if (
			range &&
			(!Number.isInteger(range.start) ||
				!Number.isInteger(range.end) ||
				range.start < 0 ||
				range.end > 2147483647 ||
				range.start > range.end)
		) {
			setFilterError(t('Program discovery.Invalid price'));
			return;
		}
		setFilterError('');
		const input = readProgramsInquiry({ ...draft, page: 1 }, initialInput);
		void router.push({ pathname: '/program', query: { input: JSON.stringify(input) } }, undefined, { scroll: false });
		setFilterDrawerOpen(false);
	};

	const resetSearchHandler = () => {
		setDraft(initialInput);
		setFilterError('');
		void router.push(
			{ pathname: '/program', query: { input: JSON.stringify({ ...initialInput, page: 1, search: {} }) } },
			undefined,
			{ scroll: false },
		);
	};

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

	return (
		<div id="program-list-page" style={{ position: 'relative' }}>
			<Box component={'section'} className={'discovery-search-section'} aria-labelledby={'program-discovery-title'}>
				<div className={'container'}>
					<Typography component={'h1'} id={'program-discovery-title'}>
						{t('Program discovery.Heading')}
					</Typography>
					<Typography component={'p'} className={'discovery-search-description'}>
						{t('Program discovery.Description')}
					</Typography>
					<form
						className={'discovery-name-search'}
						noValidate
						onSubmit={(event) => {
							event.preventDefault();
							applySearchHandler();
						}}
					>
						<TextField
							id={'program-name-search'}
							label={t('Program name')}
							placeholder={t('Program discovery.Search placeholder')}
							value={draft.search.text ?? ''}
							onChange={(event) =>
								setDraft((current) => ({ ...current, search: { ...current.search, text: event.target.value } }))
							}
							inputProps={{ maxLength: 100 }}
							InputProps={{
								startAdornment: (
									<InputAdornment position={'start'}>
										<SearchRoundedIcon />
									</InputAdornment>
								),
							}}
						/>
						<Button type={'submit'} variant={'contained'} disableElevation>
							{t('Search')}
						</Button>
					</form>
					<Box component={'div'} className={'discovery-quick-filters'}>
						<span>{t('Program discovery.Quick filters')}</span>
						{(
							[
								['categoryList', ProgramCategory.WEIGHT_LOSS],
								['typeList', ProgramType.PT_1ON1],
								['categoryList', ProgramCategory.PILATES],
								['locationList', ProgramLocation.SEOUL],
								['typeList', ProgramType.GROUP_CLASS],
							] as const
						).map(([key, value]) => {
							const selected = (draft.search[key] as string[] | undefined)?.includes(value) ?? false;
							return (
								<Chip
									key={value}
									component={'button'}
									type={'button'}
									variant={'outlined'}
									color={selected ? 'primary' : 'default'}
									aria-pressed={selected}
									label={t(key === 'locationList' ? value : `Program discovery card.${value}`)}
									onClick={() =>
										setDraft((current) => {
											const values = (current.search[key] ?? []) as string[];
											return {
												...current,
												search: {
													...current.search,
													[key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
												},
											};
										})
									}
								/>
							);
						})}
					</Box>
					<Typography className={'discovery-draft-note'}>{t('Program discovery.Draft note')}</Typography>
					{filterError && !filterDrawerOpen && (
						<Typography color={'error'} role={'alert'}>
							{filterError}
						</Typography>
					)}
				</div>
			</Box>
			<div className="container">
				<Button
					className={'discovery-filters-button'}
					variant={'outlined'}
					startIcon={<TuneRoundedIcon />}
					aria-haspopup={'dialog'}
					aria-expanded={filterDrawerOpen}
					aria-controls={filterDrawerOpen ? 'program-filters-mobile-dialog' : undefined}
					onClick={() => setFilterDrawerOpen(true)}
				>
					{t('Program discovery.Filters')}
				</Button>
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
					<Stack component={'aside'} className={'filter-config discovery-filter-sidebar'}>
						<DiscoveryFilter
							draft={draft}
							setDraft={setDraft}
							onApply={applySearchHandler}
							onReset={resetSearchHandler}
							error={filterError}
							idPrefix={'program-filters-desktop'}
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
			<Drawer
				className={'program-discovery-filter-modal'}
				anchor={'bottom'}
				open={filterDrawerOpen && isCompactViewport}
				onClose={() => setFilterDrawerOpen(false)}
				PaperProps={{
					id: 'program-filters-mobile-dialog',
					className: 'discovery-filter-drawer',
					role: 'dialog',
					'aria-modal': true,
					'aria-labelledby': 'program-filters-mobile-title',
				}}
			>
				<DiscoveryFilter
					draft={draft}
					setDraft={setDraft}
					onApply={applySearchHandler}
					onReset={resetSearchHandler}
					error={filterError}
					idPrefix={'program-filters-mobile'}
					onClose={() => setFilterDrawerOpen(false)}
				/>
			</Drawer>
		</div>
	);
};

ProgramList.defaultProps = { initialInput: initialProgramsInquiry };

export default withLayoutBasic(ProgramList);
