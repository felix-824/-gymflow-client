import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApolloClient, useMutation, useQuery, useReactiveVar } from '@apollo/client';
import {
	Avatar,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Pagination,
	Skeleton,
	useMediaQuery,
} from '@mui/material';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import { useTranslation } from 'next-i18next';
import { GET_TRAINER_RESERVATIONS } from '../../../apollo/user/query';
import { UPDATE_TRAINER_RESERVATION } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getJwtToken, updateUserInfo } from '../../auth';
import { formatBookingDate } from '../../booking';
import { REACT_APP_API_URL } from '../../config';
import { ReservationPeriod } from '../../enums/reservation-query.enum';
import { ReservationStatus } from '../../enums/reservation.enum';
import { ProgramLocation, ProgramType } from '../../enums/program.enum';
import { cancellationErrorKind, lastReservationPage, reservationTotal } from '../../my-bookings';
import {
	findTrainerReservation,
	readTrainerReservationsQuery,
	trainerReservationActions,
	trainerReservationsAccess,
	trainerReservationsLimit,
} from '../../trainer-reservations';
import {
	TrainerReservation,
	TrainerReservations as Reservations,
	TrainerReservationsInquiry,
	TrainerReservationUpdate,
} from '../../types/reservation/trainer-reservation';
import { TrainerWorkspaceHeader, TrainerWorkspaceNavigation } from './TrainerWorkspaceNavigation';

interface ReservationQuery {
	getTrainerReservations: Reservations;
}
interface ReservationAction {
	reservation: TrainerReservation;
	status: ReservationStatus;
}
const actionLabels: Partial<Record<ReservationStatus, string>> = {
	CONFIRMED: 'Confirm',
	CANCELLED: 'Cancel',
	COMPLETED: 'Complete',
	NO_SHOW: 'No Show',
};

function ReservationRow({
	reservation,
	now,
	disabled,
	processing,
	onAction,
}: {
	reservation: TrainerReservation;
	now: number;
	disabled: boolean;
	processing?: ReservationAction | null;
	onAction: (reservation: TrainerReservation, status: ReservationStatus) => void;
}) {
	const { t } = useTranslation('common');
	const { locale = 'en' } = useRouter();
	const { memberData: member, programData: program } = reservation;
	const name =
		member?.memberFullName?.trim() || member?.memberNick?.trim() || t('Trainer reservations.Missing client') || '';
	const request = reservation.specialRequest?.trim();
	const online = program?.programType === ProgramType.ONLINE || program?.programLocation === ProgramLocation.ONLINE;
	const address = !online ? program?.programAddress?.trim() : '';
	const date = formatBookingDate(reservation.reservationDate, locale, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
	const actions = trainerReservationActions(reservation, new Date(now));
	return (
		<tbody
			className={`trainer-reservation status-${reservation.reservationStatus.toLowerCase()}${
				request ? ' has-request' : ''
			}`}
			data-reservation-id={reservation._id}
		>
			<tr className="trainer-reservation-main">
				<td className="trainer-reservation-client">
					<Avatar
						src={
							member?.memberImage
								? /^https?:\/\//i.test(member.memberImage)
									? member.memberImage
									: `${REACT_APP_API_URL}/${member.memberImage.replace(/^\//, '')}`
								: undefined
						}
						alt=""
					>
						{Array.from(name)[0]?.toUpperCase()}
					</Avatar>
					<div>
						<strong>{name}</strong>
						<span className="trainer-reservation-mobile-description">
							{reservation.reservationStatus === ReservationStatus.PENDING
								? t('Trainer reservations.Request submitted')
								: reservation.reservationStatus === ReservationStatus.CONFIRMED
								? t('Trainer reservations.Scheduled')
								: ''}
						</span>
					</div>
				</td>
				<td className="trainer-reservation-time">
					<div>
						<CalendarMonthOutlinedIcon aria-hidden="true" />
						<time dateTime={reservation.reservationDate}>{date}</time>
					</div>
					<span className="trainer-reservation-hours">
						{reservation.startTime}–{reservation.endTime}
					</span>
				</td>
				<td className="trainer-reservation-program">
					<div className="trainer-reservation-program-title">
						<FitnessCenterOutlinedIcon aria-hidden="true" />
						<strong>{program?.programName || t('MyBookings.Missing program')}</strong>
						<span className="trainer-reservation-mobile-type">{program && t(program.programType)}</span>
					</div>
					<div className="trainer-reservation-location">
						{program && (
							<>
								<span className="trainer-reservation-desktop-type">{t(program.programType)}</span>
								<span className="trainer-reservation-desktop-type" aria-hidden="true">
									·
								</span>
								<LocationOnOutlinedIcon aria-hidden="true" />
								<span>
									{t(online ? 'ONLINE' : program.programLocation)}
									{address && ` · ${address}`}
								</span>
							</>
						)}
					</div>
				</td>
				<td className="trainer-reservation-status">
					<span className="trainer-reservation-badge">
						<span aria-hidden="true" />
						{t(`MyBookings.${reservation.reservationStatus}`)}
					</span>
				</td>
				<td className="trainer-reservation-actions">
					{actions.map((status) => (
						<Button
							key={status}
							type="button"
							className={
								status === ReservationStatus.CONFIRMED || status === ReservationStatus.COMPLETED ? 'is-primary' : ''
							}
							disabled={disabled}
							onClick={() => onAction(reservation, status)}
							data-action={status}
						>
							{status === ReservationStatus.CONFIRMED && <CheckRoundedIcon aria-hidden="true" />}
							{status === ReservationStatus.CANCELLED &&
								reservation.reservationStatus === ReservationStatus.CONFIRMED && (
									<EventBusyOutlinedIcon aria-hidden="true" />
								)}
							{processing?.reservation._id === reservation._id && processing.status === status
								? t('Trainer reservations.Processing')
								: status === ReservationStatus.CANCELLED &&
								  reservation.reservationStatus === ReservationStatus.CONFIRMED
								? t('MyBookings.Cancel Reservation')
								: t(`Trainer reservations.${actionLabels[status]}`)}
						</Button>
					))}
				</td>
			</tr>
			{request && (
				<tr className="trainer-reservation-request-row">
					<td colSpan={5}>
						<div className="trainer-reservation-request">
							<InfoOutlinedIcon aria-hidden="true" />
							<p>
								<strong>{t('MyBookings.Special Request')}:</strong> {request}
							</p>
						</div>
					</td>
				</tr>
			)}
		</tbody>
	);
}

function ReservationsContent({ memberId }: { memberId: string }) {
	const router = useRouter();
	const { t } = useTranslation('common');
	const client = useApolloClient();
	const { period, status, page } = readTrainerReservationsQuery(router.query);
	const input: TrainerReservationsInquiry = useMemo(
		() => ({
			page,
			limit: trainerReservationsLimit,
			search: { period, ...(status ? { reservationStatus: status } : {}) },
		}),
		[page, period, status],
	);
	const [selected, setSelected] = useState<ReservationAction | null>(null);
	const [processing, setProcessing] = useState<ReservationAction | null>(null);
	const [uncertain, setUncertain] = useState<ReservationAction | null>(null);
	const [reconciling, setReconciling] = useState(false);
	const [feedback, setFeedback] = useState('');
	const [now, setNow] = useState(Date.now);
	const writeLock = useRef(false);
	const dialogLock = useRef(false);
	const mounted = useRef(true);
	const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const activeAccount = () =>
		mounted.current &&
		authReadyVar() &&
		!authErrorVar() &&
		userVar()._id === memberId &&
		userVar().memberType === 'TRAINER' &&
		userVar().memberStatus === 'ACTIVE';
	const query = useQuery<ReservationQuery>(GET_TRAINER_RESERVATIONS, {
		variables: { input },
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
	});
	const [updateReservation] = useMutation<
		{ updateTrainerReservation: TrainerReservation },
		{ input: TrainerReservationUpdate }
	>(UPDATE_TRAINER_RESERVATION);
	const result = query.data?.getTrainerReservations;
	const total = reservationTotal(result);
	const busy = Boolean(processing || selected || reconciling || uncertain);
	const { refetch } = query;
	const refresh = useCallback(async () => {
		await refetch();
	}, [refetch]);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		const update = () => {
			setNow(Date.now());
			if (!writeLock.current)
				void refresh().catch(() => {
					if (mounted.current) setFeedback('Refresh error');
				});
		};
		window.addEventListener('focus', update);
		const interval = window.setInterval(update, 60000);
		return () => {
			window.removeEventListener('focus', update);
			window.clearInterval(interval);
		};
	}, [refresh]);
	useEffect(() => {
		if (!result || query.loading || query.error || busy || page <= lastReservationPage(total, trainerReservationsLimit))
			return;
		void router.replace(
			{ pathname: '/mypage', query: { ...router.query, page: lastReservationPage(total, trainerReservationsLimit) } },
			undefined,
			{ shallow: true, scroll: false },
		);
	}, [result, query.loading, query.error, total, page, busy, router]);

	/** HANDLERS **/
	const navigate = async (nextPeriod: ReservationPeriod, nextStatus?: ReservationStatus, nextPage = 1) => {
		if (writeLock.current || dialogLock.current || busy) return;
		const nextQuery = {
			...router.query,
			category: 'trainerReservations',
			period: nextPeriod,
			page: nextPage,
			status: nextStatus,
		};
		if (!nextStatus) delete nextQuery.status;
		await router.push({ pathname: '/mypage', query: nextQuery }, undefined, { shallow: true, scroll: false });
	};
	const reconcile = async (action: ReservationAction) => {
		if (!activeAccount()) return;
		setReconciling(true);
		try {
			const current = await findTrainerReservation(action.reservation._id, async (readPage) => {
				if (!activeAccount()) throw new Error('Account changed');
				const response = await client.query<ReservationQuery>({
					query: GET_TRAINER_RESERVATIONS,
					variables: { input: { page: readPage, limit: 100, search: {} } },
					fetchPolicy: 'no-cache',
				});
				return response.data.getTrainerReservations;
			});
			if (!activeAccount()) return;
			if (current) {
				setUncertain(null);
				setFeedback(current.reservationStatus === action.status ? 'Success' : 'Reconciled');
			}
			await refresh();
		} catch {
			if (activeAccount()) setFeedback('Unknown');
		} finally {
			if (activeAccount()) setReconciling(false);
		}
	};
	const submit = async (action: ReservationAction) => {
		if (writeLock.current || uncertain || !activeAccount()) return;
		dialogLock.current = false;
		if (!trainerReservationActions(action.reservation).includes(action.status)) {
			setSelected(null);
			setNow(Date.now());
			setFeedback('Stale');
			await refresh().catch(() => {
				if (activeAccount()) setFeedback('Refresh error');
			});
			return;
		}
		writeLock.current = true;
		setProcessing(action);
		setFeedback('');
		let succeeded = false;
		try {
			const response = await updateReservation({
				variables: { input: { _id: action.reservation._id, reservationStatus: action.status } },
			});
			if (!activeAccount()) return;
			const receipt = response.data?.updateTrainerReservation;
			if (receipt?._id !== action.reservation._id || receipt.reservationStatus !== action.status) {
				setUncertain(action);
				setFeedback('Unknown');
				await reconcile(action);
				return;
			}
			succeeded = true;
			setFeedback('Success');
			await refresh();
		} catch (error) {
			if (!activeAccount()) return;
			if (succeeded) setFeedback('Success refresh error');
			else if (cancellationErrorKind(error) === 'unknown') {
				setUncertain(action);
				setFeedback('Unknown');
				await reconcile(action);
			} else {
				setFeedback(cancellationErrorKind(error) === 'stale' ? 'Stale' : 'Rejected');
				await refresh().catch(() => {
					if (activeAccount()) setFeedback('Refresh error');
				});
			}
		} finally {
			if (activeAccount()) {
				writeLock.current = false;
				setProcessing(null);
				setSelected(null);
				setNow(Date.now());
			}
		}
	};
	const onAction = (reservation: TrainerReservation, target: ReservationStatus) => {
		if (writeLock.current || dialogLock.current || busy || query.loading || query.error || !activeAccount()) return;
		const action = { reservation, status: target };
		if (target === ReservationStatus.CANCELLED || target === ReservationStatus.NO_SHOW) {
			dialogLock.current = true;
			setSelected(action);
		} else void submit(action);
	};
	const closeDialog = () => {
		if (!writeLock.current) {
			dialogLock.current = false;
			setSelected(null);
		}
	};
	const retry = async () => {
		if (writeLock.current || reconciling) return;
		if (uncertain) await reconcile(uncertain);
		else {
			setFeedback('');
			await refresh().catch(() => {
				if (activeAccount()) setFeedback('Refresh error');
			});
		}
	};
	const filters =
		period === ReservationPeriod.UPCOMING
			? [ReservationStatus.PENDING, ReservationStatus.CONFIRMED]
			: Object.values(ReservationStatus);
	return (
		<>
			<div className="trainer-reservations-heading">
				<div>
					<h1>{t('Trainer schedule.Reservations')}</h1>
					<p>{t('Trainer reservations.Description')}</p>
				</div>
				<nav className="trainer-reservations-period" aria-label={t('MyBookings.Period')}>
					{[ReservationPeriod.UPCOMING, ReservationPeriod.HISTORY].map((value) => (
						<button
							type="button"
							key={value}
							aria-current={period === value ? 'page' : undefined}
							disabled={busy}
							onClick={() => void navigate(value)}
						>
							{t(`MyBookings.${value}`)}
						</button>
					))}
				</nav>
			</div>
			<div className="trainer-reservations-toolbar">
				<nav className="trainer-reservations-filters" aria-label={t('Trainer reservations.Status filter')}>
					<button type="button" aria-pressed={!status} disabled={busy} onClick={() => void navigate(period)}>
						{t('Trainer reservations.All')}
					</button>
					{filters.map((value) => (
						<button
							type="button"
							key={value}
							className={`filter-${value.toLowerCase()}`}
							aria-pressed={status === value}
							disabled={busy}
							onClick={() => void navigate(period, value)}
						>
							<span aria-hidden="true" />
							{t(`MyBookings.${value}`)}
						</button>
					))}
				</nav>
				<p className="trainer-reservations-context">
					<ScheduleOutlinedIcon aria-hidden="true" />
					<span>
						{result && !query.error
							? t('Trainer reservations.Showing', { count: total })
							: t('Trainer reservations.Session context')}{' '}
						· {t('Trainer schedule.Timezone')}
					</span>
				</p>
			</div>
			{feedback && (
				<div className="trainer-reservations-feedback" role="status">
					<p>{t(`Trainer reservations.${feedback}`)}</p>
					<Button disabled={Boolean(processing || reconciling)} onClick={() => void retry()}>
						{t(uncertain ? 'Trainer reservations.Check status' : 'MyBookings.Retry')}
					</Button>
				</div>
			)}
			<div className="trainer-reservations-update" role="status">
				{result && query.loading ? t('MyBookings.Updating') : ''}
			</div>
			<section aria-label={t(`MyBookings.${period}`)} aria-busy={query.loading}>
				{!result && !query.error ? (
					<div className="trainer-reservations-loading" role="status">
						<p>{t('Trainer reservations.Loading')}</p>
						{[1, 2, 3].map((value) => (
							<Skeleton key={value} variant="rounded" height={100} />
						))}
					</div>
				) : query.error ? (
					<div className="trainer-reservations-state" role="alert">
						<p>{t('Trainer reservations.Load error')}</p>
						<Button onClick={() => void retry()} disabled={busy}>
							{t('MyBookings.Retry')}
						</Button>
					</div>
				) : !result?.list.length ? (
					<div className="trainer-reservations-state">
						<p>
							{t(
								status
									? status === ReservationStatus.PENDING
										? 'Trainer reservations.No pending'
										: status === ReservationStatus.CONFIRMED
										? 'Trainer reservations.No confirmed'
										: 'Trainer reservations.No matching'
									: period === ReservationPeriod.UPCOMING
									? 'Trainer reservations.No upcoming'
									: 'Trainer reservations.No history',
							)}
						</p>
						{status && (
							<Button onClick={() => void navigate(period)} disabled={busy}>
								{t('Trainer reservations.Clear filters')}
							</Button>
						)}
					</div>
				) : (
					<table className="trainer-reservations-table">
						<caption className="trainer-reservations-sr-only">{t('Trainer schedule.Reservations')}</caption>
						<colgroup>
							<col className="client-column" />
							<col className="time-column" />
							<col className="program-column" />
							<col className="status-column" />
							<col className="actions-column" />
						</colgroup>
						<thead>
							<tr>
								{['Client', 'Session Time', 'Program & Location', 'Status', 'Actions'].map((label) => (
									<th key={label} scope="col">
										{t(`Trainer reservations.${label}`)}
									</th>
								))}
							</tr>
						</thead>
						{result.list.map((reservation) => (
							<ReservationRow
								key={reservation._id}
								reservation={reservation}
								now={now}
								disabled={busy || query.loading}
								processing={processing}
								onAction={onAction}
							/>
						))}
					</table>
				)}
			</section>
			{result && !query.error && total > 0 && (
				<div className="trainer-reservations-pagination">
					<p>
						{t('Trainer reservations.Range', {
							start: Math.min((page - 1) * trainerReservationsLimit + 1, total),
							end: Math.min(page * trainerReservationsLimit, total),
							total,
						})}
					</p>
					<nav aria-label={t('Trainer reservations.Pagination')}>
						<Pagination
							count={lastReservationPage(total, trainerReservationsLimit)}
							page={Math.min(page, lastReservationPage(total, trainerReservationsLimit))}
							disabled={busy || query.loading}
							siblingCount={0}
							boundaryCount={1}
							onChange={(_, value) => void navigate(period, status, value)}
							getItemAriaLabel={(type, value, current) =>
								type === 'page'
									? t(current ? 'MyBookings.Current page' : 'MyBookings.Go to page', { page: value })
									: t(`MyBookings.${type}`)
							}
						/>
					</nav>
				</div>
			)}
			<Dialog
				open={selected !== null}
				onClose={closeDialog}
				transitionDuration={reducedMotion ? 0 : undefined}
				maxWidth="xs"
				fullWidth
				aria-labelledby="trainer-reservation-action-title"
				aria-describedby="trainer-reservation-action-description"
			>
				<DialogTitle id="trainer-reservation-action-title">
					{t(
						selected?.status === ReservationStatus.NO_SHOW
							? 'Trainer reservations.No show title'
							: 'MyBookings.Confirm title',
					)}
				</DialogTitle>
				<DialogContent>
					<DialogContentText id="trainer-reservation-action-description">
						{t('Trainer reservations.Confirm description', {
							action: t(`Trainer reservations.${actionLabels[selected?.status ?? ReservationStatus.CANCELLED]}`),
							client:
								selected?.reservation.memberData?.memberFullName?.trim() ||
								selected?.reservation.memberData?.memberNick ||
								t('Trainer reservations.Missing client'),
							date: selected?.reservation.reservationDate,
							time: selected?.reservation.startTime,
						})}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={closeDialog} disabled={Boolean(processing)} autoFocus>
						{t('Trainer reservations.Back')}
					</Button>
					<Button variant="contained" onClick={() => selected && void submit(selected)} disabled={Boolean(processing)}>
						{t(
							processing
								? 'Trainer reservations.Processing'
								: `Trainer reservations.${actionLabels[selected?.status ?? ReservationStatus.CANCELLED]}`,
						)}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}

const TrainerReservations = () => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const access = trainerReservationsAccess(ready && router.isReady, authError, user);
	const { period, status, page } = readTrainerReservationsQuery(router.query);
	return (
		<div className="trainer-reservations-workspace">
			<TrainerWorkspaceHeader active="Reservations" />
			<div id="trainer-reservations-page">
				<nav className="trainer-reservations-breadcrumb" aria-label={t('MyBookings.Breadcrumb')}>
					<Link href="/mypage">{t('Trainer schedule.Workspace')}</Link>
					<span aria-hidden="true">/</span>
					<span>{t('Trainer schedule.Reservations')}</span>
				</nav>
				{access === 'ready' ? (
					<ReservationsContent key={`${user._id}:${period}:${status ?? 'all'}:${page}`} memberId={user._id} />
				) : (
					<>
						<div className="trainer-reservations-heading">
							<h1>{t('Trainer schedule.Reservations')}</h1>
						</div>
						<div className="trainer-reservations-state" role={access === 'error' ? 'alert' : 'status'}>
							<p>
								{t(
									access === 'initializing' || access === 'error'
										? `MyBookings.${access}`
										: `Trainer reservations.${access}`,
								)}
							</p>
							{access === 'guest' && (
								<Link href={{ pathname: '/account/join', query: { referrer: router.asPath } }}>
									{t('Login / Register')}
								</Link>
							)}
							{access === 'forbidden' && <Link href="/mypage">{t('My Page')}</Link>}
							{access === 'error' && (
								<Button onClick={() => void updateUserInfo(getJwtToken())}>{t('MyBookings.Retry')}</Button>
							)}
						</div>
					</>
				)}
			</div>
			<TrainerWorkspaceNavigation active="Reservations" mobile />
		</div>
	);
};

export default TrainerReservations;
