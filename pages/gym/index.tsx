import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useQuery } from '@apollo/client';
import { Button, Drawer, IconButton, Pagination, Skeleton, useMediaQuery } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import GymCard, { GymCatalogItem } from '../../libs/components/gym/GymCard';
import GymFilters from '../../libs/components/gym/GymFilters';
import { GET_GYMS } from '../../apollo/user/query';
import { Direction } from '../../libs/enums/common.enum';
import { initialGymsInquiry, readGymsInquiry } from '../../libs/gym';
import { GymSearch, GymsInquiry } from '../../libs/types/gym/gym.input';
import { TotalCounter } from '../../libs/types/program/program';

export const getStaticProps = async ({ locale }: { locale?: string }) => ({
	props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'gyms'])) },
});

const GymCatalog: NextPage = () => {
	const router = useRouter();
	const { t } = useTranslation('gyms');
	const mobile = useMediaQuery('(max-width:767px)');
	const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const inquiry = useMemo(() => readGymsInquiry(router.query.input), [router.query.input]);
	const [searchText, setSearchText] = useState(inquiry.search.text ?? '');
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [drawerDraft, setDrawerDraft] = useState<GymSearch>({});
	const { data, loading, error, refetch } = useQuery<{
		getGyms: { list: GymCatalogItem[]; metaCounter: TotalCounter[] };
	}>(GET_GYMS, {
		variables: { input: inquiry },
		skip: !router.isReady,
		fetchPolicy: 'network-only',
		notifyOnNetworkStatusChange: true,
	});
	const gyms = data?.getGyms?.list ?? [];
	const total = data?.getGyms?.metaCounter?.[0]?.total ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / inquiry.limit));
	const selectedCount = (inquiry.search.locationList?.length ?? 0) + (inquiry.search.amenities?.length ?? 0);
	const filtered = Boolean(inquiry.search.text || selectedCount);
	const busy = !router.isReady || loading;

	useEffect(() => {
		setSearchText(inquiry.search.text ?? '');
		setDrawerOpen(false);
	}, [inquiry]);
	useEffect(() => {
		if (!mobile) setDrawerOpen(false);
	}, [mobile]);

	const navigate = (next: GymsInquiry) => {
		void router.push({ pathname: '/gym', query: { input: JSON.stringify(readGymsInquiry(next)) } }, undefined, {
			scroll: false,
		});
	};
	const commitFilters = (search: GymSearch) => navigate({ ...inquiry, page: 1, search });
	const clearAll = () => {
		setSearchText('');
		navigate({ ...initialGymsInquiry, limit: inquiry.limit });
	};
	const submitSearch = (event: FormEvent) => {
		event.preventDefault();
		commitFilters({ ...inquiry.search, text: searchText });
	};
	const openDrawer = () => {
		setDrawerDraft({
			locationList: [...(inquiry.search.locationList ?? [])],
			amenities: [...(inquiry.search.amenities ?? [])],
		});
		setDrawerOpen(true);
	};
	const applyDrawer = () => {
		const next = readGymsInquiry({
			...inquiry,
			search: { ...inquiry.search, locationList: drawerDraft.locationList, amenities: drawerDraft.amenities },
		});
		if (JSON.stringify(next.search) !== JSON.stringify(inquiry.search)) navigate({ ...next, page: 1 });
		setDrawerOpen(false);
	};
	const retry = async () => {
		try {
			await refetch({ input: inquiry });
		} catch {
			/* Apollo keeps the localized recovery state available. */
		}
	};
	const removeFilter = (key: 'locationList' | 'amenities', value: string) => {
		commitFilters({ ...inquiry.search, [key]: (inquiry.search[key] as string[] | undefined)?.filter((item) => item !== value) });
	};

	return (
		<>
			<Head>
				<title>{t('catalog.title')} | GymFlow</title>
			</Head>
			<div id="gym-catalog-page">
				<div className="gym-catalog-container">
					<header className="gym-catalog-intro">
						<p className="gym-catalog-eyebrow">{t('catalog.eyebrow')}</p>
						<h1>{t('catalog.intro')}</h1>
						<p className="gym-catalog-subtitle">{t(mobile ? 'catalog.descriptionMobile' : 'catalog.description')}</p>
					</header>
					<section className="gym-discovery-controls" aria-label={t('filters.title')}>
						<div className="gym-search-row">
							<form className="gym-name-search" role="search" onSubmit={submitSearch}>
								<IconButton type="submit" aria-label={t('catalog.search')}>
									<SearchRoundedIcon />
								</IconButton>
								<input
									type="search"
									maxLength={100}
									aria-label={t('catalog.searchPlaceholder')}
									placeholder={t('catalog.searchPlaceholder')}
									value={searchText}
									onChange={(event) => setSearchText(event.target.value)}
								/>
							</form>
							{mobile && (
								<Button
									className="gym-filter-trigger"
									startIcon={<TuneRoundedIcon />}
									onClick={openDrawer}
									aria-haspopup="dialog"
									aria-expanded={drawerOpen}
									aria-controls={drawerOpen ? 'gym-filter-dialog' : undefined}
								>
									{t('filters.title')}
									{selectedCount > 0 && <span className="gym-filter-count"> {selectedCount}</span>}
								</Button>
							)}
						</div>
						{!mobile && (
							<div className="gym-desktop-filters">
								<GymFilters search={inquiry.search} onChange={commitFilters} />
								<Button className="gym-clear-all" onClick={clearAll}>
									{t('filters.clearAll')}
								</Button>
							</div>
						)}
					</section>
					<div className="gym-results-toolbar">
						<div className="gym-results-summary">
							<p className="gym-results-total" role="status" aria-live="polite">
								{!busy && !error ? t('catalog.results', { count: total }) : t('catalog.title')}
							</p>
							{filtered && (
								<div className="gym-applied-filters" aria-label={t('filters.applied')}>
									{inquiry.search.locationList?.map((location) => (
										<button
											type="button"
											key={location}
											onClick={() => removeFilter('locationList', location)}
											aria-label={t('filters.remove', { name: t(`locations.${location}`) })}
										>
											{t(`locations.${location}`)}
											<CloseRoundedIcon aria-hidden="true" />
										</button>
									))}
									{inquiry.search.amenities?.map((amenity) => (
										<button
											type="button"
											key={amenity}
											onClick={() => removeFilter('amenities', amenity)}
											aria-label={t('filters.remove', { name: t(`amenities.${amenity}`) })}
										>
											{t(`amenities.${amenity}`)}
											<CloseRoundedIcon aria-hidden="true" />
										</button>
									))}
									<Button className="gym-clear-all" onClick={clearAll}>
										{t('filters.clearAll')}
									</Button>
								</div>
							)}
						</div>
						{mobile && <p className="gym-mobile-amenities-hint">{t('filters.amenitiesHint')}</p>}
						<label className="gym-sort">
							<span>{t('sort.label')}</span>
							<select
								value={inquiry.sort ?? 'createdAt'}
								onChange={(event) =>
									navigate({
										...inquiry,
										page: 1,
										sort: event.target.value as GymsInquiry['sort'],
										direction: Direction.DESC,
									})
								}
							>
								<option value="createdAt">{t('sort.newest')}</option>
								<option value="updatedAt">{t('sort.updated')}</option>
							</select>
						</label>
					</div>
					<section className="gym-catalog-results" aria-label={t('catalog.title')} aria-busy={busy}>
						{busy ? (
							<div className="gym-grid gym-skeleton-grid" role="status" aria-label={t('catalog.loading')}>
								{Array.from({ length: Math.min(inquiry.limit, 9) }, (_, index) => (
									<div className="gym-card gym-card-skeleton" key={index} aria-hidden="true">
										<Skeleton
											className="gym-card-cover"
											variant="rectangular"
											animation={reduceMotion ? false : 'pulse'}
										/>
										<div className="gym-card-content">
											<Skeleton width="35%" />
											<Skeleton height={32} width="80%" />
											<Skeleton />
											<Skeleton />
											<Skeleton width="65%" />
										</div>
									</div>
								))}
							</div>
						) : error ? (
							<div className="gym-catalog-state" role="alert">
								<SearchOffRoundedIcon aria-hidden="true" />
								<h2>{t('catalog.error')}</h2>
								<Button onClick={() => void retry()}>{t('retry')}</Button>
							</div>
						) : gyms.length ? (
							<div className="gym-grid">
								{gyms.map((gym) => (
									<GymCard key={gym._id} gym={gym} />
								))}
							</div>
						) : (
							<div className="gym-catalog-state">
								{filtered ? (
									<SearchOffRoundedIcon aria-hidden="true" />
								) : (
									<FitnessCenterOutlinedIcon aria-hidden="true" />
								)}
								<h2>{t(total > 0 ? 'catalog.pageEmpty' : filtered ? 'catalog.filteredEmpty' : 'catalog.empty')}</h2>
								<p>{t(filtered ? 'catalog.filteredEmptyDescription' : 'catalog.emptyDescription')}</p>
								{total > 0 ? (
									<Button onClick={() => navigate({ ...inquiry, page: 1 })}>{t('pagination.first')}</Button>
								) : (
									filtered && <Button onClick={clearAll}>{t('filters.clearFilters')}</Button>
								)}
							</div>
						)}
					</section>
					{!busy && !error && total > 0 && (
						<nav className="gym-pagination" aria-label={t('pagination.label')}>
							{mobile ? (
								<>
									<Button disabled={inquiry.page <= 1} onClick={() => navigate({ ...inquiry, page: inquiry.page - 1 })}>
										{t('pagination.previous')}
									</Button>
									<span>{t('pagination.page', { page: inquiry.page, total: pageCount })}</span>
									<Button
										disabled={inquiry.page >= pageCount}
										onClick={() => navigate({ ...inquiry, page: inquiry.page + 1 })}
									>
										{t('pagination.next')}
									</Button>
								</>
							) : (
								<Pagination
									count={pageCount}
									page={inquiry.page}
									shape="rounded"
									onChange={(_, page) => navigate({ ...inquiry, page })}
									getItemAriaLabel={(type, page) =>
										t(
											type === 'page'
												? 'pagination.goToPage'
												: type === 'previous'
												? 'pagination.previous'
												: 'pagination.next',
											{ page },
										)
									}
								/>
							)}
						</nav>
					)}
				</div>
			</div>
			<Drawer
				anchor="bottom"
				open={drawerOpen && mobile}
				onClose={() => setDrawerOpen(false)}
				className="public-gym-filter-drawer"
				transitionDuration={reduceMotion ? 0 : undefined}
				PaperProps={{
					id: 'gym-filter-dialog',
					role: 'dialog',
					'aria-modal': true,
					'aria-labelledby': 'gym-filter-title',
				}}
			>
				<div className="gym-drawer-handle" aria-hidden="true" />
				<div className="gym-drawer-header">
					<IconButton aria-label={t('filters.close')} onClick={() => setDrawerOpen(false)}>
						<CloseRoundedIcon />
					</IconButton>
					<h2 id="gym-filter-title">{t('filters.title')}</h2>
					<Button onClick={() => setDrawerDraft({})}>{t('filters.clearAll')}</Button>
				</div>
				<div className="gym-drawer-content">
					<GymFilters search={drawerDraft} onChange={setDrawerDraft} />
				</div>
				<div className="gym-drawer-actions">
					<Button onClick={() => setDrawerDraft({})}>{t('filters.clear')}</Button>
					<Button className="gym-apply-filters" onClick={applyDrawer}>
						{t('filters.apply')}
					</Button>
				</div>
			</Drawer>
		</>
	);
};

export default withLayoutBasic(GymCatalog);
