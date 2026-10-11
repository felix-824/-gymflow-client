import React, { ChangeEvent, MouseEvent, useEffect, useState } from 'react';
import { NextPage } from 'next';
import {
	Box,
	Alert,
	AlertTitle,
	Button,
	Chip,
	Drawer,
	InputAdornment,
	LinearProgress,
	Menu,
	MenuItem,
	Pagination,
	Skeleton,
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
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
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
	const [hasLoadedPrograms, setHasLoadedPrograms] = useState(false);
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
			setHasLoadedPrograms(true);
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
			input.sort === 'programPrice'
				? input.direction === Direction.ASC
					? 'Lowest Price'
					: 'Highest Price'
				: input.sort === 'createdAt' && input.direction === Direction.DESC
				? 'New'
				: 'URL sort',
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

	const handlePaginationChange = async (event: ChangeEvent<unknown> | MouseEvent<HTMLElement>, value: number) => {
		await router.push(
			{ pathname: '/program', query: { input: JSON.stringify({ ...searchFilter, page: value }) } },
			undefined,
			{ scroll: false },
		);
		setCurrentPage(value);
	};

	const removeAppliedFilterHandler = (key: keyof ProgramsInquiry['search'], value?: string) => {
		const search = { ...searchFilter.search };
		if (key === 'locationList' || key === 'typeList' || key === 'categoryList') {
			const remaining = (search[key] as string[] | undefined)?.filter((item) => item !== value) ?? [];
			if (remaining.length) Object.assign(search, { [key]: remaining });
			else delete search[key];
		} else {
			delete search[key];
		}
		void router.push(
			{ pathname: '/program', query: { input: JSON.stringify({ ...searchFilter, page: 1, search }) } },
			undefined,
			{ scroll: false },
		);
	};

	const retryProgramsHandler = async () => {
		try {
			await getProgramsRefetch({ input: searchFilter });
		} catch {
			// Apollo's error state presents the failure and keeps Retry available.
		}
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

	const totalPages = Math.ceil(total / searchFilter.limit);
	const initialLoading = getProgramsLoading && !hasLoadedPrograms;
	const updatingPrograms = getProgramsLoading && hasLoadedPrograms;
	const showEmpty = hasLoadedPrograms && !getProgramsLoading && !getProgramsError && programs.length === 0;
	const appliedFilters: { key: keyof ProgramsInquiry['search']; value?: string; label: string }[] = [];
	for (const [key, label] of [
		['locationList', 'Location'],
		['typeList', 'Program type'],
		['categoryList', 'Category'],
	] as const) {
		for (const value of searchFilter.search[key] ?? []) {
			appliedFilters.push({
				key,
				value,
				label: `${t(label)}: ${t(key === 'locationList' ? value : `Program discovery card.${value}`)}`,
			});
		}
	}
	if (searchFilter.search.text) {
		appliedFilters.push({ key: 'text', label: `${t('Program name')}: ${searchFilter.search.text}` });
	}
	if (searchFilter.search.pricesRange) {
		const { start, end } = searchFilter.search.pricesRange;
		appliedFilters.push({
			key: 'pricesRange',
			label: t(end === 2147483647 ? 'Program results.Price from' : 'Program results.Price range', {
				min: start.toLocaleString(),
				max: end.toLocaleString(),
			}),
		});
	}
	if (searchFilter.search.memberId) {
		appliedFilters.push({
			key: 'memberId',
			label: t('Program results.Trainer filter', { id: searchFilter.search.memberId }),
		});
	}
	if (searchFilter.search.periodsRange) {
		appliedFilters.push({
			key: 'periodsRange',
			label: t('Program results.Created range', searchFilter.search.periodsRange),
		});
	}

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
						<Box
							component={'section'}
							className={'discovery-results-toolbar'}
							aria-label={t('Program results.Toolbar')}
						>
							<Box component={'div'} className={'discovery-results-row'}>
								<Typography component={'h2'} aria-live={'polite'} aria-atomic={true}>
									{hasLoadedPrograms
										? t(
												updatingPrograms || getProgramsError
													? 'Program results.Previous results'
													: 'Program results.Count',
												{ total },
										  )
										: t(getProgramsLoading ? 'Program results.Loading' : 'Programs')}
								</Typography>
								<Box component={'div'} className={'discovery-results-controls'}>
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
									<Button
										id={'program-sort-button'}
										className={'discovery-sort-button'}
										onClick={sortingClickHandler}
										endIcon={<KeyboardArrowDownRoundedIcon />}
										aria-haspopup={'menu'}
										aria-expanded={sortingOpen}
										aria-controls={sortingOpen ? 'program-sort-menu' : undefined}
									>
										{t('Program results.Sort by')}:{' '}
										{t(`Program results.${filterSortName}`, {
											sort: searchFilter.sort,
											direction: searchFilter.direction,
										})}
									</Button>
									<Menu
										id={'program-sort-menu'}
										anchorEl={anchorEl}
										open={sortingOpen}
										onClose={sortingCloseHandler}
										MenuListProps={{ 'aria-labelledby': 'program-sort-button' }}
									>
										{(
											[
												['new', 'New'],
												['lowest', 'Lowest Price'],
												['highest', 'Highest Price'],
											] as const
										).map(([id, label]) => (
											<MenuItem key={id} id={id} onClick={sortingHandler} selected={filterSortName === label}>
												{t(`Program results.${label}`)}
											</MenuItem>
										))}
									</Menu>
								</Box>
							</Box>
							{appliedFilters.length > 0 && (
								<Box
									component={'div'}
									className={'discovery-applied-filters'}
									role={'group'}
									aria-label={t('Program results.Applied filters')}
								>
									{appliedFilters.map(({ key, value, label }, index) => (
										<Chip
											key={`${key}-${value ?? ''}-${index}`}
											label={label}
											aria-label={t('Program results.Remove filter', { label })}
											onDelete={() => removeAppliedFilterHandler(key, value)}
										/>
									))}
									<Button onClick={resetSearchHandler}>{t('Program results.Reset all')}</Button>
								</Box>
							)}
						</Box>
						<Box
							component={'section'}
							className={'discovery-results'}
							aria-label={t('Programs')}
							aria-busy={getProgramsLoading}
						>
							{updatingPrograms && (
								<Box component={'div'} className={'discovery-updating'}>
									<Typography role={'status'}>{t('Program results.Updating')}</Typography>
									<LinearProgress aria-label={t('Program results.Updating')} />
								</Box>
							)}
							{getProgramsError && (
								<Alert severity={'error'} className={'discovery-results-error'}>
									<AlertTitle>{t('Program results.Error title')}</AlertTitle>
									<Typography>
										{t(
											hasLoadedPrograms && programs.length > 0
												? 'Program results.Update error'
												: 'Program results.Error description',
										)}
									</Typography>
									<Button onClick={retryProgramsHandler} disabled={getProgramsLoading}>
										{t('Program results.Retry')}
									</Button>
								</Alert>
							)}
							<Stack className={'list-config'}>
								{initialLoading
									? Array.from({ length: Math.min(searchFilter.limit, 9) }, (_, index) => (
											<Stack
												key={index}
												className={'discovery-program-card discovery-program-skeleton'}
												aria-hidden={true}
											>
												<Skeleton variant={'rectangular'} className={'discovery-skeleton-media'} />
												<Box component={'div'} className={'discovery-card-body'}>
													<Skeleton width={'90%'} height={32} />
													<Skeleton width={'60%'} height={28} />
													<Skeleton width={'80%'} height={28} />
													<Skeleton width={'70%'} height={28} />
													<Skeleton width={'50%'} height={40} />
												</Box>
											</Stack>
									  ))
									: programs.map((program: Program) => (
											<ProgramCard
												program={program}
												likeProgramHandler={likeProgramHandler}
												variant={'discovery'}
												key={program._id}
											/>
									  ))}
							</Stack>
							{showEmpty && (
								<Box component={'div'} className={'discovery-empty-state'} role={'status'}>
									<SearchOffRoundedIcon aria-hidden={true} />
									<Typography component={'h3'}>{t('Program results.Empty title')}</Typography>
									<Typography>{t('Program results.Empty description')}</Typography>
									<Button onClick={resetSearchHandler} variant={'contained'} disableElevation>
										{t('Program results.Reset all')}
									</Button>
								</Box>
							)}
						</Box>
						{hasLoadedPrograms && totalPages > 0 && (
							<Stack
								component={'nav'}
								className={'pagination-config discovery-pagination'}
								aria-label={t('Program results.Pagination')}
							>
								<Pagination
									className={'discovery-pagination-desktop'}
									page={currentPage}
									count={totalPages}
									onChange={handlePaginationChange}
									shape={'circular'}
									color={'primary'}
									disabled={getProgramsLoading}
								/>
								<Box component={'div'} className={'discovery-pagination-mobile'}>
									<Button
										disabled={getProgramsLoading || currentPage <= 1}
										onClick={(event) => void handlePaginationChange(event, currentPage - 1)}
									>
										{t('Program results.Previous')}
									</Button>
									<Typography aria-live={'polite'}>
										{t('Program results.Page', { page: currentPage, pages: totalPages })}
									</Typography>
									<Button
										disabled={getProgramsLoading || currentPage >= totalPages}
										onClick={(event) => void handlePaginationChange(event, currentPage + 1)}
									>
										{t('Program results.Next')}
									</Button>
								</Box>
							</Stack>
						)}
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
