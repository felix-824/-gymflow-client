export interface ProgramAvailabilityInquiry {
	programId: string;
	reservationDate: string;
}

export interface ReservationInput extends ProgramAvailabilityInquiry {
	startTime: string;
}
