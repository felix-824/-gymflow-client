import { TrainerScheduleDayOfWeek } from '../../enums/trainer-schedule.enum';

export interface TrainerSchedule {
	_id: string;
	memberId: string;
	dayOfWeek: TrainerScheduleDayOfWeek;
	isAvailable: boolean;
	startTime: string | null;
	endTime: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TrainerScheduleDayInput {
	dayOfWeek: TrainerScheduleDayOfWeek;
	isAvailable: boolean;
	startTime?: string | null;
	endTime?: string | null;
}

export interface TrainerScheduleInput {
	days: TrainerScheduleDayInput[];
}

export interface TrainerScheduleFormDay {
	dayOfWeek: TrainerScheduleDayOfWeek;
	isAvailable: boolean;
	startTime: string;
	endTime: string;
}
