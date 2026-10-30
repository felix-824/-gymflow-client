import { GymStatus } from '../../enums/gym.enum';
import { GymInput } from './gym.input';

export interface GymUpdate extends Partial<GymInput> {
	_id: string;
	expectedRevision: number;
	gymStatus?: GymStatus;
}
