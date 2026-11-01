import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import {
	Avatar,
	Button,
	MenuItem,
	Tab,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	Tabs,
	TextField,
	useMediaQuery,
} from '@mui/material';
import { Buildings } from 'phosphor-react';
import { GET_ALL_GYMS_BY_ADMIN } from '../../../../apollo/admin/query';
import { AdminGym, AdminGyms } from '../../../types/gym/gym';
import { AllGymsInquiry } from '../../../types/gym/gym.input';
import { Direction } from '../../../enums/common.enum';
import { GymLocation, GymStatus } from '../../../enums/gym.enum';
import { gymImagesError, gymStatusLabelKeys } from '../../../admin-gyms';
import { REACT_APP_API_URL } from '../../../config';
import AdminGymAccess from './AdminGymAccess';

const GymIdentity = ({ gym, alt }: { gym: AdminGym; alt: string }) => {
	const cover = gym.gymImages[0];
	const coverUrl = cover && !gymImagesError([cover]) ? `${REACT_APP_API_URL}/${cover}` : undefined;
	return (
		<div className="admin-gym-name">
			<Avatar variant="rounded" src={coverUrl} alt={alt} sx={{ width: 48, height: 48 }} imgProps={{ loading: 'lazy' }}>
				<Buildings role="img" aria-label={alt} size={24} />
			</Avatar>
			<span>{gym.gymName}</span>
		</div>
	);
};

const GymUpdated = ({ gym, locale }: { gym: AdminGym; locale: string }) => {
	const updated = new Date(typeof gym.updatedAt === 'string' ? gym.updatedAt : gym.updatedAt.getTime());
	return (
		<time dateTime={updated.toISOString()}>
			{updated.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}
		</time>
	);
};

const GymList = () => {
	const { t } = useTranslation(['admin-gyms', 'common']);
	const { locale } = useRouter();
	const mobile = useMediaQuery('(max-width:599px)');
	const [text, setText] = useState('');
	const [input, setInput] = useState<AllGymsInquiry>({
		page: 1,
		limit: 10,
		sort: 'createdAt',
		direction: Direction.DESC,
		search: {},
	});
	const { data, loading, error, refetch } = useQuery<{ getAllGymsByAdmin: AdminGyms }, { input: AllGymsInquiry }>(
		GET_ALL_GYMS_BY_ADMIN,
		{
			variables: { input },
			fetchPolicy: 'no-cache',
			notifyOnNetworkStatusChange: true,
			context: { handleErrorLocally: true, queryDeduplication: false },
		},
	);
	const gyms = data?.getAllGymsByAdmin;
	const total = gyms?.metaCounter?.[0]?.total ?? 0;
	const lastPage = Math.max(1, Math.ceil(total / input.limit));
	const filtered = Boolean(input.search.text || input.search.gymStatus || input.search.locationList?.length);
	useEffect(() => {
		if (!loading && !error && gyms && input.page > lastPage) setInput((current) => ({ ...current, page: lastPage }));
	}, [gyms, loading, error, input.page, lastPage]);
	const dateLocale = locale === 'kr' ? 'ko-KR' : locale === 'ru' ? 'ru-RU' : 'en-US';
	const submitSearch = (event: React.FormEvent) => {
		event.preventDefault();
		setInput((current) => {
			const search = { ...current.search };
			if (text.trim()) search.text = text.trim();
			else delete search.text;
			return { ...current, page: 1, search };
		});
	};
	const feedback = loading ? (
		<p role="status">{t('list.loading')}</p>
	) : error ? (
		<div role="alert">
			<p>{t('list.error')}</p>
			<Button onClick={() => void refetch({ input }).catch(() => undefined)}>{t('list.retry')}</Button>
		</div>
	) : (
		<p>{t(filtered ? 'list.filteredEmpty' : 'list.empty')}</p>
	);
	return (
		<div className="content admin-gyms">
			<header className="admin-gym-heading">
				<h1>{t('list.title')}</h1>
				<p>{t('list.intro')}</p>
				<Link href="/_admin/gyms/detail" legacyBehavior passHref>
					<Button component="a" variant="contained" disableElevation className="admin-gym-create">
						{t('list.create')}
					</Button>
				</Link>
			</header>
			<div className="table-wrap">
				<Tabs
					value={input.search.gymStatus ?? 'ALL'}
					aria-label={t('list.statusFilter')}
					variant={mobile ? 'fullWidth' : 'scrollable'}
					scrollButtons="auto"
					onChange={(_, status: GymStatus | 'ALL') => {
						setInput((current) => {
							const search = { ...current.search };
							if (status === 'ALL') delete search.gymStatus;
							else search.gymStatus = status;
							return { ...current, page: 1, search };
						});
					}}
				>
					<Tab value="ALL" label={t('list.all')} />
					{Object.values(GymStatus).map((status) => (
						<Tab key={status} value={status} label={t(gymStatusLabelKeys[status])} />
					))}
				</Tabs>
				<form className="admin-gym-filters" onSubmit={submitSearch}>
					<TextField
						label={t('list.searchLabel')}
						placeholder={t('list.searchPlaceholder')}
						value={text}
						onChange={(event) => setText(event.target.value)}
						inputProps={{ maxLength: 100 }}
						size="small"
						className="gym-search"
					/>
					<Button type="submit" variant="outlined" className="admin-gym-search-action">
						{t('list.search')}
					</Button>
					<TextField
						select
						label={t('list.locationFilter')}
						value={input.search.locationList?.[0] ?? ''}
						size="small"
						className="gym-location"
						onChange={(event) => {
							const location = event.target.value as GymLocation | '';
							setInput((current) => {
								const search = { ...current.search };
								if (location) search.locationList = [location];
								else delete search.locationList;
								return { ...current, page: 1, search };
							});
						}}
					>
						<MenuItem value="">{t('list.allLocations')}</MenuItem>
						{Object.values(GymLocation).map((location) => (
							<MenuItem key={location} value={location}>
								{t(location, { ns: 'common' })}
							</MenuItem>
						))}
					</TextField>
					{filtered && (
						<Button
							onClick={() => {
								setText('');
								setInput((current) => ({ ...current, page: 1, search: {} }));
							}}
						>
							{t('list.clearFilters')}
						</Button>
					)}
				</form>
				{mobile ? (
					loading || error || !gyms?.list.length ? (
						<div className="admin-gym-mobile-feedback">{feedback}</div>
					) : (
						<ul className="admin-gym-mobile-list" aria-label={t('list.tableLabel')}>
							{gyms.list.map((gym) => (
								<li className="admin-gym-mobile-row" key={gym._id}>
									<GymIdentity gym={gym} alt={t('list.coverAlt', { name: gym.gymName })} />
									<div className="admin-gym-mobile-context">
										<span className={`admin-gym-status is-${gym.gymStatus.toLowerCase()}`}>
											{t(gymStatusLabelKeys[gym.gymStatus])}
										</span>
										<span>{t(gym.gymLocation, { ns: 'common' })}</span>
									</div>
									<p className="admin-gym-mobile-address">{gym.gymAddress}</p>
									<div className="admin-gym-mobile-footer">
										<div>
											<span>{t('list.columns.updated')}</span>
											<GymUpdated gym={gym} locale={dateLocale} />
										</div>
										<Link
											className="admin-gym-mobile-action"
											href={{ pathname: '/_admin/gyms/detail', query: { id: gym._id } }}
											aria-label={t('list.detailAction', { name: gym.gymName })}
										>
											{t(gym.gymStatus === GymStatus.DELETE ? 'list.view' : 'list.edit')}
										</Link>
									</div>
								</li>
							))}
						</ul>
					)
				) : (
					<TableContainer>
						<Table aria-label={t('list.tableLabel')} aria-busy={loading}>
							<TableHead>
								<TableRow>
									{['gym', 'location', 'address', 'status', 'updated', 'action'].map((column) => (
										<TableCell className={`gym-col-${column}`} key={column}>
											{t(`list.columns.${column}`)}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading || error || !gyms?.list.length ? (
									<TableRow>
										<TableCell colSpan={6} className="admin-gym-empty">
											{feedback}
										</TableCell>
									</TableRow>
								) : (
									gyms.list.map((gym) => {
										const alt = t('list.coverAlt', { name: gym.gymName });
										return (
											<TableRow key={gym._id} hover>
												<TableCell className="gym-col-gym">
													<GymIdentity gym={gym} alt={alt} />
													<div className="gym-tablet-updated">
														<span>{t('list.columns.updated')}</span>
														<GymUpdated gym={gym} locale={dateLocale} />
													</div>
												</TableCell>
												<TableCell className="gym-col-location">{t(gym.gymLocation, { ns: 'common' })}</TableCell>
												<TableCell className="gym-col-address">
													<span className="gym-tablet-location">{t(gym.gymLocation, { ns: 'common' })}</span>
													{gym.gymAddress}
												</TableCell>
												<TableCell className="gym-col-status">
													<span className={`admin-gym-status is-${gym.gymStatus.toLowerCase()}`}>
														{t(gymStatusLabelKeys[gym.gymStatus])}
													</span>
												</TableCell>
												<TableCell className="gym-col-updated">
													<GymUpdated gym={gym} locale={dateLocale} />
												</TableCell>
												<TableCell className="gym-col-action">
													<Link
														href={{ pathname: '/_admin/gyms/detail', query: { id: gym._id } }}
														aria-label={t('list.detailAction', { name: gym.gymName })}
													>
														{t(gym.gymStatus === GymStatus.DELETE ? 'list.view' : 'list.edit')}
													</Link>
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</TableContainer>
				)}
				<TablePagination
					component="div"
					count={total}
					page={Math.min(input.page, lastPage) - 1}
					rowsPerPage={input.limit}
					rowsPerPageOptions={[10, 20, 40, 60]}
					onPageChange={(_, page) => setInput((current) => ({ ...current, page: page + 1 }))}
					onRowsPerPageChange={(event) =>
						setInput((current) => ({ ...current, page: 1, limit: Number(event.target.value) }))
					}
					labelRowsPerPage={t('list.rowsPerPage')}
					labelDisplayedRows={({ from, to, count }) => t('list.pagination', { from, to, total: count })}
					getItemAriaLabel={(type) => t(type === 'previous' ? 'list.previousPage' : 'list.nextPage')}
					backIconButtonProps={{ disabled: loading || Boolean(error) || input.page === 1 }}
					nextIconButtonProps={{ disabled: loading || Boolean(error) || input.page >= lastPage }}
				/>
			</div>
		</div>
	);
};

const Gyms = () => (
	<AdminGymAccess>
		<GymList />
	</AdminGymAccess>
);
export default Gyms;
