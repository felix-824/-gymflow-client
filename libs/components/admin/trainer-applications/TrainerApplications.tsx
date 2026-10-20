import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import {
	Avatar,
	Button,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	Tab,
	Tabs,
} from '@mui/material';
import { GET_TRAINER_APPLICATIONS_BY_ADMIN } from '../../../../apollo/admin/query';
import { TrainerApplicationStatus } from '../../../enums/trainer-application.enum';
import {
	TrainerApplications as Applications,
	TrainerApplicationsInquiry,
} from '../../../types/trainer-application/trainer-application-admin';
import { adminTrainerApplicationsRoute, trainerApplicantInitials } from '../../../admin-trainer-applications';
import AdminApplicationAccess from './AdminApplicationAccess';

const ApplicationList = () => {
	const { t } = useTranslation(['admin-trainer-applications', 'common']);
	const { locale } = useRouter();
	const [input, setInput] = useState<TrainerApplicationsInquiry>({
		page: 1,
		limit: 10,
		search: { status: TrainerApplicationStatus.PENDING },
	});
	const { data, loading, error, refetch } = useQuery<{ getTrainerApplicationsByAdmin: Applications }>(
		GET_TRAINER_APPLICATIONS_BY_ADMIN,
		{
			variables: { input },
			fetchPolicy: 'no-cache',
			notifyOnNetworkStatusChange: true,
			context: { handleErrorLocally: true, queryDeduplication: false },
		},
	);
	const applications = data?.getTrainerApplicationsByAdmin;
	const total = applications?.metaCounter?.[0]?.total ?? 0;
	const lastPage = Math.max(1, Math.ceil(total / input.limit));
	useEffect(() => {
		if (!loading && !error && applications && input.page > lastPage)
			setInput((current) => ({ ...current, page: lastPage }));
	}, [applications, loading, error, input.page, lastPage]);
	const dateLocale = locale === 'kr' ? 'ko-KR' : locale === 'ru' ? 'ru-RU' : 'en-US';
	return (
		<div className="content admin-trainer-applications">
			<header className="admin-application-heading">
				<h1>{t('Title')}</h1>
				<p>{t('Intro')}</p>
			</header>
			<div className="table-wrap">
				<Tabs
					value={input.search.status}
					onChange={(_, status: TrainerApplicationStatus) => setInput({ ...input, page: 1, search: { status } })}
					aria-label={t('Status')}
					variant="scrollable"
					scrollButtons="auto"
				>
					{Object.values(TrainerApplicationStatus).map((status) => (
						<Tab key={status} value={status} label={t(status)} />
					))}
				</Tabs>
				<TableContainer>
					<Table aria-label={t('Title')}>
						<TableHead>
							<TableRow>
								{['Applicant', 'Specialties', 'Status', 'Submitted Date', 'Action'].map((column) => (
									<TableCell key={column}>{t(column)}</TableCell>
								))}
							</TableRow>
						</TableHead>
						<TableBody>
							{loading || error || !applications?.list.length ? (
								<TableRow>
									<TableCell colSpan={5} className="admin-application-empty">
										{loading ? (
											<p role="status">{t('Loading')}</p>
										) : error ? (
											<div role="alert">
												<p>{t('Load error')}</p>
												<Button onClick={() => void refetch().catch(() => undefined)}>{t('Retry')}</Button>
											</div>
										) : (
											<p>{t(`Empty ${input.search.status}`)}</p>
										)}
									</TableCell>
								</TableRow>
							) : (
								applications.list.map((application) => (
									<TableRow key={application._id} hover>
										<TableCell>
											<div className="admin-application-applicant">
												<Avatar aria-hidden="true">{trainerApplicantInitials(application.fullName)}</Avatar>
												<span>{application.fullName}</span>
											</div>
										</TableCell>
										<TableCell>
											<div className="admin-application-specialties">
												{application.categories.map((category) => (
													<span key={category}>{t(category, { ns: 'common' })}</span>
												))}
											</div>
										</TableCell>
										<TableCell>
											<span className={`admin-application-status is-${application.status.toLowerCase()}`}>
												{t(`Status ${application.status}`)}
											</span>
										</TableCell>
										<TableCell>
											<time dateTime={application.createdAt}>
												{new Date(application.createdAt).toLocaleDateString(dateLocale, {
													year: 'numeric',
													month: 'short',
													day: 'numeric',
												})}
											</time>
										</TableCell>
										<TableCell>
											<Link
												href={{
													pathname: `${adminTrainerApplicationsRoute}/detail`,
													query: { applicationId: application._id },
												}}
											>
												{t(application.status === TrainerApplicationStatus.PENDING ? 'Review' : 'View')}
											</Link>
										</TableCell>
									</TableRow>
								))
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
					onPageChange={(_, page) => setInput({ ...input, page: page + 1 })}
					onRowsPerPageChange={(event) => setInput({ ...input, page: 1, limit: Number(event.target.value) })}
					labelRowsPerPage={t('Rows per page')}
					labelDisplayedRows={({ from, to, count }) => t('Pagination', { from, to, total: count })}
					getItemAriaLabel={(type) => t(type === 'previous' ? 'Previous page' : 'Next page')}
					backIconButtonProps={{ disabled: loading || input.page === 1 }}
					nextIconButtonProps={{ disabled: loading || input.page >= lastPage }}
				/>
			</div>
		</div>
	);
};

const TrainerApplications = () => (
	<AdminApplicationAccess>
		<ApplicationList />
	</AdminApplicationAccess>
);
export default TrainerApplications;
