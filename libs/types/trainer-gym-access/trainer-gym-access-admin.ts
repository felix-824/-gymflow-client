import { TrainerGymAccessStatus, TrainerGymRelationshipType } from '../../enums/trainer-gym-access.enum';
import { MemberStatus, MemberType } from '../../enums/member.enum';
import { GymLocation, GymStatus } from '../../enums/gym.enum';
import { TotalCounter } from '../program/program';

export interface AdminTrainerGymAccessRow {
	_id: string;
	status: TrainerGymAccessStatus;
	relationshipType: TrainerGymRelationshipType;
	createdAt: string;
	reviewedAt: string | null;
	revokedAt: string | null;
	trainerData: {
		_id: string;
		memberNick: string;
		memberFullName: string | null;
		memberImage: string;
		memberType: MemberType;
		memberStatus: MemberStatus;
	} | null;
	gymData: {
		_id: string;
		gymName: string;
		gymStatus: GymStatus;
		gymLocation: GymLocation;
		gymAddress: string;
		gymImage: string | null;
	} | null;
}
export interface AdminTrainerGymAccess extends AdminTrainerGymAccessRow {
	requestNote: string;
	rejectionReason: string | null;
	revocationReason: string | null;
}
export interface AdminTrainerGymAccesses {
	list: AdminTrainerGymAccessRow[];
	metaCounter: TotalCounter[];
}
export interface AdminTrainerGymAccessInquiry {
	page: number;
	limit: number;
	search: { status?: TrainerGymAccessStatus; trainerId?: string; gymId?: string };
}
export type GymAccessDecision =
	| TrainerGymAccessStatus.APPROVED
	| TrainerGymAccessStatus.REJECTED
	| TrainerGymAccessStatus.REVOKED;
export interface AdminTrainerGymAccessReview {
	accessId: string;
	decision: TrainerGymAccessStatus.APPROVED | TrainerGymAccessStatus.REJECTED;
	rejectionReason?: string;
}
export interface AdminTrainerGymAccessRevoke {
	accessId: string;
	revocationReason: string;
}
