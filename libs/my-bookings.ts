import { bookingTimezone, isBookingDate, seoulToday } from './booking';
import { ReservationPeriod } from './enums/reservation-query.enum';
import { ReservationStatus } from './enums/reservation.enum';
import { MyReservation, MyReservations } from './types/reservation/reservation';

export const myBookingsLimit = 6;

export function readMyBookingsQuery(query: { period?: unknown; page?: unknown }) {
	return {
		period: query.period === ReservationPeriod.HISTORY ? ReservationPeriod.HISTORY : ReservationPeriod.UPCOMING,
		page:
			typeof query.page === 'string' &&
			/^[1-9]\d*$/.test(query.page) &&
			Number.isSafeInteger(Number(query.page)) &&
			Number(query.page) <= 2147483647
				? Number(query.page)
				: 1,
	};
}

export function myBookingsAccess(
	ready: boolean,
	error: string,
	user: { _id: string; memberType: string; memberStatus: string },
) {
	if (error) return 'error';
	if (!ready) return 'initializing';
	if (!user._id || user.memberStatus !== 'ACTIVE') return 'guest';
	return user.memberType === 'USER' || user.memberType === 'TRAINER' ? 'ready' : 'forbidden';
}

export function seoulNow(now = new Date()) {
	const time = new Intl.DateTimeFormat('en-GB', {
		timeZone: bookingTimezone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).format(now);
	return { date: seoulToday(now), time };
}

export function canCancelReservation(reservation: MyReservation, now = new Date()) {
	if (![ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(reservation.reservationStatus)) return false;
	if (!isBookingDate(reservation.reservationDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reservation.startTime))
		return false;
	const current = seoulNow(now);
	return (
		reservation.reservationDate > current.date ||
		(reservation.reservationDate === current.date && reservation.startTime > current.time)
	);
}

export function reservationTotal(result?: MyReservations) {
	const total = result?.metaCounter?.[0]?.total;
	return typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? total : 0;
}

export function lastReservationPage(total: number, limit = myBookingsLimit) {
	return Math.max(1, Math.ceil(total / limit));
}

// The caller supplies the separate, globally ordered CONFIRMED query, never a paginated mixed list.
export function nextConfirmedReservation(result?: MyReservations) {
	return result?.list.find((item) => item.reservationStatus === ReservationStatus.CONFIRMED) ?? null;
}

export function secondaryReservations(list: MyReservation[], hero: MyReservation | null) {
	return hero ? list.filter((item) => item._id !== hero._id) : list;
}

export function cancellationErrorKind(error: any): 'unknown' | 'stale' | 'rejected' {
	if (error?.networkError || !error?.graphQLErrors?.length) return 'unknown';
	return error.graphQLErrors.some(
		(item: any) =>
			[404, 409].includes(item.extensions?.originalError?.statusCode) ||
			['CONFLICT', 'NOT_FOUND'].includes(item.extensions?.code),
	)
		? 'stale'
		: 'rejected';
}

// Reconcile a lost write response through owned reads. Absence alone never means cancellation succeeded.
export async function findReservation(
	id: string,
	read: (page: number) => Promise<MyReservations>,
): Promise<MyReservation | null> {
	let page = 1;
	while (true) {
		const result = await read(page);
		const found = result.list.find((item) => item._id === id);
		if (found) return found;
		if (!result.list.length || page * 100 >= reservationTotal(result)) return null;
		page += 1;
	}
}
