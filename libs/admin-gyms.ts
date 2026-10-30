import { GymAmenity, GymLocation, GymStatus } from './enums/gym.enum';
import { TrainerScheduleDayOfWeek } from './enums/trainer-schedule.enum';
import { GymOpeningHoursDay } from './types/gym/gym';
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
		if (day.isClosed) continue;
		if (!day.openTime || !day.closeTime) return 'hours.requiredTimes';
		const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
		if (
			typeof day.openTime !== 'string' ||
			typeof day.closeTime !== 'string' ||
			!time.test(day.openTime) ||
			!time.test(day.closeTime)
		)
			return 'hours.timeFormat';
		if (day.openTime >= day.closeTime) return 'hours.timeOrder';
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
export function createGymOpeningHoursForm(hours: GymOpeningHoursDay[] | null): GymOpeningHoursDayInput[] {
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

export function gymFormError(input: GymInput): string | null {
	if (typeof input.gymName !== 'string' || input.gymName.trim().length < 3 || input.gymName.trim().length > 100)
		return 'validation.name';
	if (!Object.values(GymLocation).includes(input.gymLocation)) return 'validation.location';
	if (
		typeof input.gymAddress !== 'string' ||
		input.gymAddress.trim().length < 3 ||
		input.gymAddress.trim().length > 100
	)
		return 'validation.address';
	if (input.gymDesc != null && typeof input.gymDesc !== 'string') return 'validation.description';
	if (input.gymPhone != null && typeof input.gymPhone !== 'string') return 'validation.phone';
	const description = normalizeGymOptionalText(input.gymDesc);
	if (description !== null && (description.length < 5 || description.length > 2000)) return 'validation.description';
	const phone = normalizeGymOptionalText(input.gymPhone);
	if (phone !== null && (phone.length > 25 || !/^(?=(?:\D*\d){7,15}\D*$)\+?[0-9 ()-]+$/.test(phone)))
		return 'validation.phone';
	if (
		input.amenities !== undefined &&
		(!Array.isArray(input.amenities) ||
			Array.from(input.amenities).some((value) => !Object.values(GymAmenity).includes(value)))
	)
		return 'validation.amenities';
	return gymImagesError(input.gymImages) ?? gymOpeningHoursError(input.openingHours);
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
