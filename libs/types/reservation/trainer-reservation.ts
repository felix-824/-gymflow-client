import { ReservationPeriod } from '../../enums/reservation-query.enum';
import { ReservationStatus } from '../../enums/reservation.enum';
import { MyReservation } from './reservation';

export interface ReservationMemberSummary {
	_id: string;
	memberNick: string;
	memberFullName?: string | null;
	memberImage: string;
}

export interface TrainerReservation extends Omit<MyReservation, 'trainerData'> {
	memberData?: ReservationMemberSummary | null;
}

export interface TrainerReservations {
	list: TrainerReservation[];
	metaCounter?: { total?: number | null }[] | null;
}

export interface TrainerReservationsInquiry {
	page: number;
	limit: number;
	search: {
		programId?: string;
		reservationStatus?: ReservationStatus;
		period?: ReservationPeriod;
	};
}

export interface TrainerReservationUpdate {
	_id: string;
	reservationStatus: ReservationStatus;
}
