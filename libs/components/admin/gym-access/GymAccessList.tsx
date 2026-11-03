import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@apollo/client';
import {
	Button,
	Tab,
	Tabs,
	TextField,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	useMediaQuery,
} from '@mui/material';
import { GET_TRAINER_GYM_ACCESSES_BY_ADMIN } from '../../../../apollo/admin/query';
import { TrainerGymAccessStatus as Status } from '../../../enums/trainer-gym-access.enum';
import {
	AdminTrainerGymAccessInquiry,
	AdminTrainerGymAccessRow,
	AdminTrainerGymAccesses,
} from '../../../types/trainer-gym-access/trainer-gym-access-admin';
import { adminGymAccessRoute, gymAccessId, readAdminGymAccessInquiry } from '../../../admin-gym-access';
import AdminGymAccess, { AccessDate, AccessStatus, TrainerIdentity } from './AdminGymAccess';

const AccessList = () => {
	const { t } = useTranslation('admin-gym-access');
	const router = useRouter();
	const compact = useMediaQuery('(max-width:899px)');
	const [input, setInput] = useState<AdminTrainerGymAccessInquiry>(() => readAdminGymAccessInquiry(router.query.input));
	const [trainerId, setTrainerId] = useState(input.search.trainerId ?? '');
	const [gymId, setGymId] = useState(input.search.gymId ?? '');
	const [invalidFilters, setInvalidFilters] = useState(false);
	const { data, loading, error, refetch } = useQuery<{ getTrainerGymAccessesByAdmin: AdminTrainerGymAccesses }>(
		GET_TRAINER_GYM_ACCESSES_BY_ADMIN,
		{
			variables: { input },
			fetchPolicy: 'no-cache',
			notifyOnNetworkStatusChange: true,
			context: { handleErrorLocally: true, queryDeduplication: false },
		},
	);
	const result = data?.getTrainerGymAccessesByAdmin;
	const invalidResult = Boolean(
		result &&
			(!Array.isArray(result.list) ||
				!Number.isSafeInteger(result.metaCounter?.[0]?.total) ||
				result.metaCounter[0].total < 0),
	);
	const total = !invalidResult ? result?.metaCounter?.[0]?.total ?? 0 : 0;
	const lastPage = Math.max(1, Math.ceil(total / input.limit));
	useEffect(() => {
		if (!loading && !error && result && !invalidResult && input.page > lastPage)
			setInput((current) => ({ ...current, page: lastPage }));
	}, [result, loading, error, invalidResult, input.page, lastPage]);
	const submitFilters = (event: FormEvent) => {
		event.preventDefault();
		if ((trainerId.trim() && !gymAccessId(trainerId.trim())) || (gymId.trim() && !gymAccessId(gymId.trim()))) {
			setInvalidFilters(true);
			return;
		}
		setInvalidFilters(false);
		setInput({
			...input,
			page: 1,
			search: {
				...(input.search.status ? { status: input.search.status } : {}),
				...(trainerId.trim() ? { trainerId: gymAccessId(trainerId.trim()) } : {}),
				...(gymId.trim() ? { gymId: gymAccessId(gymId.trim()) } : {}),
			},
		});
	};
	const detailLink = (row: AdminTrainerGymAccessRow) => (
		<Link
			className="access-detail-link"
			href={{ pathname: `${adminGymAccessRoute}/detail`, query: { id: row._id, input: JSON.stringify(input) } }}
			aria-label={`${t(row.status === Status.PENDING ? 'Review' : 'View')}: ${
				row.trainerData?.memberFullName || row.trainerData?.memberNick || t('Trainer unavailable')
			}, ${row.gymData?.gymName || t('Gym unavailable')}`}
		>
			{t(row.status === Status.PENDING ? 'Review' : 'View')}
		</Link>
	);
	const dates = (row: AdminTrainerGymAccessRow) => (
		<dl className="access-dates">
			<div>
				<dt>{t('Requested')}</dt>
				<dd>
					<AccessDate value={row.createdAt} />
				</dd>
			</div>
			{row.reviewedAt && (
				<div>
					<dt>{t('Reviewed')}</dt>
					<dd>
						<AccessDate value={row.reviewedAt} />
					</dd>
				</div>
			)}
			{row.revokedAt && (
				<div>
					<dt>{t('Revoked date')}</dt>
					<dd>
						<AccessDate value={row.revokedAt} />
					</dd>
				</div>
			)}
		</dl>
	);
	const failed = Boolean(error || invalidResult || (!loading && !result));
	const feedback = loading ? (
		<p role="status">{t('Loading')}</p>
	) : failed ? (
		<div role="alert">
			<p>{t('Load error')}</p>
			<Button onClick={() => void refetch().catch(() => undefined)}>{t('Retry')}</Button>
		</div>
	) : (
		<p>{t(input.search.status === Status.PENDING ? 'Empty pending' : 'Empty')}</p>
	);
	return (
		<div className="content admin-gym-access access-list">
			<header className="access-heading">
				<h1>{t('Title')}</h1>
				<p>{t('Intro')}</p>
			</header>
			<div className="access-list-surface">
				<Tabs
					value={input.search.status ?? 'ALL'}
					variant="scrollable"
					scrollButtons="auto"
					allowScrollButtonsMobile
					aria-label={t('Status filter')}
					onChange={(_, status: Status | 'ALL') =>
						setInput({ ...input, page: 1, search: { ...input.search, status: status === 'ALL' ? undefined : status } })
					}
				>
					{['ALL', ...Object.values(Status)].map((status) => (
						<Tab key={status} value={status} label={t('status.' + status)} />
					))}
				</Tabs>
				<form className="access-filters" onSubmit={submitFilters} noValidate>
					<TextField
						id="access-trainer-filter"
						label={t('Trainer filter')}
						value={trainerId}
						onChange={(event) => setTrainerId(event.target.value)}
						size="small"
						inputProps={{ maxLength: 24 }}
						error={invalidFilters && Boolean(trainerId.trim()) && !gymAccessId(trainerId.trim())}
						helperText={
							invalidFilters && trainerId.trim() && !gymAccessId(trainerId.trim()) ? t('ID error') : undefined
						}
					/>
					<TextField
						id="access-gym-filter"
						label={t('Gym filter')}
						value={gymId}
						onChange={(event) => setGymId(event.target.value)}
						size="small"
						inputProps={{ maxLength: 24 }}
						error={invalidFilters && Boolean(gymId.trim()) && !gymAccessId(gymId.trim())}
						helperText={invalidFilters && gymId.trim() && !gymAccessId(gymId.trim()) ? t('ID error') : undefined}
					/>
					<Button type="submit" variant="outlined" disabled={loading}>
						{t('Apply filters')}
					</Button>
					{(trainerId || gymId || input.search.trainerId || input.search.gymId) && (
						<Button
							onClick={() => {
								setTrainerId('');
								setGymId('');
								setInvalidFilters(false);
								setInput({ ...input, page: 1, search: input.search.status ? { status: input.search.status } : {} });
							}}
						>
							{t('Clear filters')}
						</Button>
					)}
					<p>{t('Filter hint')}</p>
				</form>
				{loading || failed || !result?.list.length ? (
					<div className="access-feedback">{feedback}</div>
				) : compact ? (
					<ul className="access-mobile-list" aria-label={t('Title')}>
						{result.list.map((row) => (
							<li key={row._id} data-access-id={row._id}>
								<TrainerIdentity trainer={row.trainerData} />
								<AccessStatus status={row.status} />
								<h2>{row.gymData?.gymName || t('Gym unavailable')}</h2>
								<p>{t('relationship.' + row.relationshipType)}</p>
								{dates(row)}
								{detailLink(row)}
							</li>
						))}
					</ul>
				) : (
					<TableContainer>
						<Table aria-label={t('Title')}>
							<TableHead>
								<TableRow>
									{['Trainer', 'Gym', 'Relationship', 'Status', 'Dates', 'Action'].map((column) => (
										<TableCell key={column}>{t(column)}</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{result.list.map((row) => (
									<TableRow key={row._id} data-access-id={row._id}>
										<TableCell>
											<TrainerIdentity trainer={row.trainerData} />
										</TableCell>
										<TableCell>{row.gymData?.gymName || t('Gym unavailable')}</TableCell>
										<TableCell>{t('relationship.' + row.relationshipType)}</TableCell>
										<TableCell>
											<AccessStatus status={row.status} />
										</TableCell>
										<TableCell>{dates(row)}</TableCell>
										<TableCell>{detailLink(row)}</TableCell>
									</TableRow>
								))}
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
					onPageChange={(_, page) => setInput({ ...input, page: page + 1 })}
					onRowsPerPageChange={(event) => setInput({ ...input, page: 1, limit: Number(event.target.value) })}
					labelRowsPerPage={t('Rows per page')}
					labelDisplayedRows={({ from, to, count }) => t('Pagination', { from, to, total: count })}
					getItemAriaLabel={(type) => t(type === 'previous' ? 'Previous page' : 'Next page')}
					backIconButtonProps={{ disabled: loading || failed || input.page <= 1 }}
					nextIconButtonProps={{ disabled: loading || failed || input.page >= lastPage }}
				/>
			</div>
		</div>
	);
};
const GymAccessList = () => (
	<AdminGymAccess>
		<AccessList />
	</AdminGymAccess>
);
export default GymAccessList;
