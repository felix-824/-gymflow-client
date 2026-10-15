import { isBookingDate } from './booking';
import { seoulNow } from './my-bookings';
import { ReservationStatus } from './enums/reservation.enum';
import { trainerScheduleWeekdays } from './trainer-schedule';
import { TrainerReservation, TrainerReservations } from './types/reservation/trainer-reservation';
import { TrainerSchedule } from './types/trainer-schedule/trainer-schedule';

export const dashboardPreviewLimit = 3;
export const dashboardSessionPageSize = 100;

export function isFutureTrainerSession(reservation: TrainerReservation, now = new Date()) {
	const current = seoulNow(now);
	return (
		reservation.reservationStatus === ReservationStatus.CONFIRMED &&
		isBookingDate(reservation.reservationDate) &&
		/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reservation.startTime) &&
		(reservation.reservationDate > current.date ||
			(reservation.reservationDate === current.date && reservation.startTime > current.time))
	);
}

// UPCOMING includes in-progress rows. Keep the server's order and scan beyond them.
export async function findNextTrainerSession(
	read: (page: number) => Promise<TrainerReservations>,
	now = new Date(),
	active: () => boolean = () => true,
): Promise<TrainerReservation | null> {
	let page = 1;
	while (true) {
		if (!active()) throw new Error('Account changed');
		const result = await read(page);
		if (!active()) throw new Error('Account changed');
		const next = result.list.find((row) => isFutureTrainerSession(row, now));
		if (next) return next;
		if (!result.list.length || page * dashboardSessionPageSize >= (result.metaCounter?.[0]?.total ?? 0)) return null;
		page += 1;
	}
}

export function dashboardWeek(rows: TrainerSchedule[]) {
	return trainerScheduleWeekdays.map((dayOfWeek) => {
		const row = rows.find((entry) => entry.dayOfWeek === dayOfWeek);
		return {
			dayOfWeek,
			state: !row ? 'Unconfigured' : row.isAvailable ? 'Available' : 'Off',
			startTime: row?.isAvailable ? row.startTime : null,
			endTime: row?.isAvailable ? row.endTime : null,
		};
	});
}
