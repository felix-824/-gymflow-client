import { TrainerGymAccessStatus, TrainerGymRelationshipType } from './enums/trainer-gym-access.enum';
import {
	MyTrainerGymAccesses,
	TrainerGymAccess,
	TrainerGymAccessInput,
} from './types/trainer-gym-access/trainer-gym-access';

export const gymAccessRoute = '/mypage?category=gymAccess';
export const gymAccessLimit = 8;
export const gymAccessRelationships = Object.values(TrainerGymRelationshipType);
export interface GymAccessDraft {
	gymId: string;
	relationshipType: TrainerGymRelationshipType | '';
	requestNote: string;
}

// Presentation only; the server checks current role, Gym, pair and history on every write.
export function operationalGymAccess(access: TrainerGymAccess): boolean {
	return access.status === TrainerGymAccessStatus.PENDING || access.status === TrainerGymAccessStatus.APPROVED;
}

export function gymAccessErrors(draft: GymAccessDraft): Partial<Record<keyof GymAccessDraft, string>> {
	return {
		...(!/^[a-f\d]{24}$/i.test(draft.gymId) ? { gymId: 'Gym required' } : {}),
		...(!gymAccessRelationships.some((value) => value === draft.relationshipType)
			? { relationshipType: 'Relationship required' }
			: {}),
		...(draft.requestNote.trim().length < 10 || draft.requestNote.trim().length > 1000
			? { requestNote: 'Note validation' }
			: {}),
	};
}

export function gymAccessPayload(draft: GymAccessDraft, latest?: TrainerGymAccess): TrainerGymAccessInput {
	return {
		gymId: draft.gymId,
		relationshipType: draft.relationshipType as TrainerGymRelationshipType,
		requestNote: draft.requestNote.trim(),
		...(latest && !operationalGymAccess(latest) && latest.gymId === draft.gymId
			? { previousAccessId: latest._id }
			: {}),
	};
}

export function validGymAccessResult(result?: MyTrainerGymAccesses): result is MyTrainerGymAccesses {
	return Boolean(
		result &&
			Array.isArray(result.list) &&
			Number.isSafeInteger(result.metaCounter?.[0]?.total) &&
			result.metaCounter[0].total >= 0 &&
			result.list.every(
				(row) =>
					row._id &&
					row.gymId &&
					Object.values(TrainerGymAccessStatus).includes(row.status) &&
					gymAccessRelationships.includes(row.relationshipType),
			),
	);
}
