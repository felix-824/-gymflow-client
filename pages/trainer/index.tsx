import React, { ChangeEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { NextPage } from 'next';
import Head from 'next/head';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import { Stack, Button, Pagination, Skeleton, useMediaQuery } from '@mui/material';
import { Menu, MenuItem } from '@mui/material';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import { useTranslation } from 'next-i18next';
import TrainerCard from '../../libs/components/common/TrainerCard';
import { useRouter } from 'next/router';
import { readTrainersInquiry } from '../../libs/program';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { PublicMember } from '../../libs/types/member/member';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { authReadyVar } from '../../apollo/store';
import { GET_TRAINERS } from '../../apollo/user/query';
import { LIKE_TARGET_MEMBER, SUBSCRIBE, UNSUBSCRIBE } from '../../apollo/user/mutation';
import { sweetMixinErrorAlert, sweetTopSmallSuccessAlert } from '../../libs/sweetAlert';
import { Messages } from '../../libs/config';

export const getStaticProps = async ({ locale }: any) => ({
	props: {
		...(await serverSideTranslations(locale, ['common'])),
	},
});

const TrainerList: NextPage = ({ initialInput }: any) => {
	const { t } = useTranslation('common');
	const compact = useMediaQuery('(max-width: 767px)');
	const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const router = useRouter();
	const authReady = useReactiveVar(authReadyVar);
	const [sortingOpen, setSortingOpen] = useState(false);
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const searchFilter = useMemo(
		() => readTrainersInquiry(router.query.input, initialInput),
		[router.query.input, initialInput],
	);
	const currentPage = searchFilter.page;
	const [searchText, setSearchText] = useState<string>('');
	const pendingFollowIds = useRef(new Set<string>());
	const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set());

	/** APOLLO REQUESTS **/
	const [likeTargetMember] = useMutation(LIKE_TARGET_MEMBER);
	const [subscribe] = useMutation(SUBSCRIBE);
	const [unsubscribe] = useMutation(UNSUBSCRIBE);

	const {
		data: getTrainersData,
		previousData: previousTrainersData,
		loading: getTrainersLoading,
		error: getTrainersError,
		refetch: getTrainersRefetch,
	} = useQuery(GET_TRAINERS, {
		skip: !router.isReady || !authReady,
		fetchPolicy: 'network-only',
		variables: { input: searchFilter },
		notifyOnNetworkStatusChange: true,
	});
	const trainersResult = getTrainersData?.getTrainers ?? previousTrainersData?.getTrainers;
	const trainers: PublicMember[] = trainersResult?.list ?? [];
	const total = trainersResult?.metaCounter?.[0]?.total ?? 0;

	/** LIFECYCLES **/
	useEffect(() => {
		if (!router.isReady) return;
		setSearchText(searchFilter.search.text ?? '');
	}, [router.isReady, searchFilter]);

	/** HANDLERS **/
	const pushSearchFilter = (input: any) => {
		const next = readTrainersInquiry({ ...input, page: 1 }, initialInput);
		void router.push({ pathname: '/trainer', query: { input: JSON.stringify(next) } }, undefined, { scroll: false });
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
			case 'recent':
				pushSearchFilter({ ...searchFilter, sort: 'createdAt', direction: 'DESC' });
				break;
			case 'old':
				pushSearchFilter({ ...searchFilter, sort: 'createdAt', direction: 'ASC' });
				break;
			case 'likes':
				pushSearchFilter({ ...searchFilter, sort: 'memberLikes', direction: 'DESC' });
				break;
			case 'views':
				pushSearchFilter({ ...searchFilter, sort: 'memberViews', direction: 'DESC' });
				break;
		}
		sortingCloseHandler();
	};

	const paginationChangeHandler = async (event: ChangeEvent<unknown>, value: number) => {
		await router.push(
			{ pathname: '/trainer', query: { input: JSON.stringify({ ...searchFilter, page: value }) } },
			undefined,
			{ scroll: false },
		);
	};

	const likeMemberHandler = async (user: any, id: string) => {
		try {
			if (!id) return;
			if (!user._id) throw new Error(Messages.error2);

			await likeTargetMember({
				variables: {
					input: id,
				},
			});

			await getTrainersRefetch({ input: searchFilter });
			await sweetTopSmallSuccessAlert('success', 800);
		} catch (err: any) {
			console.log('ERROR, likeProgramHandler:', err.message);
			sweetMixinErrorAlert(err.message).then();
		}
	};

	const followMemberHandler = async (user: any, id: string, following: boolean) => {
		if (!id || id === user._id || pendingFollowIds.current.has(id)) return;
		let submitted = false;
		try {
			if (!user._id) throw new Error(Messages.error2);
			pendingFollowIds.current.add(id);
			setPendingFollows(new Set(pendingFollowIds.current));
			submitted = true;
			await (following ? unsubscribe : subscribe)({ variables: { input: id } });
			await getTrainersRefetch();
			await sweetTopSmallSuccessAlert(
				t(following ? 'Trainer discovery.Unfollowed' : 'Trainer discovery.Followed'),
				800,
			);
		} catch (err: any) {
			if (submitted) await getTrainersRefetch().catch(() => undefined);
			void sweetMixinErrorAlert(err.message);
		} finally {
			pendingFollowIds.current.delete(id);
			setPendingFollows(new Set(pendingFollowIds.current));
		}
	};

	const sortOptions = [
		{ id: 'recent', sort: 'createdAt', direction: 'DESC', label: 'Newest' },
		{ id: 'old', sort: 'createdAt', direction: 'ASC', label: 'Oldest' },
		{ id: 'likes', sort: 'memberLikes', direction: 'DESC', label: 'Most liked' },
		{ id: 'views', sort: 'memberViews', direction: 'DESC', label: 'Most viewed' },
	];
	const selectedSort = sortOptions.find(
		(option) => option.sort === searchFilter.sort && option.direction === searchFilter.direction,
	);
	const sortLabel = selectedSort
		? t(`Trainer discovery.${selectedSort.label}`)
		: t('Trainer discovery.URL sort', { sort: searchFilter.sort, direction: searchFilter.direction });
	const initialLoading =
		!trainersResult && !getTrainersError && (!router.isReady || !authReady || getTrainersLoading);
	const pages = Math.ceil(total / searchFilter.limit);

	return (
		<Stack className={'trainer-list-page'} component={'section'} aria-labelledby={'trainer-discovery-title'}>
			<Head>
				<link
					rel="stylesheet"
					href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
				/>
			</Head>
			<Stack className={'trainer-discovery-container'}>
				<header className={'trainer-discovery-intro'}>
					<h1 id={'trainer-discovery-title'}>{t('Trainer discovery.Title')}</h1>
					<p>{t('Trainer discovery.Intro')}</p>
				</header>
				<div className={'trainer-discovery-controls'}>
					<form
						className={'trainer-search'}
						role={'search'}
						onSubmit={(event) => {
							event.preventDefault();
							pushSearchFilter({ ...searchFilter, search: { ...searchFilter.search, text: searchText } });
						}}
					>
						<div className={'trainer-search-input'}>
							<SearchRoundedIcon aria-hidden={'true'} />
							<input
								type={'search'}
								maxLength={100}
								aria-label={t('Trainer discovery.Search placeholder')}
								placeholder={t('Trainer discovery.Search placeholder')}
								value={searchText}
								onChange={(event) => setSearchText(event.target.value)}
							/>
						</div>
						<Button
							type={'submit'}
							className={'trainer-search-submit'}
							aria-label={t('Trainer discovery.Search')}
							disableElevation
						>
							<span className={'trainer-search-submit-label'}>{t('Trainer discovery.Search')}</span>
							<SearchRoundedIcon className={'trainer-search-submit-icon'} aria-hidden={'true'} />
						</Button>
					</form>
					<div className={'trainer-results-toolbar'}>
						<p className={'trainer-results-count'}>
							{initialLoading
								? t('Trainer discovery.Loading')
								: t(getTrainersError ? 'Trainer discovery.Previous results' : 'Trainer discovery.Count', { total })}
						</p>
						<div className={'trainer-sort'}>
							<span id={'trainer-sort-label'}>{t('Trainer discovery.Sort by')}</span>
							<Button
								id={'trainer-sort-button'}
								onClick={sortingClickHandler}
								endIcon={<KeyboardArrowDownRoundedIcon />}
								aria-haspopup={'menu'}
								aria-expanded={sortingOpen}
								aria-controls={sortingOpen ? 'trainer-sort-menu' : undefined}
								aria-labelledby={'trainer-sort-label trainer-sort-button'}
							>
								{sortLabel}
							</Button>
							<Menu
								id={'trainer-sort-menu'}
								anchorEl={anchorEl}
								open={sortingOpen}
								onClose={sortingCloseHandler}
								disableScrollLock
								transitionDuration={reducedMotion ? 0 : { enter: 140, exit: 100 }}
								MenuListProps={{ 'aria-labelledby': 'trainer-sort-button' }}
								PaperProps={{ className: 'trainer-sort-paper' }}
							>
								{sortOptions.map((option) => (
									<MenuItem
										key={option.id}
										id={option.id}
										onClick={sortingHandler}
										selected={selectedSort?.id === option.id}
										disableRipple
									>
										{t(`Trainer discovery.${option.label}`)}
									</MenuItem>
								))}
							</Menu>
						</div>
					</div>
				</div>
				<div className={'trainer-results-status'} role={'status'} aria-live={'polite'}>
					{getTrainersLoading && !getTrainersError && trainersResult && t('Trainer discovery.Updating')}
				</div>
				{getTrainersError && (
					<div className={'trainer-discovery-state trainer-discovery-error'} role={'alert'}>
						<h2>{t('Trainer discovery.Error title')}</h2>
						<p>{t(trainers.length ? 'Trainer discovery.Update error' : 'Trainer discovery.Error description')}</p>
						<Button
							onClick={() => {
								void getTrainersRefetch({ input: searchFilter }).catch(() => undefined);
							}}
						>
							{t('Trainer discovery.Retry')}
						</Button>
					</div>
				)}
				<div className={'trainer-discovery-grid'} aria-busy={initialLoading || getTrainersLoading}>
					{initialLoading
						? Array.from({ length: 6 }, (_, index) => (
								<div className={'trainer-discovery-skeleton'} key={index} aria-hidden={'true'}>
									<Skeleton
										variant={'rectangular'}
										className={'trainer-skeleton-image'}
										animation={reducedMotion ? false : 'wave'}
									/>
									<div>
										<Skeleton width={'65%'} animation={reducedMotion ? false : 'wave'} />
										<Skeleton animation={reducedMotion ? false : 'wave'} />
										<Skeleton height={88} animation={reducedMotion ? false : 'wave'} />
									</div>
								</div>
						  ))
						: trainers.map((trainer: PublicMember) => (
								<TrainerCard
									trainer={trainer}
									likeMemberHandler={likeMemberHandler}
									followMemberHandler={followMemberHandler}
									followPending={pendingFollows.has(trainer._id)}
									key={trainer._id}
								/>
						  ))}
				</div>
				{!initialLoading && !getTrainersLoading && !getTrainersError && trainers.length === 0 && (
					<div className={'trainer-discovery-state'}>
						<PeopleOutlineRoundedIcon aria-hidden={'true'} />
						<h2>{t('Trainer discovery.Empty title')}</h2>
						<p>
							{t(searchFilter.search.text ? 'Trainer discovery.Empty search' : 'Trainer discovery.Empty description')}
						</p>
					</div>
				)}
				{trainers.length > 0 && pages > 1 && (
					<Pagination
						className={'trainer-discovery-pagination'}
						aria-label={t('Trainer discovery.Pagination')}
						page={currentPage}
						count={pages}
						onChange={paginationChangeHandler}
						siblingCount={compact ? 0 : 1}
						boundaryCount={1}
						getItemAriaLabel={(type, page, selected) =>
							type === 'page'
								? t(selected ? 'Trainer discovery.Current page' : 'Trainer discovery.Go to page', { page })
								: t(type === 'previous' ? 'Trainer discovery.Previous' : 'Trainer discovery.Next')
						}
					/>
				)}
			</Stack>
		</Stack>
	);
};

TrainerList.defaultProps = {
	initialInput: {
		page: 1,
		limit: 10,
		sort: 'createdAt',
		direction: 'DESC',
		search: {},
	},
};

export default withLayoutBasic(TrainerList);
