import { ReservationStatus } from './enums/reservation.enum';
import { MyReservation } from './types/reservation/reservation';
import { Review, ReviewMemberSummary, Reviews } from './types/review/review';
import { ReviewInput } from './types/review/review.input';

export const reviewsLimit = 3;

export function reservationReviewState(reservation: Pick<MyReservation, 'reservationStatus' | 'reviewId'>) {
	if (reservation.reservationStatus !== ReservationStatus.COMPLETED) return 'ineligible';
	return reservation.reviewId == null ? 'eligible' : 'submitted';
}

export function validReview(rating: number, content: string) {
	return (
		Number.isInteger(rating) && rating >= 1 && rating <= 5 && content.trim().length >= 1 && content.trim().length <= 100
	);
}

export function reviewInput(reservationId: string, rating: number, content: string): ReviewInput {
	if (!/^[a-f\d]{24}$/i.test(reservationId) || !validReview(rating, content)) throw new Error('Invalid review');
	return { reservationId, rating, content: content.trim() };
}

export function reviewReceiptMatches(receipt: Review | null | undefined, input: ReviewInput, programId: string) {
	return Boolean(
		receipt &&
			/^[a-f\d]{24}$/i.test(receipt._id) &&
			receipt.programId === programId &&
			receipt.rating === input.rating &&
			receipt.content === input.content,
	);
}

export function reviewTotal(result?: Reviews) {
	const total = result?.metaCounter?.[0]?.total;
	return typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? total : 0;
}

export function reviewerName(member: ReviewMemberSummary | null | undefined, fallback: string) {
	return member?.memberFullName?.trim() || member?.memberNick?.trim() || fallback;
}

export function reviewDate(value: string, locale: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? ''
		: new Intl.DateTimeFormat(locale === 'kr' ? 'ko-KR' : locale, {
				timeZone: 'Asia/Seoul',
				year: 'numeric',
				month: 'short',
				day: 'numeric',
		  }).format(date);
}

export function reviewErrorKind(
	error: any,
): 'Unknown' | 'Already reviewed' | 'Ineligible' | 'Unavailable' | 'Unauthorized' | 'Invalid' | 'Submit error' {
	if (error?.networkError || !error?.graphQLErrors?.length) return 'Unknown';
	for (const item of error.graphQLErrors) {
		const status = item.extensions?.originalError?.statusCode;
		if ([401, 403].includes(status) || ['UNAUTHENTICATED', 'FORBIDDEN'].includes(item.extensions?.code))
			return 'Unauthorized';
		if (status === 404) return 'Unavailable';
		if (status === 400 || item.extensions?.code === 'BAD_USER_INPUT') return 'Invalid';
		if (status === 409) {
			if (/already has a review/i.test(item.message)) return 'Already reviewed';
			return /only completed/i.test(item.message) ? 'Ineligible' : 'Unavailable';
		}
		if (status >= 500 || item.extensions?.code === 'INTERNAL_SERVER_ERROR') return 'Unknown';
	}
	return 'Submit error';
}
