import { TrainerApplicationStatus } from './enums/trainer-application.enum';
import { TrainerApplicationReview } from './types/trainer-application/trainer-application-admin';

export const adminTrainerApplicationsRoute = '/_admin/trainer-applications';

export function adminTrainerApplicationsAccess(
	ready: boolean,
	error: string,
	user: { _id: string; memberType: string; memberStatus: string },
) {
	if (!ready) return 'initializing';
	if (error) return 'Access error';
	return user._id && user.memberType === 'ADMIN' && user.memberStatus === 'ACTIVE' ? 'ready' : 'Access denied';
}

export function trainerApplicationId(value: unknown): string {
	return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : '';
}

export function trainerReviewFeedbackValid(value: string): boolean {
	return value.trim().length >= 1 && value.trim().length <= 1000;
}

export function trainerReviewPayload(
	applicationId: string,
	decision: TrainerApplicationReview['decision'],
	feedback: string,
): TrainerApplicationReview {
	return {
		applicationId,
		decision,
		...(decision === TrainerApplicationStatus.REJECTED ? { rejectionReason: feedback.trim() } : {}),
	};
}

export function trainerReviewConflict(error: unknown): boolean {
	const failure = error as {
		graphQLErrors?: { message?: string; extensions?: { originalError?: { statusCode?: number } } }[];
	};
	return Boolean(
		failure?.graphQLErrors?.some(
			(item) =>
				item.extensions?.originalError?.statusCode === 409 ||
				/application.*(?:already|changed|concurrent|inconsistent)/i.test(item.message ?? ''),
		),
	);
}

export function trainerApplicantInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	return [parts[0]?.[0], parts.length > 1 ? parts[parts.length - 1][0] : ''].join('').toLocaleUpperCase();
}
