export interface ReviewInput {
	reservationId: string;
	rating: number;
	content: string;
}

export interface ReviewsInquiry {
	page: number;
	limit: number;
	search: { programId: string };
}
