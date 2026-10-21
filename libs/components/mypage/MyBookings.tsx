import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApolloClient, useMutation, useQuery, useReactiveVar } from '@apollo/client';
import {
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
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { useTranslation } from 'next-i18next';
import { GET_MY_RESERVATIONS } from '../../../apollo/user/query';
import { CANCEL_RESERVATION } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getJwtToken, updateUserInfo } from '../../auth';
import { formatBookingDate } from '../../booking';
import { REACT_APP_API_URL } from '../../config';
import { ProgramLocation, ProgramType } from '../../enums/program.enum';
import { ReservationPeriod } from '../../enums/reservation-query.enum';
import { ReservationStatus } from '../../enums/reservation.enum';
import {
	canCancelReservation,
	cancellationErrorKind,
	findReservation,
	lastReservationPage,
	myBookingsAccess,
	myBookingsLimit,
	nextConfirmedReservation,
	readMyBookingsQuery,
	reservationTotal,
	secondaryReservations,
} from '../../my-bookings';
import { MyReservation, MyReservations } from '../../types/reservation/reservation';
import { ReservationsInquiry } from '../../types/reservation/reservation.inquiry';
import { reservationReviewState } from '../../reviews';

interface ReservationQuery {
	getMyReservations: MyReservations;
}

function BookingHeading({ children }: { children?: ReactNode }) {
	const { t } = useTranslation('common');
	return (
		<header className="my-bookings-heading">
			<div>
				<h1>{t('MyBookings.Title')}</h1>
				<p>{t('MyBookings.Intro')}</p>
			</div>
			{children}
		</header>
	);
}

function ReservationImage({ images, name }: { images: string[]; name: string }) {
	const [failed, setFailed] = useState<string[]>([]);
	const image = images.find((value) => value?.trim() && !failed.includes(value));
	return image ? (
		<img
			src={/^https?:\/\//i.test(image) ? image : `${REACT_APP_API_URL}/${image.replace(/^\//, '')}`}
			alt={name}
			onError={() => setFailed((previous) => [...previous, image])}
		/>
	) : (
		<span className="my-bookings-image-fallback" role="img" aria-label={name}>
			<FitnessCenterOutlinedIcon />
		</span>
	);
}

function ReservationCard({
	reservation,
	hero,
	cancelDisabled,
	now,
	onCancel,
}: {
	reservation: MyReservation;
	hero?: boolean;
	cancelDisabled: boolean;
	now: number;
	onCancel: (reservation: MyReservation) => void;
}) {
	const { t } = useTranslation('common');
	const { locale = 'en', query } = useRouter();
	const { programData: program, trainerData: trainer } = reservation;
	const name = program?.programName || t('MyBookings.Missing program') || '';
	const trainerName = trainer?.memberFullName || trainer?.memberNick || t('MyBookings.Missing trainer');
	const online = program?.programType === ProgramType.ONLINE || program?.programLocation === ProgramLocation.ONLINE;
	const location = program ? t(online ? 'ONLINE' : program.programLocation) : '';
	const address = !online ? program?.programAddress?.trim() : '';
	const specialRequest = reservation.specialRequest?.trim();
	const date = formatBookingDate(reservation.reservationDate, locale, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
	const history = readMyBookingsQuery(query).period === ReservationPeriod.HISTORY;
	return (
		<article className={`my-bookings-card${hero ? ' is-hero' : ''}`} data-reservation-id={reservation._id}>
			<div className="my-bookings-media">
				<ReservationImage images={program?.programImages ?? []} name={name} />
			</div>
			<div className="my-bookings-info">
				<div className="my-bookings-card-meta">
					<span className={`my-bookings-status status-${reservation.reservationStatus.toLowerCase()}`}>
						{t(`MyBookings.${reservation.reservationStatus}`)}
					</span>
					<p className="my-bookings-date">
						<time dateTime={reservation.reservationDate}>{date}</time>
						<span>
							{reservation.startTime}–{reservation.endTime} · {t('Booking.Timezone')}
						</span>
					</p>
				</div>
				<h2>
					{program ? (
						<Link href={{ pathname: '/program/detail', query: { id: reservation.programId } }}>{name}</Link>
					) : (
						name
					)}
				</h2>
				<div className="my-bookings-location">
					{location && (
						<>
							<LocationOnOutlinedIcon aria-hidden="true" />
							<p>
								{location}
								{address && <span>{address}</span>}
							</p>
						</>
					)}
				</div>
				<div className="my-bookings-trainer">
					<img
						src={
							trainer?.memberImage
								? /^https?:\/\//i.test(trainer.memberImage)
									? trainer.memberImage
									: `${REACT_APP_API_URL}/${trainer.memberImage.replace(/^\//, '')}`
								: '/img/profile/defaultUser.svg'
						}
						alt=""
						onError={(event) => {
							if (!event.currentTarget.src.endsWith('/img/profile/defaultUser.svg')) {
								event.currentTarget.src = '/img/profile/defaultUser.svg';
							}
						}}
					/>
					{trainer ? (
						<Link href={{ pathname: '/trainer/detail', query: { trainerId: reservation.trainerId } }}>
							{trainerName}
						</Link>
					) : (
						<span>{trainerName}</span>
					)}
				</div>
				{specialRequest && (
					<div className="my-bookings-request">
						<strong>{t('MyBookings.Special Request')}</strong>
						<p>{specialRequest}</p>
					</div>
				)}
				{!history && reservation.reservationStatus === ReservationStatus.PENDING && (
					<p className="my-bookings-awaiting">{t('MyBookings.Awaiting trainer confirmation')}</p>
				)}
				{!history && canCancelReservation(reservation, new Date(now)) && (
					<div className="my-bookings-card-actions">
						<Button variant="outlined" disabled={cancelDisabled} onClick={() => onCancel(reservation)}>
							{t(
								reservation.reservationStatus === ReservationStatus.PENDING
									? 'MyBookings.Cancel Request'
									: 'MyBookings.Cancel Reservation',
							)}
						</Button>
					</div>
				)}
				{reservationReviewState(reservation) !== 'ineligible' && (
					<div className="my-bookings-review">
						{reservationReviewState(reservation) === 'submitted' ? <span>{t('Reviews.Review submitted')}</span> : <Link href={{ pathname: '/mypage/review', query: { reservationId: reservation._id, page: readMyBookingsQuery(query).page } }}>{t('Reviews.Leave Review')}</Link>}
					</div>
				)}
			</div>
		</article>
	);
}

function MyBookingsContent({ memberId }: { memberId: string }) {
	const router = useRouter();
	const { t } = useTranslation('common');
	const client = useApolloClient();
	const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const { period, page } = readMyBookingsQuery(router.query);
	const upcoming = period === ReservationPeriod.UPCOMING;
	const showHero = upcoming && page === 1;
	const input: ReservationsInquiry = useMemo(
		() => ({ page, limit: myBookingsLimit, search: { period } }),
		[page, period],
	);
	const [selected, setSelected] = useState<MyReservation | null>(null);
	const [feedback, setFeedback] = useState('');
	const [uncertain, setUncertain] = useState('');
	const [reconciling, setReconciling] = useState(false);
	const [processing, setProcessing] = useState(false);
	const [now, setNow] = useState(Date.now);
	const cancelLock = useRef(false);
	const writeLock = useRef(false);
	const mounted = useRef(true);
	const activeAccount = () =>
		mounted.current &&
		userVar()._id === memberId &&
		myBookingsAccess(authReadyVar(), authErrorVar(), userVar()) === 'ready';

	/** APOLLO REQUESTS **/
	const listQuery = useQuery<ReservationQuery>(GET_MY_RESERVATIONS, {
		variables: { input },
		fetchPolicy: 'network-only',
		notifyOnNetworkStatusChange: true,
	});
	const countQuery = useQuery<ReservationQuery>(GET_MY_RESERVATIONS, {
		variables: {
			input: {
				page: 1,
				limit: 1,
				search: { period: upcoming ? ReservationPeriod.HISTORY : ReservationPeriod.UPCOMING },
			},
		},
		fetchPolicy: 'network-only',
		notifyOnNetworkStatusChange: true,
	});
	const heroQuery = useQuery<ReservationQuery>(GET_MY_RESERVATIONS, {
		variables: {
			input: {
				page: 1,
				limit: 1,
				search: { period: ReservationPeriod.UPCOMING, reservationStatus: ReservationStatus.CONFIRMED },
			},
		},
		skip: !upcoming,
		fetchPolicy: 'network-only',
		notifyOnNetworkStatusChange: true,
	});
	const [cancelReservation, { loading: cancelling }] = useMutation(CANCEL_RESERVATION);
	const { refetch: refetchList } = listQuery;
	const { refetch: refetchCount } = countQuery;
	const { refetch: refetchHero } = heroQuery;
	const refresh = useCallback(async () => {
		await Promise.all([refetchList(), refetchCount(), ...(upcoming ? [refetchHero()] : [])]);
	}, [refetchList, refetchCount, refetchHero, upcoming]);
	const result = listQuery.data?.getMyReservations;
	const total = reservationTotal(result);
	const hero = showHero ? nextConfirmedReservation(heroQuery.data?.getMyReservations) : null;
	const list = secondaryReservations(result?.list ?? [], hero);
	const initialLoading = !result && !listQuery.error;
	const busy = cancelling || processing || selected !== null || reconciling;

	/** LIFECYCLES **/
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		const onFocus = () => {
			setNow(Date.now());
			void refresh().catch(() => {
				if (mounted.current) setFeedback('Refresh error');
			});
		};
		window.addEventListener('focus', onFocus);
		return () => window.removeEventListener('focus', onFocus);
	}, [refresh]);
	useEffect(() => {
		if (!result || listQuery.loading || listQuery.error || page <= lastReservationPage(total)) return;
		void router.replace(
			{
				pathname: '/mypage',
				query: { ...router.query, category: 'myBookings', period, page: lastReservationPage(total) },
			},
			undefined,
			{ shallow: true, scroll: false },
		);
	}, [result, total, page, period, listQuery.loading, listQuery.error, router]);

	/** HANDLERS **/
	const navigate = async (nextPeriod: ReservationPeriod, nextPage: number) => {
		if (cancelLock.current || writeLock.current || reconciling || uncertain) return;
		setFeedback('');
		await router.push(
			{ pathname: '/mypage', query: { ...router.query, category: 'myBookings', period: nextPeriod, page: nextPage } },
			undefined,
			{ shallow: true, scroll: false },
		);
	};
	const closeDialog = () => {
		if (writeLock.current) return;
		cancelLock.current = false;
		setSelected(null);
	};
	const openDialog = (reservation: MyReservation) => {
		if (cancelLock.current || writeLock.current || uncertain || !activeAccount()) return;
		setNow(Date.now());
		if (!canCancelReservation(reservation)) {
			setFeedback('Stale');
			void refresh().catch(() => setFeedback('Refresh error'));
			return;
		}
		cancelLock.current = true;
		setSelected(reservation);
	};
	const reconcile = async (id: string) => {
		if (!activeAccount()) return;
		setReconciling(true);
		try {
			const reservation = await findReservation(id, async (readPage) => {
				if (!activeAccount()) throw new Error('Account changed');
				const response = await client.query<ReservationQuery>({
					query: GET_MY_RESERVATIONS,
					variables: { input: { page: readPage, limit: 100, search: {} } },
					fetchPolicy: 'network-only',
				});
				return response.data.getMyReservations;
			});
			if (!activeAccount()) return;
			if (reservation) {
				setUncertain('');
				setFeedback(reservation.reservationStatus === ReservationStatus.CANCELLED ? 'Cancel success' : 'Reconciled');
			}
			await refresh();
		} catch {
			if (activeAccount()) setFeedback('Unknown');
		} finally {
			if (activeAccount()) setReconciling(false);
		}
	};
	const confirmCancellation = async () => {
		if (!selected || writeLock.current || !cancelLock.current || !activeAccount()) return;
		const reservation = selected;
		// Synchronous guard: React's mutation loading state may not update between two clicks.
		cancelLock.current = false;
		if (!canCancelReservation(reservation)) {
			setSelected(null);
			setNow(Date.now());
			setFeedback('Stale');
			await refresh().catch(() => {
				if (activeAccount()) setFeedback('Refresh error');
			});
			return;
		}
		writeLock.current = true;
		setProcessing(true);
		let succeeded = false;
		try {
			const response = await cancelReservation({ variables: { input: reservation._id } });
			if (!activeAccount()) return;
			const receipt = response.data?.cancelReservation;
			if (receipt?._id !== reservation._id || receipt.reservationStatus !== ReservationStatus.CANCELLED) {
				setUncertain(reservation._id);
				setFeedback('Unknown');
				await reconcile(reservation._id);
				return;
			}
			succeeded = true;
			setFeedback('Cancel success');
			await refresh();
		} catch (error) {
			if (!activeAccount()) return;
			if (succeeded) {
				setFeedback('Cancel refresh error');
				return;
			}
			const kind = cancellationErrorKind(error);
			if (kind === 'unknown') {
				setUncertain(reservation._id);
				setFeedback('Unknown');
				await reconcile(reservation._id);
			} else {
				setFeedback(kind === 'stale' ? 'Stale' : 'Cancel rejected');
				await refresh().catch(() => {
					if (activeAccount()) setFeedback('Refresh error');
				});
			}
		} finally {
			if (activeAccount()) {
				writeLock.current = false;
				cancelLock.current = false;
				setProcessing(false);
				setSelected(null);
				setNow(Date.now());
			}
		}
	};
	const retry = async () => {
		if (uncertain) {
			await reconcile(uncertain);
			return;
		}
		setFeedback('');
		await refresh().catch(() => {
			if (activeAccount()) setFeedback('Refresh error');
		});
	};
	return (
		<>
			<BookingHeading>
				<nav className="my-bookings-tabs" aria-label={t('MyBookings.Period')}>
					{[ReservationPeriod.UPCOMING, ReservationPeriod.HISTORY].map((value) => {
						const data = value === period ? result : countQuery.data?.getMyReservations;
						return (
							<button
								key={value}
								type="button"
								aria-current={value === period ? 'page' : undefined}
								disabled={busy || Boolean(uncertain)}
								onClick={() => void navigate(value, 1)}
							>
								{t(`MyBookings.${value}`)}
								{data && <span>{reservationTotal(data)}</span>}
							</button>
						);
					})}
				</nav>
			</BookingHeading>
			{feedback && (
				<div className="my-bookings-feedback" role="status">
					<p>{t(`MyBookings.${feedback}`)}</p>
					<Button disabled={busy} onClick={() => void retry()}>
						{t('MyBookings.Retry')}
					</Button>
				</div>
			)}
			{(countQuery.error || (showHero && heroQuery.error)) && (
				<div className="my-bookings-feedback" role="alert">
					<p>{t('MyBookings.Summary error')}</p>
					<Button onClick={() => void retry()} disabled={busy}>
						{t('MyBookings.Retry')}
					</Button>
				</div>
			)}
			<div className="my-bookings-update" role="status">
				{result && (listQuery.loading || countQuery.loading || (showHero && heroQuery.loading))
					? t('MyBookings.Updating')
					: ''}
			</div>
			<section aria-label={t(`MyBookings.${period}`)} aria-busy={listQuery.loading}>
				{initialLoading ? (
					<div className="my-bookings-loading" role="status">
						<p>{t('MyBookings.Loading')}</p>
						<Skeleton variant="rounded" height={280} />
						<Skeleton variant="rounded" height={140} />
					</div>
				) : (
					<>
						{listQuery.error && (
							<div className="my-bookings-state" role="alert">
								<h2>{t('MyBookings.Load error')}</h2>
								<Button onClick={() => void retry()}>{t('MyBookings.Retry')}</Button>
							</div>
						)}
						{!listQuery.error && !result?.list.length && !hero && !(showHero && heroQuery.loading) && (
							<div className="my-bookings-state">
								<FitnessCenterOutlinedIcon aria-hidden="true" />
								<h2>{t(upcoming ? 'MyBookings.No upcoming' : 'MyBookings.No history')}</h2>
								<Link href="/program">{t('MyBookings.Explore Programs')}</Link>
							</div>
						)}
						{hero && (
							<div className="my-bookings-next">
								<h2 className="my-bookings-section-label">
									<span className="desktop-label">{t('MyBookings.Up Next')}</span>
									<span className="mobile-label">{t('MyBookings.Next Session')}</span>
								</h2>
								<ReservationCard
									reservation={hero}
									hero
									cancelDisabled={busy || Boolean(uncertain)}
									now={now}
									onCancel={openDialog}
								/>
							</div>
						)}
						<div className="my-bookings-list">
							{list.map((reservation) => (
								<div key={reservation._id}>
									{upcoming && (
										<h2 className="my-bookings-section-label">
											{t(
												reservation.reservationStatus === ReservationStatus.PENDING
													? 'MyBookings.Awaiting Confirmation'
													: 'MyBookings.Upcoming reservation',
											)}
										</h2>
									)}
									<ReservationCard
										reservation={reservation}
										cancelDisabled={busy || Boolean(uncertain)}
										now={now}
										onCancel={openDialog}
									/>
								</div>
							))}
						</div>
						{total > myBookingsLimit && (
							<nav className="my-bookings-pagination" aria-label={t('MyBookings.Pagination')}>
								<Pagination
									count={lastReservationPage(total)}
									page={Math.min(page, lastReservationPage(total))}
									disabled={busy || Boolean(uncertain)}
									siblingCount={0}
									boundaryCount={1}
									onChange={(_, value) => void navigate(period, value)}
									getItemAriaLabel={(type, value, selectedPage) =>
										type === 'page'
											? t(selectedPage ? 'MyBookings.Current page' : 'MyBookings.Go to page', { page: value })
											: t(`MyBookings.${type}`)
									}
								/>
							</nav>
						)}
					</>
				)}
			</section>
			<Dialog
				open={selected !== null}
				onClose={closeDialog}
				transitionDuration={reducedMotion ? 0 : undefined}
				maxWidth="xs"
				fullWidth
				aria-labelledby="my-bookings-cancel-title"
				aria-describedby="my-bookings-cancel-description"
			>
				<DialogTitle id="my-bookings-cancel-title">{t('MyBookings.Confirm title')}</DialogTitle>
				<DialogContent>
					<DialogContentText id="my-bookings-cancel-description">
						{t('MyBookings.Confirm description', {
							program: selected?.programData?.programName || t('MyBookings.Missing program'),
						})}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={closeDialog} disabled={processing} autoFocus>
						{t('MyBookings.Keep')}
					</Button>
					<Button onClick={() => void confirmCancellation()} disabled={processing} variant="contained">
						{t(processing ? 'MyBookings.Cancelling' : 'MyBookings.Confirm cancel')}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}

const MyBookings = () => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const access = myBookingsAccess(authReady && router.isReady, authError, user);
	const returnUrl = router.asPath.startsWith('/mypage?') ? router.asPath : '/mypage?category=myBookings';
	return (
		<div id="my-bookings-page">
			<nav className="my-bookings-breadcrumb" aria-label={t('MyBookings.Breadcrumb')}>
				<Link href="/mypage">{t('My Page')}</Link>
				<span aria-hidden="true">/</span>
				<span>{t('MyBookings.Bookings')}</span>
			</nav>
			{access === 'ready' ? (
				<MyBookingsContent key={user._id} memberId={user._id} />
			) : (
				<>
					<BookingHeading />
					<div className="my-bookings-state" role={access === 'error' ? 'alert' : 'status'}>
						<p>{t(`MyBookings.${access}`)}</p>
						{access === 'error' && (
							<Button onClick={() => void updateUserInfo(getJwtToken())}>{t('MyBookings.Retry')}</Button>
						)}
						{access === 'guest' && (
							<Link href={{ pathname: '/account/join', query: { referrer: returnUrl } }}>{t('Login / Register')}</Link>
						)}
						{access === 'forbidden' && <Link href="/mypage">{t('My Page')}</Link>}
					</div>
				</>
			)}
		</div>
	);
};

export default MyBookings;
