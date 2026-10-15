import { ReservationStatus } from '../../enums/reservation.enum';
import { ProgramLocation, ProgramType } from '../../enums/program.enum';

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

export interface ReservationProgramSummary {
	_id: string;
	programName: string;
	programImages: string[];
	programType: ProgramType;
	programLocation: ProgramLocation;
	programAddress?: string | null;
}

export interface ReservationTrainerSummary {
	_id: string;
	memberFullName?: string | null;
	memberNick: string;
	memberImage: string;
}

export interface MyReservation extends ReservationReceipt {
	specialRequest?: string | null;
	memberId: string;
	trainerId: string;
	createdAt: string;
	updatedAt: string;
	programData?: ReservationProgramSummary | null;
	trainerData?: ReservationTrainerSummary | null;
}

export interface MyReservations {
	list: MyReservation[];
	metaCounter?: { total?: number | null }[] | null;
}
