import { ReservationStatus } from '../../enums/reservation.enum';

export interface AvailableSlot {
	startTime: string;
	endTime: string;
}

export interface BookingSelection extends AvailableSlot {
	programId: string;
	reservationDate: string;
}

export interface ReservationReceipt extends BookingSelection {
	_id: string;
	reservationStatus: ReservationStatus;
}
