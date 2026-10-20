import { TrainerApplicationStatus } from '../../enums/trainer-application.enum';
import { TrainerApplication } from './trainer-application';

export type TrainerApplicationListItem = Pick<
	TrainerApplication,
	'_id' | 'fullName' | 'categories' | 'status' | 'createdAt'
>;
export type TrainerApplicationReviewDetail = Pick<
	TrainerApplication,
	'_id' | 'fullName' | 'categories' | 'status' | 'experienceSummary' | 'bio' | 'rejectionReason'
>;

export interface TrainerApplicationsInquiry {
	page: number;
	limit: number;
	search: { status: TrainerApplicationStatus };
}

export interface TrainerApplications {
	list: TrainerApplicationListItem[];
	metaCounter?: { total: number }[] | null;
}

export interface TrainerApplicationReview {
	applicationId: string;
	decision: TrainerApplicationStatus.APPROVED | TrainerApplicationStatus.REJECTED;
	rejectionReason?: string;
}
