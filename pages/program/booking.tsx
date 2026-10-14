import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { Avatar, Button, CircularProgress, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import withLayoutBooking from '../../libs/components/layout/LayoutBooking';
import { GET_PROGRAM, GET_PROGRAM_AVAILABILITY } from '../../apollo/user/query';
import { CREATE_RESERVATION } from '../../apollo/user/mutation';
import { authReadyVar, authErrorVar, userVar } from '../../apollo/store';
import { getJwtToken, updateUserInfo } from '../../libs/auth';
import { Program } from '../../libs/types/program/program';
import { ProgramStatus } from '../../libs/enums/program.enum';
import { ReservationStatus } from '../../libs/enums/reservation.enum';
import { AvailableSlot, BookingSelection, ReservationReceipt } from '../../libs/types/reservation/reservation';
import { ProgramAvailabilityInquiry, ReservationInput } from '../../libs/types/reservation/reservation.input';
import { REACT_APP_API_URL } from '../../libs/config';
import { formatterStr } from '../../libs/utils';
import {
	addBookingDays,
	bookingErrorKind,
	bookingWindowDays,
	currentBookingSelection,
	formatBookingDate,
	isBookingProgram,
	isBrowsableBookingDate,
	reservationPayload,
	seoulToday,
} from '../../libs/booking';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const Booking: NextPage = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const programId = typeof router.query.id === 'string' ? router.query.id.toLowerCase() : '';
	const validId = /^[a-f\d]{24}$/i.test(programId);
	const isUser = Boolean(user._id && user.memberType === 'USER' && user.memberStatus === 'ACTIVE');
	const { data, loading, error, refetch } = useQuery<{ getProgram: Program }>(GET_PROGRAM, {
		variables: { input: programId },
		fetchPolicy: 'network-only',
		skip: !router.isReady || !validId || !authReady || Boolean(authError) || !isUser,
	});
	if (!router.isReady) return <BookingState title={t('Program detail.Loading title')} loading />;
	if (!validId) return <BookingState title={t('Program detail.Unavailable title')} />;
	if (!authReady) return <BookingState title={t('Booking.Initializing')} loading programId={programId} />;
	if (authError)
		return (
			<BookingState
				title={t('Booking.Auth error')}
				programId={programId}
				onRetry={() => updateUserInfo(getJwtToken())}
			/>
		);
	if (!user._id) return <BookingState title={t('Booking.Login required')} programId={programId} login />;
	if (!isUser) return <BookingState title={t('Booking.USER only')} programId={programId} />;
	if (loading) return <BookingState title={t('Program detail.Loading title')} loading programId={programId} />;
	if (error)
		return <BookingState title={t('Program detail.Error title')} programId={programId} onRetry={() => refetch()} />;
	const program = data?.getProgram;
	if (!program || program._id !== programId || program.programStatus !== ProgramStatus.ACTIVE)
		return <BookingState title={t('Program detail.Unavailable title')} programId={programId} />;
	if (!isBookingProgram(program.programType))
		return <BookingState title={t('Booking.Online unavailable')} programId={programId} />;
	return <BookingContent key={program._id} program={program} />;
};

const BookingContent = ({ program }: { program: Program }) => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const locale = router.locale ?? 'en';
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const [today, setToday] = useState('');
	const [date, setDate] = useState('');
	const [week, setWeek] = useState(0);
	const [selection, setSelection] = useState<BookingSelection | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [notice, setNotice] = useState<'conflict' | 'rejected' | 'unknown' | ''>('');
	const [receipt, setReceipt] = useState<ReservationReceipt | null>(null);
	const submitLock = useRef(false);
	const mounted = useRef(false);
	const successHeading = useRef<HTMLHeadingElement>(null);
	const [createReservation, { loading: creating }] = useMutation<
		{ createReservation: ReservationReceipt },
		{ input: ReservationInput }
	>(CREATE_RESERVATION);
	const availability = useQuery<{ getProgramAvailability: AvailableSlot[] }, { input: ProgramAvailabilityInquiry }>(
		GET_PROGRAM_AVAILABILITY,
		{
			variables: { input: { programId: program._id, reservationDate: date } },
			fetchPolicy: 'network-only',
			notifyOnNetworkStatusChange: true,
			skip: !date || !authReady || Boolean(authError) || user.memberType !== 'USER' || user.memberStatus !== 'ACTIVE',
		},
	);
	const slots = useMemo(() => availability.data?.getProgramAvailability ?? [], [availability.data]);
	const busy = submitting || creating;
	const frozen = busy || notice === 'unknown';
	const selected = currentBookingSelection(selection, program._id, date, slots) ? selection : null;
	const disabled =
		frozen ||
		!authReady ||
		Boolean(authError) ||
		user.memberType !== 'USER' ||
		user.memberStatus !== 'ACTIVE' ||
		availability.loading ||
		Boolean(availability.error) ||
		!selected ||
		!isBrowsableBookingDate(date, today);
	const trainerName = program.memberData?.memberFullName?.trim() || program.memberData?.memberNick?.trim();
	const location = t(program.programLocation);
	const fullDate = (value: string) =>
		formatBookingDate(value, locale, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
	const timeLabel = (value: string) =>
		new Intl.DateTimeFormat(locale === 'kr' ? 'ko-KR' : locale === 'ru' ? 'ru-RU' : 'en-US', {
			timeZone: 'Asia/Seoul',
			hour: '2-digit',
			minute: '2-digit',
			hour12: locale === 'en',
		}).format(new Date(date + 'T' + value + ':00+09:00'));
	const detailHref = { pathname: '/program/detail', query: { id: program._id } };

	/** LIFECYCLES **/
	useEffect(() => {
		mounted.current = true;
		const refreshCalendar = () => {
			if (submitLock.current) return;
			const current = seoulToday();
			setToday(current);
			setDate((previous) => (!previous || previous < current ? current : previous));
		};
		refreshCalendar();
		window.addEventListener('focus', refreshCalendar);
		return () => {
			mounted.current = false;
			window.removeEventListener('focus', refreshCalendar);
		};
	}, []);
	useEffect(() => {
		setSelection(null);
		setWeek(0);
	}, [today]);
	useEffect(() => {
		if (availability.loading) return;
		setSelection((previous) =>
			!availability.error && currentBookingSelection(previous, program._id, date, slots) ? previous : null,
		);
	}, [availability.loading, availability.error, slots, program._id, date]);
	useEffect(() => {
		if (receipt) successHeading.current?.focus();
	}, [receipt]);

	/** HANDLERS **/
	const dateHandler = (value: string) => {
		if (submitLock.current || frozen || !isBrowsableBookingDate(value, seoulToday())) return;
		setSelection(null);
		setNotice('');
		setDate(value);
	};
	const retryHandler = async () => {
		if (submitLock.current || frozen) return;
		setSelection(null);
		try {
			await availability.refetch();
		} catch {
			/* The query owns its inline error state. */
		}
	};
	const submitHandler = async () => {
		if (submitLock.current || disabled) return;
		const account = userVar();
		if (
			!authReadyVar() ||
			authErrorVar() ||
			!account._id ||
			account.memberType !== 'USER' ||
			account.memberStatus !== 'ACTIVE'
		)
			return;
		if (!isBrowsableBookingDate(date, seoulToday()) || !currentBookingSelection(selection, program._id, date, slots)) {
			setSelection(null);
			setNotice('conflict');
			return;
		}
		submitLock.current = true;
		setSubmitting(true);
		setNotice('');
		try {
			const result = await createReservation({ variables: { input: reservationPayload(selection) } });
			if (!mounted.current || userVar()._id !== account._id) return;
			const created = result.data?.createReservation;
			if (
				!created?._id ||
				created.programId !== program._id ||
				created.reservationDate !== date ||
				created.startTime !== selection.startTime ||
				created.endTime !== selection.endTime ||
				created.reservationStatus !== ReservationStatus.PENDING
			) {
				setNotice('unknown');
				return;
			}
			setReceipt(created);
		} catch (error) {
			if (!mounted.current || userVar()._id !== account._id) return;
			const kind = bookingErrorKind(error);
			setNotice(kind);
			setSelection(null);
			if (kind !== 'unknown') {
				try {
					await availability.refetch();
				} catch {
					/* Keep the authoritative query error and Retry. */
				}
			}
		} finally {
			submitLock.current = false;
			if (mounted.current) setSubmitting(false);
		}
	};
	const action = (mobile = false) => (
		<div className={mobile ? 'booking-mobile-action' : 'booking-submit'}>
			<div className="booking-price">
				<span>{mobile ? '' : t('Booking.Session fee')}</span>
				<strong>₩{formatterStr(program.programPrice)}</strong>
				{mobile && (
					<small>
						{selected
							? `${formatBookingDate(date, locale, { month: 'short', day: 'numeric' })} · ${timeLabel(
									selected.startTime,
							  )}`
							: t('Booking.Choose a slot')}
					</small>
				)}
			</div>
			<Button
				onClick={submitHandler}
				disabled={disabled}
				aria-busy={busy}
				className="booking-primary"
				endIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardRoundedIcon />}
			>
				{t(busy ? 'Booking.Submitting' : 'Booking.Book Session')}
			</Button>
			{!mobile && <p className="booking-request-note">{t('Booking.Request note')}</p>}
		</div>
	);

	return (
		<div id="program-booking-page">
			<div className="booking-breadcrumb-strip">
				<nav className="booking-container booking-breadcrumb" aria-label={t('Program detail.Breadcrumb')}>
					<Link href={detailHref} passHref>
						<ArrowBackRoundedIcon />
						{t('Booking.Back to Program')}
					</Link>
					<span className="booking-breadcrumb-path">
						/ <Link href="/program">{t('Programs')}</Link> / {program.programName} /
					</span>
					<span aria-current="page">{t('Booking.Book Session')}</span>
				</nav>
			</div>
			{receipt ? (
				<section className="booking-confirmation booking-container" aria-labelledby="booking-success-title">
					<CheckCircleOutlineRoundedIcon className="booking-success-icon" aria-hidden="true" />
					<h1 ref={successHeading} tabIndex={-1} id="booking-success-title">
						{t('Booking.Request received')}
					</h1>
					<p>{program.programName}</p>
					<dl>
						<div>
							<dt>{t('Booking.Date')}</dt>
							<dd>{fullDate(receipt.reservationDate)}</dd>
						</div>
						<div>
							<dt>{t('Booking.Time')}</dt>
							<dd>
								{receipt.startTime} – {receipt.endTime} · {t('Booking.Timezone')}
							</dd>
						</div>
						<div>
							<dt>{t('Booking.Status')}</dt>
							<dd>{t('Booking.Pending')}</dd>
						</div>
					</dl>
					<div className="booking-state-actions">
						<Link href={detailHref}>{t('Booking.Back to Program')}</Link>
						<Link href="/program">{t('Program detail.Browse programs')}</Link>
					</div>
				</section>
			) : (
				<div className="booking-container booking-workspace">
					<section className="booking-context" aria-labelledby="booking-title">
						<div className="booking-mobile-intro">
							<h1>{t('Booking.Book Session')}</h1>
							<p>{t('Booking.Intro')}</p>
						</div>
						<div className="booking-program-identity">
							<div className="booking-program-copy">
								<div className="booking-program-labels">
									<span>{t(`Program discovery card.${program.programCategory}`)}</span>
									<span>{t(`Program discovery card.${program.programType}`)}</span>
								</div>
								<h1 id="booking-title">{program.programName}</h1>
								{program.programDesc?.trim() && <p className="booking-description">{program.programDesc}</p>}
								<div className="booking-mobile-trainer">
									{trainerName && (
										<>
											<Avatar
												src={
													program.memberData?.memberImage
														? `${REACT_APP_API_URL}/${program.memberData.memberImage}`
														: undefined
												}
												alt=""
											>
												<PersonOutlineRoundedIcon />
											</Avatar>
											<span>{trainerName}</span>
											<span>·</span>
										</>
									)}
									<span>{location}</span>
								</div>
								<p className="booking-mobile-rate">
									<strong>₩{formatterStr(program.programPrice)}</strong> {t('Per session')}
								</p>
							</div>
							<div className="booking-photo">
								<BookingImage program={program} />
								<span className="booking-photo-location">
									<LocationOnOutlinedIcon />
									{location}
								</span>
								<span className="booking-photo-duration">
									{t('Session duration', { duration: program.programDuration })}
								</span>
							</div>
						</div>
						<dl className="booking-facts">
							<div>
								<dt>{t('Program detail.Duration')}</dt>
								<dd>{t('Session duration', { duration: program.programDuration })}</dd>
							</div>
							<div>
								<dt>{t('Program detail.Capacity')}</dt>
								<dd>{t('Session capacity', { capacity: program.programCapacity, count: program.programCapacity })}</dd>
							</div>
							<div>
								<dt>{t('Category')}</dt>
								<dd>{t(`Program discovery card.${program.programCategory}`)}</dd>
							</div>
							<div>
								<dt>{t('Booking.Session fee')}</dt>
								<dd className="booking-fact-price">₩{formatterStr(program.programPrice)}</dd>
							</div>
						</dl>
						<div className="booking-editorial-details">
							<div className="booking-address">
								<LocationOnOutlinedIcon />
								<div>
									<strong>{location}</strong>
									{program.programAddress?.trim() && <p>{program.programAddress}</p>}
								</div>
							</div>
							{program.memberData && trainerName && (
								<div className="booking-trainer">
									<Avatar
										src={
											program.memberData.memberImage
												? `${REACT_APP_API_URL}/${program.memberData.memberImage}`
												: undefined
										}
										alt=""
									>
										<PersonOutlineRoundedIcon />
									</Avatar>
									<div>
										<Link href={{ pathname: '/trainer/detail', query: { trainerId: program.memberId } }}>
											{trainerName}
										</Link>
										{program.memberData.memberAddress?.trim() && <p>{program.memberData.memberAddress}</p>}
										{program.memberData.memberDesc?.trim() && <p>{program.memberData.memberDesc}</p>}
									</div>
								</div>
							)}
						</div>
					</section>
					<aside className="booking-panel" aria-label={t('Booking.Select Date & Time')}>
						<div className="booking-panel-heading">
							<h2>{t('Booking.Select Date & Time')}</h2>
							{trainerName && (
								<p>
									{trainerName} · {location}
								</p>
							)}
						</div>
						<section className="booking-date-section" aria-labelledby="booking-date-title">
							<div className="booking-section-heading">
								<h2 id="booking-date-title">
									<CalendarTodayOutlinedIcon />
									{t('Booking.Select Date')}
								</h2>
								<div className="booking-week-controls">
									<span>
										{formatBookingDate(addBookingDays(today, week), locale, { month: 'long', year: 'numeric' })}
									</span>
									<button
										type="button"
										aria-label={t('Booking.Previous week')}
										disabled={week === 0 || frozen}
										onClick={() => setWeek((previous) => Math.max(0, previous - 7))}
									>
										<ChevronLeftRoundedIcon />
									</button>
									<button
										type="button"
										aria-label={t('Booking.Next week')}
										disabled={week >= bookingWindowDays - 7 || frozen}
										onClick={() => setWeek((previous) => Math.min(bookingWindowDays - 7, previous + 7))}
									>
										<ChevronRightRoundedIcon />
									</button>
								</div>
							</div>
							<div className="booking-date-strip" role="group" aria-labelledby="booking-date-title">
								{today &&
									Array.from({ length: 7 }, (_, index) => addBookingDays(today, week + index)).map((value) => (
										<button
											type="button"
											key={value}
											aria-pressed={value === date}
											aria-label={fullDate(value)}
											disabled={frozen || value < seoulToday()}
											onClick={() => dateHandler(value)}
										>
											<span>{formatBookingDate(value, locale, { weekday: 'short' })}</span>
											<strong>{formatBookingDate(value, locale, { day: 'numeric' })}</strong>
											<i aria-hidden="true" />
										</button>
									))}
							</div>
							<p className="booking-selected-date">{fullDate(date)}</p>
						</section>
						<section
							className="booking-slots-section"
							aria-labelledby="booking-slots-title"
							aria-busy={availability.loading}
						>
							<div className="booking-section-heading">
								<h2 id="booking-slots-title">
									<AccessTimeRoundedIcon />
									{t('Booking.Select Time Slot')}
								</h2>
								<span>{t('Booking.Timezone')}</span>
							</div>
							{!date || availability.loading ? (
								<p className="booking-slot-state" role="status">
									<CircularProgress size={18} />
									{t('Booking.Loading availability')}
								</p>
							) : availability.error ? (
								<div className="booking-slot-state" role="alert">
									<p>{t('Booking.Availability error')}</p>
									<Button onClick={retryHandler} disabled={frozen}>
										{t('Program detail.Retry')}
									</Button>
								</div>
							) : slots.length === 0 ? (
								<p className="booking-slot-state" role="status">
									{t('Booking.No slots available')}
								</p>
							) : (
								<div className="booking-slot-grid" role="group" aria-labelledby="booking-slots-title">
									{slots.map((slot) => (
										<button
											type="button"
											key={slot.startTime + slot.endTime}
											disabled={frozen}
											aria-pressed={selected?.startTime === slot.startTime && selected?.endTime === slot.endTime}
											aria-label={`${timeLabel(slot.startTime)} – ${timeLabel(slot.endTime)} · ${t(
												'Booking.Timezone',
											)}`}
											onClick={() => {
												if (!submitLock.current) {
													setSelection({ ...slot, programId: program._id, reservationDate: date });
													setNotice('');
												}
											}}
										>
											{timeLabel(slot.startTime)}
											{selected?.startTime === slot.startTime && <CheckRoundedIcon aria-hidden="true" />}
										</button>
									))}
								</div>
							)}
						</section>
						{notice && (
							<div className="booking-notice" role="alert">
								<p>
									{t(
										notice === 'unknown'
											? 'Booking.Network outcome unknown'
											: notice === 'conflict'
											? 'Booking.Slot changed'
											: 'Booking.Request rejected',
									)}
								</p>
								{notice === 'unknown' && <Link href={detailHref}>{t('Booking.Back to Program')}</Link>}
							</div>
						)}
						<section className="booking-summary" aria-label={t('Booking.Booking Summary')}>
							<h2>{t('Booking.Booking Summary')}</h2>
							<dl>
								<div>
									<dt>{t('Programs')}</dt>
									<dd>{program.programName}</dd>
								</div>
								{trainerName && (
									<div>
										<dt>{t('Program detail.Trainer')}</dt>
										<dd>{trainerName}</dd>
									</div>
								)}
								<div>
									<dt>{t('Booking.Date')}</dt>
									<dd>{fullDate(date)}</dd>
								</div>
								<div>
									<dt>{t('Booking.Time')}</dt>
									<dd className={selected ? 'is-selected' : ''}>
										{selected
											? `${timeLabel(selected.startTime)} – ${timeLabel(selected.endTime)}`
											: t('Booking.Choose a slot')}
									</dd>
								</div>
								<div>
									<dt>{t('Location')}</dt>
									<dd>{location}</dd>
								</div>
							</dl>
						</section>
						{action()}
					</aside>
					<div className="booking-mobile-details">
						<LocationOnOutlinedIcon />
						<div>
							<strong>{location}</strong>
							{program.programAddress?.trim() && <p>{program.programAddress}</p>}
							<p>
								{t(`Program discovery card.${program.programType}`)} ·{' '}
								{t('Session duration', { duration: program.programDuration })}
							</p>
							<p>{t('Session capacity', { capacity: program.programCapacity, count: program.programCapacity })}</p>
						</div>
					</div>
					{action(true)}
				</div>
			)}
		</div>
	);
};

const BookingImage = ({ program }: { program: Program }) => {
	const [failed, setFailed] = useState<string[]>([]);
	const image = program.programImages?.find((value) => value?.trim() && !failed.includes(value));
	return image ? (
		<img
			src={`${REACT_APP_API_URL}/${image}`}
			alt={program.programName}
			onError={() => setFailed((previous) => [...previous, image])}
		/>
	) : (
		<span className="booking-image-fallback" role="img" aria-label={program.programName}>
			<FitnessCenterOutlinedIcon aria-hidden="true" />
		</span>
	);
};

const BookingState = ({
	title,
	programId,
	loading,
	login,
	onRetry,
}: {
	title: string;
	programId?: string;
	loading?: boolean;
	login?: boolean;
	onRetry?: () => Promise<unknown>;
}) => {
	const { t } = useTranslation('common');
	const [retrying, setRetrying] = useState(false);
	return (
		<div id="program-booking-page" className="booking-state">
			<section role={loading ? 'status' : 'alert'}>
				{loading && <CircularProgress size={28} />}
				<Typography component="h1">{title}</Typography>
				{!loading && (
					<div className="booking-state-actions">
						{login && (
							<Link href={{ pathname: '/account/join', query: { referrer: '/program/booking?id=' + programId } }}>
								{t('Login')}
							</Link>
						)}
						{onRetry && (
							<Button
								disabled={retrying}
								onClick={async () => {
									setRetrying(true);
									try {
										await onRetry();
									} catch {
										/* Query/auth owns the visible error. */
									} finally {
										setRetrying(false);
									}
								}}
							>
								{t('Program detail.Retry')}
							</Button>
						)}
						<Link href={programId ? { pathname: '/program/detail', query: { id: programId } } : '/program'}>
							{t(programId ? 'Booking.Back to Program' : 'Program detail.Browse programs')}
						</Link>
					</div>
				)}
			</section>
		</div>
	);
};

export default withLayoutBooking(Booking);
