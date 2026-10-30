import { Direction } from '../../enums/common.enum';
import { GymAmenity, GymLocation, GymStatus } from '../../enums/gym.enum';
import { TrainerScheduleDayOfWeek } from '../../enums/trainer-schedule.enum';

export interface GymOpeningHoursDayInput {
	dayOfWeek: TrainerScheduleDayOfWeek;
	isClosed: boolean;
	openTime?: string | null;
	closeTime?: string | null;
}

export interface GymInput {
	gymName: string;
	gymLocation: GymLocation;
	gymAddress: string;
	gymImages: string[];
	gymDesc?: string | null;
	gymPhone?: string | null;
	openingHours?: GymOpeningHoursDayInput[] | null;
	amenities?: GymAmenity[];
}

export interface GymSearch {
	text?: string;
	locationList?: GymLocation[];
	amenities?: GymAmenity[];
}

export interface AdminGymSearch extends GymSearch {
	gymStatus?: GymStatus;
}

export interface AllGymsInquiry {
	page: number;
	limit: number;
	sort?: 'createdAt' | 'updatedAt';
	direction?: Direction;
	search: AdminGymSearch;
}
