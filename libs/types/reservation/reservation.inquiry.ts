import { ReservationPeriod } from '../../enums/reservation-query.enum';
import { ReservationStatus } from '../../enums/reservation.enum';

export interface ReservationSearch {
	reservationStatus?: ReservationStatus;
	period?: ReservationPeriod;
}

export interface ReservationsInquiry {
	page: number;
	limit: number;
	search: ReservationSearch;
}
