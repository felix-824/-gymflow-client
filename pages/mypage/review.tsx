import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApolloClient, useMutation, useReactiveVar } from '@apollo/client';
import { Button, Skeleton } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import { GET_MY_RESERVATIONS } from '../../apollo/user/query';
import { CREATE_REVIEW } from '../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../apollo/store';
import { getJwtToken, updateUserInfo } from '../../libs/auth';
import { formatBookingDate } from '../../libs/booking';
import { REACT_APP_API_URL } from '../../libs/config';
import { findReservation, myBookingsAccess, readMyBookingsQuery } from '../../libs/my-bookings';
import {
	reservationReviewState,
	reviewErrorKind,
	reviewInput,
	reviewReceiptMatches,
	validReview,
} from '../../libs/reviews';
import { MyReservation, MyReservations } from '../../libs/types/reservation/reservation';
import { Review } from '../../libs/types/review/review';
import { sweetTopSmallSuccessAlert } from '../../libs/sweetAlert';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

export function LeaveReviewForm({
	memberId,
	reservationId,
	returnUrl,
}: {
	memberId: string;
	reservationId: string;
	returnUrl: string;
}) {
	const router = useRouter();
	const { t } = useTranslation('common');
	const client = useApolloClient();
	const [reservation, setReservation] = useState<MyReservation | null>(null);
	const [loading, setLoading] = useState(true);
	const [rating, setRating] = useState(0);
	const [content, setContent] = useState('');
	const [feedback, setFeedback] = useState('');
	const [processing, setProcessing] = useState(false);
	const [uncertain, setUncertain] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [failedImage, setFailedImage] = useState('');
	const locked = useRef(false);
	const mounted = useRef(true);
	const active = () =>
		mounted.current &&
		authReadyVar() &&
		!authErrorVar() &&
		userVar()._id === memberId &&
		userVar().memberType === 'USER' &&
		userVar().memberStatus === 'ACTIVE';
	const [createReview, { loading: mutating }] = useMutation<{ createReview: Review }>(CREATE_REVIEW, {
		context: { handleErrorLocally: true },
	});
	const loadReservation = async () => {
		const result = await findReservation(reservationId, async (page) => {
			if (!active()) throw new Error('Account changed');
			const response = await client.query<{ getMyReservations: MyReservations }>({
				query: GET_MY_RESERVATIONS,
				context: { handleErrorLocally: true },
				variables: { input: { page, limit: 100, search: {} } },
				fetchPolicy: 'network-only',
			});
			return response.data.getMyReservations;
		});
		if (active()) setReservation(result);
		return result;
	};
	useEffect(() => {
		mounted.current = true;
		void loadReservation()
			.catch(() => {
				if (active()) setFeedback('Context error');
			})
			.finally(() => {
				if (active()) setLoading(false);
			});
		return () => {
			mounted.current = false;
		};
		// This component is keyed by account and reservation. It mounts only after auth restoration.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	const state = reservation ? reservationReviewState(reservation) : 'ineligible';
	const busy = processing || mutating;
	const eligible = state === 'eligible' && !!reservation?.programData && !!reservation?.trainerData && !submitted;
	const refresh = async () => {
		if (locked.current || !active()) return;
		locked.current = true;
		setProcessing(true);
		try {
			await loadReservation();
			if (active()) setFeedback(uncertain ? 'Unknown' : '');
		} catch {
			if (active()) setFeedback('Context error');
		} finally {
			if (active()) {
				locked.current = false;
				setProcessing(false);
			}
		}
	};
	const submitHandler = async (event: React.FormEvent) => {
		event.preventDefault();
		if (locked.current || busy || uncertain || !eligible || !active() || !validReview(rating, content)) return;
		const input = reviewInput(reservationId, rating, content);
		locked.current = true;
		setProcessing(true);
		setFeedback('');
		let confirmed = false;
		try {
			const response = await createReview({ variables: { input } });
			if (!active()) return;
			if (!reviewReceiptMatches(response.data?.createReview, input, reservation!.programId)) {
				setUncertain(true);
				setFeedback('Unknown');
				return;
			}
			confirmed = true;
			setSubmitted(true);
			await client
				.refetchQueries({
					include: 'active',
					onQueryUpdated: (query) =>
						['GetMyReservations', 'GetReviews'].includes(query.queryName || '') ? query.refetch() : false,
				})
				.catch(() => {});
			if (!active()) return;
			await sweetTopSmallSuccessAlert(t('Reviews.Success'), 1000);
			if (active())
				await router.push(returnUrl).catch(() => {
					if (active()) setFeedback('Return');
				});
		} catch (error) {
			if (!active()) return;
			if (confirmed) {
				setFeedback('Return');
				return;
			}
			const kind = reviewErrorKind(error);
			setFeedback(kind);
			if (kind === 'Unknown') setUncertain(true);
			if (['Already reviewed', 'Ineligible', 'Unavailable', 'Unauthorized'].includes(kind)) {
				setUncertain(true);
				await loadReservation().catch(() => {});
			}
		} finally {
			if (active()) {
				locked.current = false;
				setProcessing(false);
			}
		}
	};
	if (loading)
		return (
			<div className="leave-review-state" role="status">
				<p>{t('Reviews.Context loading')}</p>
				<Skeleton height={100} />
				<Skeleton height={220} />
			</div>
		);
	if (submitted || state === 'submitted')
		return (
			<div className="leave-review-state" role="status">
				<h2>{t('Reviews.Review submitted')}</h2>
				<Link href={returnUrl}>{t('Reviews.Back')}</Link>
			</div>
		);
	if (!eligible)
		return (
			<div className="leave-review-state" role="alert">
				<p>{t(`Reviews.${feedback || (reservation && state !== 'eligible' ? 'Ineligible' : 'Unavailable')}`)}</p>
				{feedback === 'Context error' && (
					<Button onClick={() => void refresh()} disabled={busy}>
						{t('MyBookings.Retry')}
					</Button>
				)}
				<Link href={returnUrl}>{t('Reviews.Back')}</Link>
			</div>
		);
	const program = reservation!.programData!;
	const trainer = reservation!.trainerData!;
	const image = program.programImages.find((value) => value?.trim());
	const imageSrc = image
		? /^https?:\/\//i.test(image)
			? image
			: `${REACT_APP_API_URL}/${image.replace(/^\//, '')}`
		: '';
	const labels = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'];
	return (
		<form className="leave-review-form" onSubmit={submitHandler} aria-busy={busy}>
			<div className="leave-review-context">
				<div className="leave-review-image">
					{imageSrc && failedImage !== imageSrc ? (
						<img src={imageSrc} alt={program.programName} onError={() => setFailedImage(imageSrc)} />
					) : (
						<FitnessCenterOutlinedIcon aria-hidden="true" />
					)}
				</div>
				<div>
					<p className="leave-review-session">
						{t('Reviews.Completed session')} ·{' '}
						<time dateTime={reservation!.reservationDate}>
							{formatBookingDate(reservation!.reservationDate, router.locale || 'en', {
								weekday: 'short',
								year: 'numeric',
								month: 'short',
								day: 'numeric',
							})}
						</time>{' '}
						· {reservation!.startTime}–{reservation!.endTime} · {t('Booking.Timezone')}
					</p>
					<h2>{program.programName}</h2>
					<p>
						{t(`Program discovery card.${program.programType}`)} ·{' '}
						{trainer.memberFullName?.trim() || trainer.memberNick}
					</p>
				</div>
			</div>
			<div className="leave-review-fields">
				<fieldset className="leave-review-rating" disabled={busy || uncertain}>
					<legend>{t('Reviews.Overall Rating')}</legend>
					<span className="leave-review-rating-label" aria-live="polite">
						{rating > 0 ? `${rating} — ${t(`Reviews.${labels[rating - 1]}`)}` : t('Reviews.Select rating')}
					</span>
					<div className="leave-review-stars">
						{[1, 2, 3, 4, 5].map((value) => (
							<label key={value}>
								<input
									type="radio"
									name="review-rating"
									value={value}
									checked={rating === value}
									onChange={() => setRating(value)}
									aria-label={t('Reviews.Stars', { count: value })}
								/>
								<span>{value <= rating ? <StarRoundedIcon /> : <StarBorderRoundedIcon />}</span>
							</label>
						))}
					</div>
				</fieldset>
				<div className="leave-review-experience">
					<label htmlFor="review-content">{t('Reviews.Share your experience')}</label>
					<div className="leave-review-text">
						<textarea
							id="review-content"
							value={content}
							onChange={(event) => setContent(event.target.value)}
							maxLength={100}
							rows={4}
							disabled={busy || uncertain}
							placeholder={t('Reviews.Placeholder')}
							aria-describedby="review-character-count"
						/>
						<p id="review-character-count">{content.length} / 100</p>
					</div>
				</div>
			</div>
			{feedback && (
				<div className="leave-review-feedback" role="alert">
					<p>{t(`Reviews.${feedback}`)}</p>
					{uncertain && (
						<Button type="button" disabled={busy} onClick={() => void refresh()}>
							{t('Reviews.Check status')}
						</Button>
					)}
				</div>
			)}
			<div className="leave-review-actions">
				<Button
					className="leave-review-submit"
					type="submit"
					variant="contained"
					disabled={busy || uncertain || !validReview(rating, content)}
				>
					{t(busy ? 'Reviews.Submitting' : 'Reviews.Submit Review')}
				</Button>
				<Link
					href={returnUrl}
					onClick={(event) => {
						if (locked.current) event.preventDefault();
					}}
					aria-disabled={busy}
				>
					{t('Reviews.Cancel')}
				</Link>
			</div>
		</form>
	);
}

export const LeaveReview = () => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const access = myBookingsAccess(ready && router.isReady, authError, user);
	const reservationId = typeof router.query.reservationId === 'string' ? router.query.reservationId : '';
	const page = readMyBookingsQuery(router.query).page;
	const returnUrl = `/mypage?category=myBookings&period=HISTORY&page=${page}`;
	return (
		<div id="leave-review-page">
			<nav className="leave-review-navigation" aria-label={t('MyBookings.Breadcrumb')}>
				<div className="leave-review-breadcrumb">
					<Link href="/mypage">{t('My Page')}</Link>
					<span>/</span>
					<Link href={returnUrl}>{t('MyBookings.Bookings')}</Link>
					<span>/</span>
					<span>{t('MyBookings.HISTORY')}</span>
					<span>/</span>
					<span aria-current="page">{t('Reviews.Leave Review')}</span>
				</div>
				<Link passHref href={returnUrl}>
					<ArrowBackRoundedIcon aria-hidden="true" />
					{t('Reviews.Back')}
				</Link>
			</nav>
			<header className="leave-review-heading">
				<span className="leave-review-kicker">{t('Reviews.Session Review')}</span>
				<h1>{t('Reviews.How was your session?')}</h1>
				<p>{t('Reviews.Intro')}</p>
			</header>
			{access === 'ready' ? (
				/^[a-f\d]{24}$/i.test(reservationId) ? (
					<LeaveReviewForm
						key={`${user._id}:${reservationId}`}
						memberId={user._id}
						reservationId={reservationId}
						returnUrl={returnUrl}
					/>
				) : (
					<div className="leave-review-state" role="alert">
						<p>{t('Reviews.Unavailable')}</p>
						<Link href={returnUrl}>{t('Reviews.Back')}</Link>
					</div>
				)
			) : (
				<div className="leave-review-state" role={access === 'error' ? 'alert' : 'status'}>
					<p>{t(`MyBookings.${access}`)}</p>
					{access === 'guest' && (
						<Link passHref href={{ pathname: '/account/join', query: { referrer: router.asPath } }}>
							{t('Login / Register')}
						</Link>
					)}
					{access === 'error' && (
						<Button onClick={() => void updateUserInfo(getJwtToken())}>{t('MyBookings.Retry')}</Button>
					)}
					{access === 'forbidden' && <Link href="/mypage">{t('My Page')}</Link>}
				</div>
			)}
		</div>
	);
};

export default withLayoutBasic(LeaveReview);
