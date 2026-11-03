import { TrainerGymAccessStatus, TrainerGymRelationshipType } from '../../enums/trainer-gym-access.enum';
import { TotalCounter } from '../program/program';

export interface TrainerGymAccess {
	_id: string;
	gymId: string;
	status: TrainerGymAccessStatus;
	relationshipType: TrainerGymRelationshipType;
	requestNote: string;
	rejectionReason: string | null;
	revocationReason: string | null;
	reviewedAt: string | null;
	revokedAt: string | null;
	createdAt: string;
	gymData: { _id: string; gymName: string } | null;
}

export interface MyTrainerGymAccesses {
	list: TrainerGymAccess[];
	metaCounter: TotalCounter[];
}

export interface MyTrainerGymAccessesInquiry {
	page: number;
	limit: number;
	search: { gymId?: string };
}

export interface TrainerGymAccessInput {
	gymId: string;
	relationshipType: TrainerGymRelationshipType;
	requestNote: string;
	previousAccessId?: string;
}
