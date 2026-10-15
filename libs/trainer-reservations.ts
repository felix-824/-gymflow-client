import { isBookingDate } from './booking';
import { ReservationPeriod } from './enums/reservation-query.enum';
import { ReservationStatus } from './enums/reservation.enum';
import { readMyBookingsQuery, seoulNow } from './my-bookings';
import { TrainerReservation, TrainerReservations } from './types/reservation/trainer-reservation';

export const trainerReservationsLimit = 6;

export function readTrainerReservationsQuery(query: { period?: unknown; page?: unknown; status?: unknown }) {
	const period = readMyBookingsQuery(query).period;
	const status = Object.values(ReservationStatus).find((value) => value === query.status);
	return {
		...readMyBookingsQuery(query),
		status:
			period === ReservationPeriod.UPCOMING &&
			status &&
			![ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(status)
				? undefined
				: status,
	};
}

export function trainerReservationsAccess(
	ready: boolean,
	error: string,
	user: { _id: string; memberType: string; memberStatus: string },
) {
	if (error) return 'error';
	if (!ready) return 'initializing';
	if (!user._id || user.memberStatus !== 'ACTIVE') return 'guest';
	return user.memberType === 'TRAINER' ? 'ready' : 'forbidden';
}

// Presentation gating only. Period membership, sorting and every write remain server-owned.
export function trainerReservationActions(reservation: TrainerReservation, now = new Date()): ReservationStatus[] {
	if (
		!isBookingDate(reservation.reservationDate) ||
		![reservation.startTime, reservation.endTime].every((value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
		reservation.startTime >= reservation.endTime
	)
		return [];
	const current = seoulNow(now);
	const beforeStart =
		reservation.reservationDate > current.date ||
		(reservation.reservationDate === current.date && reservation.startTime > current.time);
	const ended =
		reservation.reservationDate < current.date ||
		(reservation.reservationDate === current.date && reservation.endTime <= current.time);
	if (reservation.reservationStatus === ReservationStatus.PENDING && beforeStart)
		return [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED];
	if (reservation.reservationStatus === ReservationStatus.CONFIRMED) {
		if (beforeStart) return [ReservationStatus.CANCELLED];
		if (ended) return [ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW];
	}
	return [];
}

// No trainer single-reservation query exists. An absent record is never evidence of write success.
export async function findTrainerReservation(id: string, read: (page: number) => Promise<TrainerReservations>) {
	let page = 1;
	while (true) {
		const result = await read(page);
		const found = result.list.find((reservation) => reservation._id === id);
		if (found) return found;
		if (!result.list.length || page * 100 >= (result.metaCounter?.[0]?.total ?? 0)) return null;
		page += 1;
	}
}
