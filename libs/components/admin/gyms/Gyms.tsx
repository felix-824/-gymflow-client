import React, { useEffect, useState } from 'react';
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
} from '@mui/material';
import { Buildings } from 'phosphor-react';
import { GET_ALL_GYMS_BY_ADMIN } from '../../../../apollo/admin/query';
import { AdminGyms } from '../../../types/gym/gym';
import { AllGymsInquiry } from '../../../types/gym/gym.input';
import { Direction } from '../../../enums/common.enum';
import { GymLocation, GymStatus } from '../../../enums/gym.enum';
import { gymImagesError, gymStatusLabelKeys } from '../../../admin-gyms';
import { REACT_APP_API_URL } from '../../../config';
import AdminGymAccess from './AdminGymAccess';

const GymList = () => {
	const { t } = useTranslation(['admin-gyms', 'common']);
	const { locale } = useRouter();
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
	return (
		<div className="content admin-gyms">
			<header className="admin-gym-heading">
				<h1>{t('list.title')}</h1>
				<p>{t('list.intro')}</p>
			</header>
			<div className="table-wrap">
				<Tabs
					value={input.search.gymStatus ?? 'ALL'}
					aria-label={t('list.statusFilter')}
					variant="scrollable"
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
					<Button type="submit" variant="contained">
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
				<TableContainer>
					<Table aria-label={t('list.tableLabel')} aria-busy={loading}>
						<TableHead>
							<TableRow>
								{['gym', 'location', 'address', 'status', 'updated'].map((column) => (
									<TableCell key={column}>{t(`list.columns.${column}`)}</TableCell>
								))}
							</TableRow>
						</TableHead>
						<TableBody>
							{loading || error || !gyms?.list.length ? (
								<TableRow>
									<TableCell colSpan={5} className="admin-gym-empty">
										{loading ? (
											<p role="status">{t('list.loading')}</p>
										) : error ? (
											<div role="alert">
												<p>{t('list.error')}</p>
												<Button onClick={() => void refetch({ input }).catch(() => undefined)}>
													{t('list.retry')}
												</Button>
											</div>
										) : (
											<p>{t(filtered ? 'list.filteredEmpty' : 'list.empty')}</p>
										)}
									</TableCell>
								</TableRow>
							) : (
								gyms.list.map((gym) => {
									const cover = gym.gymImages[0];
									const coverUrl = cover && !gymImagesError([cover]) ? `${REACT_APP_API_URL}/${cover}` : undefined;
									const alt = t('list.coverAlt', { name: gym.gymName });
									const updated = new Date(typeof gym.updatedAt === 'string' ? gym.updatedAt : gym.updatedAt.getTime());
									return (
										<TableRow key={gym._id} hover>
											<TableCell>
												<div className="admin-gym-name">
													<Avatar
														variant="rounded"
														src={coverUrl}
														alt={alt}
														sx={{ width: 48, height: 48 }}
														imgProps={{ loading: 'lazy' }}
													>
														<Buildings role="img" aria-label={alt} size={24} />
													</Avatar>
													<span>{gym.gymName}</span>
												</div>
											</TableCell>
											<TableCell>{t(gym.gymLocation, { ns: 'common' })}</TableCell>
											<TableCell>{gym.gymAddress}</TableCell>
											<TableCell>
												<span className={`admin-gym-status is-${gym.gymStatus.toLowerCase()}`}>
													{t(gymStatusLabelKeys[gym.gymStatus])}
												</span>
											</TableCell>
											<TableCell>
												<time dateTime={updated.toISOString()}>
													{updated.toLocaleDateString(dateLocale, {
														year: 'numeric',
														month: 'short',
														day: 'numeric',
														timeZone: 'Asia/Seoul',
													})}
												</time>
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</TableContainer>
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
