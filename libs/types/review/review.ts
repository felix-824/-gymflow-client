export interface ReviewMemberSummary {
	_id: string;
	memberNick: string;
	memberFullName?: string | null;
	memberImage: string;
}

export interface Review {
	_id: string;
	rating: number;
	content: string;
	programId: string;
	createdAt: string;
	memberData?: ReviewMemberSummary | null;
}

export interface Reviews {
	list: Review[];
	metaCounter?: { total?: number | null }[] | null;
	averageRating: number | null;
}
