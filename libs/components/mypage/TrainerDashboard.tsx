import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApolloClient, useQuery, useReactiveVar } from '@apollo/client';
import { Avatar, Button, Skeleton } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import { useTranslation } from 'next-i18next';
import { GET_TRAINER_RESERVATIONS, GET_TRAINER_PROGRAMS, GET_MY_TRAINER_SCHEDULE } from '../../../apollo/user/query';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getJwtToken, updateUserInfo } from '../../auth';
import { formatBookingDate } from '../../booking';
import { reservationTotal } from '../../my-bookings';
import { REACT_APP_API_URL } from '../../config';
import { ReservationPeriod } from '../../enums/reservation-query.enum';
import { ReservationStatus } from '../../enums/reservation.enum';
import { ProgramType, ProgramLocation } from '../../enums/program.enum';
import { trainerReservationActions, trainerReservationsAccess } from '../../trainer-reservations';
import {
	dashboardPreviewLimit,
	dashboardSessionPageSize,
	dashboardWeek,
	findNextTrainerSession,
} from '../../trainer-dashboard';
import { TrainerReservation, TrainerReservations } from '../../types/reservation/trainer-reservation';
import { Programs } from '../../types/program/program';
import { TrainerSchedule } from '../../types/trainer-schedule/trainer-schedule';
import { TrainerWorkspaceHeader, TrainerWorkspaceNavigation } from './TrainerWorkspaceNavigation';
import {
	useTrainerReservationActions,
	TrainerReservationActionDialog,
	TrainerReservationActionFeedback,
} from './useTrainerReservationActions';

const reservationsUrl = '/mypage?category=trainerReservations';
const pendingUrl = `${reservationsUrl}&period=UPCOMING&status=PENDING`;
const programsUrl = '/mypage?category=myPrograms';
const scheduleUrl = '/mypage?category=trainerSchedule';
const imageUrl = (image: string) =>
	/^https?:\/\//i.test(image) ? image : `${REACT_APP_API_URL}/${image.replace(/^\//, '')}`;

function DashboardImage({ images, name }: { images: string[]; name: string }) {
	const [failed, setFailed] = useState<string[]>([]);
	const image = images.find((value) => value?.trim() && !failed.includes(value));
	return image ? (
		<img src={imageUrl(image)} alt={name} onError={() => setFailed((current) => [...current, image])} />
	) : (
		<FitnessCenterOutlinedIcon aria-hidden="true" />
	);
}

function SectionHeading({
	title,
	href,
	action,
	children,
}: {
	title: string;
	href: string;
	action: string;
	children?: ReactNode;
}) {
	const { t } = useTranslation('common');
	return (
		<header className="dashboard-section-heading">
			<div>
				<h2>{t(`Trainer dashboard.${title}`)}</h2>
				{children}
			</div>
			<Link passHref href={href}>
				{t(`Trainer dashboard.${action}`)}
				<ArrowForwardRoundedIcon aria-hidden="true" />
			</Link>
		</header>
	);
}

function SectionState({
	loading,
	error,
	empty,
	retry,
}: {
	loading: boolean;
	error: boolean;
	empty: string;
	retry: () => void;
}) {
	const { t } = useTranslation('common');
	return (
		<div className="dashboard-state" role={error ? 'alert' : 'status'}>
			<p>{t(`Trainer dashboard.${error ? 'Load error' : loading ? 'Loading' : empty}`)}</p>
			{loading && !error && <Skeleton variant="rounded" height={100} />}
			{error && <Button onClick={retry}>{t('MyBookings.Retry')}</Button>}
		</div>
	);
}

function ClientIdentity({ reservation }: { reservation: TrainerReservation }) {
	const { t } = useTranslation('common');
	const member = reservation.memberData;
	const name =
		member?.memberFullName?.trim() || member?.memberNick?.trim() || t('Trainer reservations.Missing client') || '';
	return (
		<div className="dashboard-client">
			<Avatar src={member?.memberImage ? imageUrl(member.memberImage) : undefined} alt="">
				{Array.from(name)[0]?.toUpperCase()}
			</Avatar>
			<div>
				<strong>{name}</strong>
				{member?.memberNick && <span>@{member.memberNick}</span>}
			</div>
		</div>
	);
}

function SessionTime({ reservation }: { reservation: TrainerReservation }) {
	const { locale = 'en' } = useRouter();
	return (
		<span className="dashboard-session-time">
			<CalendarMonthOutlinedIcon aria-hidden="true" />
			<time dateTime={reservation.reservationDate}>
				{formatBookingDate(reservation.reservationDate, locale, {
					weekday: 'short',
					month: 'short',
					day: 'numeric',
					year: 'numeric',
				})}{' '}
				· {reservation.startTime}–{reservation.endTime}
			</time>
		</span>
	);
}

function SessionLocation({ reservation }: { reservation: TrainerReservation }) {
	const { t } = useTranslation('common');
	const program = reservation.programData;
	if (!program) return null;
	const online = program.programType === ProgramType.ONLINE || program.programLocation === ProgramLocation.ONLINE;
	return (
		<span className="dashboard-location">
			<LocationOnOutlinedIcon aria-hidden="true" />
			<span>
				{t(online ? 'ONLINE' : program.programLocation)}
				{!online && program.programAddress?.trim() ? ` · ${program.programAddress.trim()}` : ''}
			</span>
		</span>
	);
}

function SpecialRequest({ reservation }: { reservation: TrainerReservation }) {
	const { t } = useTranslation('common');
	const request = reservation.specialRequest?.trim();
	return request ? (
		<p className="dashboard-request">
			<strong>{t('MyBookings.Special Request')}:</strong> {request}
		</p>
	) : null;
}

export function TrainerDashboardContent({ memberId }: { memberId: string }) {
	const { t } = useTranslation('common');
	const client = useApolloClient();
	const [next, setNext] = useState<{ loading: boolean; error: boolean; reservation: TrainerReservation | null }>({
		loading: true,
		error: false,
		reservation: null,
	});
	const mounted = useRef(true);
	const request = useRef(0);
	const pending = useQuery<{ getTrainerReservations: TrainerReservations }>(GET_TRAINER_RESERVATIONS, {
		variables: {
			input: {
				page: 1,
				limit: dashboardPreviewLimit,
				search: { period: ReservationPeriod.UPCOMING, reservationStatus: ReservationStatus.PENDING },
			},
		},
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: { handleErrorLocally: true },
	});
	const programs = useQuery<{ getTrainerPrograms: Programs }>(GET_TRAINER_PROGRAMS, {
		variables: { input: { page: 1, limit: dashboardPreviewLimit, sort: 'createdAt', direction: 'DESC', search: {} } },
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: { handleErrorLocally: true },
	});
	const schedule = useQuery<{ getMyTrainerSchedule: TrainerSchedule[] }>(GET_MY_TRAINER_SCHEDULE, {
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: { handleErrorLocally: true },
	});
	const loadNext = useCallback(async () => {
		const version = ++request.current;
		const active = () =>
			mounted.current &&
			request.current === version &&
			authReadyVar() &&
			!authErrorVar() &&
			userVar()._id === memberId &&
			userVar().memberType === 'TRAINER' &&
			userVar().memberStatus === 'ACTIVE';
		if (!active()) return;
		setNext((current) => ({ ...current, loading: true, error: false }));
		try {
			const reservation = await findNextTrainerSession(
				async (page) => {
					const response = await client.query<{ getTrainerReservations: TrainerReservations }>({
						query: GET_TRAINER_RESERVATIONS,
						variables: {
							input: {
								page,
								limit: dashboardSessionPageSize,
								search: { period: ReservationPeriod.UPCOMING, reservationStatus: ReservationStatus.CONFIRMED },
							},
						},
						fetchPolicy: 'no-cache',
						context: { handleErrorLocally: true },
					});
					return response.data.getTrainerReservations;
				},
				new Date(),
				active,
			);
			if (active()) setNext({ reservation, loading: false, error: false });
		} catch {
			if (active()) setNext({ reservation: null, loading: false, error: true });
		}
	}, [client, memberId]);
	const { refetch: refetchPending } = pending;
	const refreshReservations = useCallback(async () => {
		await Promise.all([refetchPending(), loadNext()]);
	}, [refetchPending, loadNext]);
	const actions = useTrainerReservationActions(memberId, refreshReservations, {
		loading: pending.loading,
		error: pending.error,
		handleErrorLocally: true,
	});
	useEffect(() => {
		mounted.current = true;
		void loadNext();
		return () => {
			mounted.current = false;
			request.current += 1;
		};
	}, [loadNext]);
	const reservation = next.reservation;
	const pendingResult = pending.data?.getTrainerReservations;
	const programResult = programs.data?.getTrainerPrograms;
	const week = schedule.data?.getMyTrainerSchedule;
	return (
		<div className="dashboard-grid">
			<div className="dashboard-primary">
				<section className="dashboard-next" aria-busy={next.loading}>
					<SectionHeading
						title="Next Session"
						href={`${reservationsUrl}&period=UPCOMING&status=CONFIRMED`}
						action="View in Reservations"
					>
						{reservation && !next.error && !next.loading && (
							<span className="dashboard-badge is-confirmed">{t('MyBookings.CONFIRMED')}</span>
						)}
					</SectionHeading>
					{next.loading || next.error || !reservation ? (
						<SectionState
							loading={next.loading}
							error={next.error}
							empty="No next session"
							retry={() => void loadNext()}
						/>
					) : (
						<article className="dashboard-next-card" data-reservation-id={reservation._id}>
							<div className="dashboard-session-image">
								<DashboardImage
									key={reservation._id}
									images={reservation.programData?.programImages ?? []}
									name={reservation.programData?.programName || t('MyBookings.Missing program')}
								/>
								<SessionLocation reservation={reservation} />
							</div>
							<div className="dashboard-next-content">
								<div className="dashboard-session-meta">
									{reservation.programData && (
										<span className="dashboard-program-type">
											{t(`Program discovery card.${reservation.programData.programType}`)}
										</span>
									)}
									<SessionTime reservation={reservation} />
								</div>
								<h3>{reservation.programData?.programName || t('MyBookings.Missing program')}</h3>
								<ClientIdentity reservation={reservation} />
								<SpecialRequest reservation={reservation} />
							</div>
						</article>
					)}
				</section>
				<section className="dashboard-pending" aria-busy={pending.loading}>
					<SectionHeading title="Pending Requests" href={pendingUrl} action="View all requests">
						{pendingResult && !pending.error && (
							<span className="dashboard-count">{reservationTotal(pendingResult)}</span>
						)}
					</SectionHeading>
					<TrainerReservationActionFeedback actions={actions} />
					{pending.error || !pendingResult || pending.loading ? (
						<SectionState
							loading={pending.loading}
							error={Boolean(pending.error || (!pending.loading && !pendingResult))}
							empty="No pending requests"
							retry={() => void pending.refetch().catch(() => {})}
						/>
					) : !pendingResult.list.length ? (
						<SectionState loading={false} error={false} empty="No pending requests" retry={() => {}} />
					) : (
						pendingResult.list.slice(0, dashboardPreviewLimit).map((row) => (
							<article className="dashboard-pending-card" key={row._id} data-reservation-id={row._id}>
								<div className="dashboard-pending-identity">
									<ClientIdentity reservation={row} />
									<span className="dashboard-badge is-pending">{t('MyBookings.PENDING')}</span>
								</div>
								<h3>{row.programData?.programName || t('MyBookings.Missing program')}</h3>
								<div className="dashboard-pending-context">
									<SessionTime reservation={row} />
									<SessionLocation reservation={row} />
									<SpecialRequest reservation={row} />
								</div>
								<div className="dashboard-pending-actions">
									{[ReservationStatus.CANCELLED, ReservationStatus.CONFIRMED]
										.filter((status) => trainerReservationActions(row, new Date(actions.now)).includes(status))
										.map((status) => (
											<Button
												key={status}
												variant={status === ReservationStatus.CONFIRMED ? 'contained' : 'outlined'}
												disabled={actions.busy || pending.loading}
												onClick={() => actions.onAction(row, status)}
											>
												{t(`Trainer reservations.${status === ReservationStatus.CONFIRMED ? 'Confirm' : 'Cancel'}`)}
											</Button>
										))}
								</div>
							</article>
						))
					)}
					<TrainerReservationActionDialog actions={actions} />
				</section>
			</div>
			<div className="dashboard-secondary">
				<section className="dashboard-programs" aria-busy={programs.loading}>
					<SectionHeading title="My Programs" href={programsUrl} action="Manage Programs" />
					{programs.error || !programResult || programs.loading ? (
						<SectionState
							loading={programs.loading}
							error={Boolean(programs.error || (!programs.loading && !programResult))}
							empty="No programs"
							retry={() => void programs.refetch().catch(() => {})}
						/>
					) : !programResult.list.length ? (
						<SectionState loading={false} error={false} empty="No programs" retry={() => {}} />
					) : (
						<div className="dashboard-program-list">
							{programResult.list.slice(0, dashboardPreviewLimit).map((program) => (
								<article
									className={`dashboard-program status-${program.programStatus.toLowerCase()}`}
									key={program._id}
								>
									<div className="dashboard-program-image">
										<DashboardImage images={program.programImages} name={program.programName} />
									</div>
									<div className="dashboard-program-info">
										<div className="dashboard-program-meta">
											<span className="dashboard-badge">{t(program.programStatus)}</span>
											<span>{t(`Program discovery card.${program.programType}`)}</span>
										</div>
										<h3>{program.programName}</h3>
										<p>
											{new Intl.NumberFormat('ko-KR', {
												style: 'currency',
												currency: 'KRW',
												maximumFractionDigits: 0,
											}).format(program.programPrice)}{' '}
											<span>{t('Trainer dashboard.Per session')}</span>
										</p>
									</div>
								</article>
							))}
						</div>
					)}
				</section>
				<section className="dashboard-schedule" aria-busy={schedule.loading}>
					<SectionHeading title="Weekly Schedule" href={scheduleUrl} action="Manage Schedule" />
					{schedule.error || !week || schedule.loading ? (
						<SectionState
							loading={schedule.loading}
							error={Boolean(schedule.error || (!schedule.loading && !week))}
							empty="No schedule"
							retry={() => void schedule.refetch().catch(() => {})}
						/>
					) : (
						<div className="dashboard-week">
							{!week.length && <p className="dashboard-schedule-empty">{t('Trainer dashboard.No schedule')}</p>}
							{dashboardWeek(week).map((day) => (
								<div className={`dashboard-weekday is-${day.state.toLowerCase()}`} key={day.dayOfWeek}>
									<strong>{t(`Trainer dashboard.${day.dayOfWeek}`)}</strong>
									<span>
										{day.state === 'Available' && day.startTime && day.endTime
											? `${day.startTime}–${day.endTime}`
											: t(`Trainer dashboard.${day.state}`)}
									</span>
									<span className="dashboard-weekday-state">{t(`Trainer dashboard.${day.state}`)}</span>
								</div>
							))}
							<p className="dashboard-timezone">
								{t('Trainer dashboard.Recurring availability')} · {t('Trainer schedule.Timezone')}
							</p>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

export default function TrainerDashboard() {
	const router = useRouter();
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const access = trainerReservationsAccess(ready && router.isReady, authError, user);
	return (
		<div className="trainer-dashboard-workspace">
			<TrainerWorkspaceHeader active="Dashboard" />
			<div id="trainer-dashboard-page">
				<header className="dashboard-page-heading">
					<div>
						{access === 'ready' && (
							<p className="dashboard-mobile-identity">
								{t('Trainer schedule.Workspace')} <span>· {user.memberFullName?.trim() || user.memberNick}</span>
							</p>
						)}
						<h1>{t('Trainer dashboard.Title')}</h1>
						<p className="dashboard-desktop-intro">{t('Trainer dashboard.Intro')}</p>
						<p className="dashboard-mobile-intro">{t('Trainer dashboard.Mobile intro')}</p>
					</div>
					{access === 'ready' && (
						<Link passHref className="dashboard-create" href="/mypage?category=addProgram">
							<AddRoundedIcon aria-hidden="true" />
							{t('Trainer dashboard.Create Program')}
						</Link>
					)}
				</header>
				{access === 'ready' ? (
					<TrainerDashboardContent key={user._id} memberId={user._id} />
				) : (
					<div className="dashboard-state" role={access === 'error' ? 'alert' : 'status'}>
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
				)}
			</div>
			<TrainerWorkspaceNavigation active="Dashboard" mobile />
		</div>
	);
}
