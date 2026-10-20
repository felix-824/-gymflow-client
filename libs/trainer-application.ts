import { ProgramCategory } from './enums/program.enum';
import { TrainerApplicationInput } from './types/trainer-application/trainer-application';

export const trainerApplicationRoute = '/mypage?category=trainerApplication';
export const trainerWorkspaceRoute = '/mypage?category=trainerDashboard';
export const trainerApplicationPollInterval = 30000;
export const trainerApplicationCategories = Object.values(ProgramCategory);
export type TrainerApplicationDraft = Omit<TrainerApplicationInput, 'previousApplicationId'>;
export type TrainerApplicationErrors = Partial<Record<keyof TrainerApplicationDraft, string>>;

export function trainerApplicationAccess(
	ready: boolean,
	error: string,
	user: { _id: string; memberType: string; memberStatus: string },
) {
	if (error) return 'error';
	if (!ready) return 'initializing';
	if (!user._id || user.memberStatus !== 'ACTIVE') return 'guest';
	return user.memberType === 'USER' || user.memberType === 'TRAINER' ? 'ready' : 'forbidden';
}

export function trainerApplicationErrors(input: TrainerApplicationDraft): TrainerApplicationErrors {
	const errors: TrainerApplicationErrors = {};
	if (input.fullName.trim().length < 3 || input.fullName.trim().length > 100) errors.fullName = 'Full name error';
	if (!input.experienceSummary.trim() || input.experienceSummary.trim().length > 1000)
		errors.experienceSummary = 'Experience error';
	if (!input.bio.trim() || input.bio.trim().length > 2000) errors.bio = 'Bio error';
	if (
		!input.categories.length ||
		new Set(input.categories).size !== input.categories.length ||
		input.categories.some((category) => !trainerApplicationCategories.includes(category))
	)
		errors.categories = 'Specialties error';
	return errors;
}

export function trainerApplicationPayload(
	input: TrainerApplicationDraft,
	previousApplicationId?: string,
): TrainerApplicationInput {
	return {
		fullName: input.fullName.trim(),
		categories: [...input.categories],
		experienceSummary: input.experienceSummary.trim(),
		bio: input.bio.trim(),
		...(previousApplicationId ? { previousApplicationId } : {}),
	};
}
