import { GymAmenity, GymLocation, GymStatus } from './enums/gym.enum';
import { TrainerScheduleDayOfWeek } from './enums/trainer-schedule.enum';
import { AdminGym, GymOpeningHoursDay } from './types/gym/gym';
import { GymInput, GymOpeningHoursDayInput } from './types/gym/gym.input';

export const gymStatusLabelKeys: Record<GymStatus, string> = {
	ACTIVE: 'lifecycle.active',
	PAUSED: 'lifecycle.paused',
	DELETE: 'lifecycle.deleted',
};

export function gymAmenityLabelKey(amenity: GymAmenity): string {
	return `amenities.${amenity}`;
}

export function normalizeGymOptionalText(value: string | null | undefined): string | null {
	return value?.trim() || null;
}

export function gymImagesError(images: readonly string[]): string | null {
	if (!Array.isArray(images) || images.length < 1) return 'photos.minimum';
	if (images.length > 5) return 'photos.maximum';
	if (new Set(images).size !== images.length) return 'photos.duplicate';
	const path = /^uploads\/gym\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|png|webp)$/;
	if (Array.from(images).some((image) => typeof image !== 'string' || !path.test(image))) return 'photos.invalidPath';
	return null;
}

export function normalizeGymAmenities(values: readonly GymAmenity[] = []): GymAmenity[] {
	if (!Array.isArray(values) || Array.from(values).some((value) => !Object.values(GymAmenity).includes(value)))
		throw new Error('validation.amenities');
	return Array.from(new Set(values));
}

export function gymOpeningHoursDayError(day: GymOpeningHoursDayInput): string | null {
	if (day.isClosed) return null;
	if (!day.openTime || !day.closeTime) return 'hours.requiredTimes';
	const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
	if (
		typeof day.openTime !== 'string' ||
		typeof day.closeTime !== 'string' ||
		!time.test(day.openTime) ||
		!time.test(day.closeTime)
	)
		return 'hours.timeFormat';
	return day.openTime >= day.closeTime ? 'hours.timeOrder' : null;
}

export function gymOpeningHoursError(hours: GymInput['openingHours']): string | null {
	if (hours == null) return null;
	const weekdays = Object.values(TrainerScheduleDayOfWeek);
	if (!Array.isArray(hours) || hours.length !== weekdays.length) return 'hours.sevenDays';
	const seen = new Set<TrainerScheduleDayOfWeek>();
	for (const day of hours) {
		if (
			!day ||
			typeof day !== 'object' ||
			Array.isArray(day) ||
			Object.keys(day).some((key) => !['dayOfWeek', 'isClosed', 'openTime', 'closeTime'].includes(key)) ||
			!weekdays.includes(day.dayOfWeek) ||
			seen.has(day.dayOfWeek) ||
			typeof day.isClosed !== 'boolean'
		)
			return 'hours.sevenDays';
		seen.add(day.dayOfWeek);
		// A closed row may retain local draft times; serialization below clears them.
		const error = gymOpeningHoursDayError(day);
		if (error) return error;
	}
	return null;
}

export function normalizeGymOpeningHours(hours: GymInput['openingHours']): GymOpeningHoursDay[] | null {
	const error = gymOpeningHoursError(hours);
	if (error) throw new Error(error);
	if (hours == null) return null;
	return Object.values(TrainerScheduleDayOfWeek).map((dayOfWeek) => {
		const day = hours.find((entry) => entry.dayOfWeek === dayOfWeek)!;
		return {
			dayOfWeek,
			isClosed: day.isClosed,
			openTime: day.isClosed ? null : day.openTime!,
			closeTime: day.isClosed ? null : day.closeTime!,
		};
	});
}

// Called only when the future UI enables hours. Blank times require an explicit choice;
// the separate null value continues to mean that hours have not been supplied.
export function createGymOpeningHoursForm(hours: readonly GymOpeningHoursDayInput[] | null): GymOpeningHoursDayInput[] {
	return Object.values(TrainerScheduleDayOfWeek).map((dayOfWeek) => {
		const day = hours?.find((entry) => entry.dayOfWeek === dayOfWeek);
		return {
			dayOfWeek,
			isClosed: day?.isClosed ?? false,
			openTime: day?.openTime ?? '',
			closeTime: day?.closeTime ?? '',
		};
	});
}

export function gymBasicErrors(
	input: GymInput,
): Partial<Record<'gymName' | 'gymLocation' | 'gymAddress' | 'gymDesc' | 'gymPhone', string>> {
	const errors: ReturnType<typeof gymBasicErrors> = {};
	if (typeof input.gymName !== 'string' || input.gymName.trim().length < 3 || input.gymName.trim().length > 100)
		errors.gymName = 'validation.name';
	if (!Object.values(GymLocation).includes(input.gymLocation)) errors.gymLocation = 'validation.location';
	if (
		typeof input.gymAddress !== 'string' ||
		input.gymAddress.trim().length < 3 ||
		input.gymAddress.trim().length > 100
	)
		errors.gymAddress = 'validation.address';
	if (input.gymDesc != null && typeof input.gymDesc !== 'string') errors.gymDesc = 'validation.description';
	else {
		const description = normalizeGymOptionalText(input.gymDesc);
		if (description !== null && (description.length < 5 || description.length > 2000))
			errors.gymDesc = 'validation.description';
	}
	if (input.gymPhone != null && typeof input.gymPhone !== 'string') errors.gymPhone = 'validation.phone';
	else {
		const phone = normalizeGymOptionalText(input.gymPhone);
		if (phone !== null && (phone.length > 25 || !/^(?=(?:\D*\d){7,15}\D*$)\+?[0-9 ()-]+$/.test(phone)))
			errors.gymPhone = 'validation.phone';
	}
	return errors;
}

export function gymFormError(input: GymInput): string | null {
	const basic = gymBasicErrors(input);
	const basicError = basic.gymName ?? basic.gymLocation ?? basic.gymAddress ?? basic.gymDesc ?? basic.gymPhone;
	if (basicError) return basicError;
	if (
		input.amenities !== undefined &&
		(!Array.isArray(input.amenities) ||
			Array.from(input.amenities).some((value) => !Object.values(GymAmenity).includes(value)))
	)
		return 'validation.amenities';
	return gymImagesError(input.gymImages) ?? gymOpeningHoursError(input.openingHours);
}

export interface GymEditorDraft extends Omit<GymInput, 'gymLocation'> {
	gymLocation: GymLocation | '';
	gymStatus: GymStatus;
	amenities: GymAmenity[];
	openingHours: GymOpeningHoursDayInput[] | null;
}

export function gymEditorId(value: unknown): string {
	return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : '';
}

export function gymEditorDraft(gym?: AdminGym): GymEditorDraft {
	return {
		gymName: gym?.gymName ?? '',
		gymLocation: gym?.gymLocation ?? '',
		gymAddress: gym?.gymAddress ?? '',
		gymDesc: gym?.gymDesc ?? null,
		gymPhone: gym?.gymPhone ?? null,
		gymImages: [...(gym?.gymImages ?? [])],
		amenities: [...(gym?.amenities ?? [])],
		openingHours:
			gym?.openingHours?.map((day) => ({
				dayOfWeek: day.dayOfWeek,
				isClosed: day.isClosed,
				openTime: day.openTime,
				closeTime: day.closeTime,
			})) ?? null,
		gymStatus: gym?.gymStatus ?? GymStatus.PAUSED,
	};
}

// Dirty comparison also works for incomplete drafts; image order is meaningful, amenity order is not.
export function gymEditorKey(draft: GymEditorDraft): string {
	return JSON.stringify({
		gymName: draft.gymName.trim(),
		gymLocation: draft.gymLocation,
		gymAddress: draft.gymAddress.trim(),
		gymDesc: normalizeGymOptionalText(draft.gymDesc),
		gymPhone: normalizeGymOptionalText(draft.gymPhone),
		gymImages: draft.gymImages,
		amenities: Array.from(new Set(draft.amenities)).sort(),
		gymStatus: draft.gymStatus,
		openingHours:
			draft.openingHours === null
				? null
				: [...draft.openingHours]
						.sort(
							(left, right) =>
								Object.values(TrainerScheduleDayOfWeek).indexOf(left.dayOfWeek) -
								Object.values(TrainerScheduleDayOfWeek).indexOf(right.dayOfWeek),
						)
						.map((day) => ({
							dayOfWeek: day.dayOfWeek,
							isClosed: day.isClosed,
							openTime: day.isClosed ? null : day.openTime ?? '',
							closeTime: day.isClosed ? null : day.closeTime ?? '',
						})),
	});
}

export function gymEditorReceipt(gym: AdminGym | null | undefined): gym is AdminGym {
	if (
		!gym ||
		!gymEditorId(gym._id) ||
		!Object.values(GymStatus).includes(gym.gymStatus) ||
		!Number.isInteger(gym.gymRevision) ||
		gym.gymRevision < 0 ||
		gym.gymRevision > 2147483647
	)
		return false;
	try {
		return !gymFormError(gymEditorDraft(gym) as GymInput);
	} catch {
		return false;
	}
}

// Whitelist a complete form's editable fields. Omitted optionals remain omitted so that
// callers can preserve them on update; explicit blank description/phone clears to null.
export function gymPayload(input: GymInput): GymInput {
	const error = gymFormError(input);
	if (error) throw new Error(error);
	return {
		gymName: input.gymName.trim(),
		gymLocation: input.gymLocation,
		gymAddress: input.gymAddress.trim(),
		gymImages: [...input.gymImages],
		...(input.gymDesc !== undefined ? { gymDesc: normalizeGymOptionalText(input.gymDesc) } : {}),
		...(input.gymPhone !== undefined ? { gymPhone: normalizeGymOptionalText(input.gymPhone) } : {}),
		...(input.openingHours !== undefined ? { openingHours: normalizeGymOpeningHours(input.openingHours) } : {}),
		...(input.amenities !== undefined ? { amenities: normalizeGymAmenities(input.amenities) } : {}),
	};
}

export type GymUpdateError = 'stale' | 'contention' | 'referenced-venue' | 'rejected' | 'unknown';

// Temporary compatibility with the actual formatter: it strips Gym-specific reasons
// and HTTP status details. Never infer a Gym conflict from a generic code or retry it.
export function gymUpdateError(error: unknown): GymUpdateError {
	const failure = error as { networkError?: unknown; graphQLErrors?: { message?: string }[] } | null;
	const errors = failure?.graphQLErrors;
	if (failure?.networkError || !Array.isArray(errors) || !errors.length) return 'unknown';
	for (const item of errors) {
		if (item?.message === 'Gym has changed. Refresh and review the latest data.') return 'stale';
		if (item?.message === 'Gym is busy. Review the latest data before saving again.') return 'contention';
		if (item?.message === 'Gym location and address cannot change while any Program references it')
			return 'referenced-venue';
	}
	return 'rejected';
}
