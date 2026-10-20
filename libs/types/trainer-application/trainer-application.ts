import { ProgramCategory } from '../../enums/program.enum';
import { TrainerApplicationStatus } from '../../enums/trainer-application.enum';

export interface TrainerApplicationInput {
	fullName: string;
	categories: ProgramCategory[];
	experienceSummary: string;
	bio: string;
	previousApplicationId?: string;
}

export interface TrainerApplication {
	_id: string;
	memberId: string;
	status: TrainerApplicationStatus;
	fullName: string;
	categories: ProgramCategory[];
	experienceSummary: string;
	bio: string;
	rejectionReason?: string | null;
	reviewedAt?: string | null;
	createdAt: string;
	updatedAt: string;
}
