import { TrainerGymAccessStatus as Status, TrainerGymRelationshipType } from './enums/trainer-gym-access.enum';
import {
	AdminTrainerGymAccess,
	AdminTrainerGymAccessInquiry,
	AdminTrainerGymAccessReview,
	AdminTrainerGymAccessRevoke,
	GymAccessDecision,
} from './types/trainer-gym-access/trainer-gym-access-admin';

export const adminGymAccessRoute = '/_admin/gym-access';
export const gymAccessId = (value: unknown): string =>
	typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : '';
export const gymAccessReasonValid = (value: string): boolean => value.trim().length >= 1 && value.trim().length <= 1000;

export function readAdminGymAccessInquiry(value: unknown): AdminTrainerGymAccessInquiry {
	const fallback = { page: 1, limit: 10, search: { status: Status.PENDING } };
	try {
		const input = typeof value === 'string' ? JSON.parse(value) : value;
		if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
		const status = Object.values(Status).includes(input.search?.status) ? (input.search.status as Status) : undefined;
		return {
			page: Number.isInteger(input.page) && input.page >= 1 && input.page <= 2147483647 ? input.page : 1,
			limit: [10, 20, 40, 60].includes(input.limit) ? input.limit : 10,
			search: {
				...(status ? { status } : {}),
				...(gymAccessId(input.search?.trainerId) ? { trainerId: gymAccessId(input.search.trainerId) } : {}),
				...(gymAccessId(input.search?.gymId) ? { gymId: gymAccessId(input.search.gymId) } : {}),
			},
		};
	} catch {
		return fallback;
	}
}

export function gymAccessReviewPayload(
	accessId: string,
	decision: AdminTrainerGymAccessReview['decision'],
	reason: string,
): AdminTrainerGymAccessReview {
	return { accessId, decision, ...(decision === Status.REJECTED ? { rejectionReason: reason.trim() } : {}) };
}
export function gymAccessRevokePayload(accessId: string, reason: string): AdminTrainerGymAccessRevoke {
	return { accessId, revocationReason: reason.trim() };
}
export function gymAccessModerationError(error: unknown): 'Conflict' | 'Eligibility' | 'Uncertain' | 'Mutation error' {
	const failure = error as {
		networkError?: unknown;
		graphQLErrors?: { message?: string; extensions?: { code?: string; originalError?: { statusCode?: number } } }[];
	};
	if (failure?.networkError || !failure?.graphQLErrors?.length) return 'Uncertain';
	if (
		failure.graphQLErrors.some(
			(item) =>
				item.extensions?.originalError?.statusCode === 409 ||
				/Access.*(?:already|changed|concurrent|inconsistent)|operational access|ACTIVE Gym/i.test(item.message ?? ''),
		)
	)
		return 'Conflict';
	if (failure.graphQLErrors.some((item) => /active TRAINER account.*approval/i.test(item.message ?? '')))
		return 'Eligibility';
	return 'Mutation error';
}
export function validAdminGymAccess(
	record: AdminTrainerGymAccess | undefined,
	id: string,
): record is AdminTrainerGymAccess {
	return Boolean(
		record &&
			record._id === id &&
			Object.values(Status).includes(record.status) &&
			Object.values(TrainerGymRelationshipType).includes(record.relationshipType) &&
			typeof record.requestNote === 'string',
	);
}
export function gymAccessActionAllowed(status: Status, decision: GymAccessDecision): boolean {
	return status === Status.PENDING
		? decision === Status.APPROVED || decision === Status.REJECTED
		: status === Status.APPROVED && decision === Status.REVOKED;
}
