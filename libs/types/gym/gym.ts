import { GymAmenity, GymLocation, GymStatus } from '../../enums/gym.enum';
import { TrainerScheduleDayOfWeek } from '../../enums/trainer-schedule.enum';
import { TotalCounter } from '../program/program';

export interface GymOpeningHoursDay {
	dayOfWeek: TrainerScheduleDayOfWeek;
	isClosed: boolean;
	openTime: string | null;
	closeTime: string | null;
}

export interface Gym {
	_id: string;
	gymName: string;
	gymLocation: GymLocation;
	gymAddress: string;
	gymDesc: string | null;
	gymImages: string[];
	gymPhone: string | null;
	openingHours: GymOpeningHoursDay[] | null;
	amenities: GymAmenity[];
	createdAt: Date | string;
	updatedAt: Date | string;
}

export interface AdminGym extends Gym {
	gymStatus: GymStatus;
	gymRevision: number;
	deletedAt: Date | string | null;
}

export interface Gyms {
	list: Gym[];
	metaCounter: TotalCounter[];
}

export interface AdminGyms {
	list: AdminGym[];
	metaCounter: TotalCounter[];
}
