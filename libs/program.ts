import { ProgramCategory, ProgramLocation, ProgramStatus, ProgramType } from './enums/program.enum';
import { Direction } from './enums/common.enum';
import { ProgramInput, ProgramsInquiry, TrainerProgramsInquiry } from './types/program/program.input';
import { TrainersInquiry } from './types/member/member.input';
import { Program, Programs } from './types/program/program';
import { ReservationPeriod } from './enums/reservation-query.enum';
import { ReservationStatus } from './enums/reservation.enum';
import {
	TrainerReservation,
	TrainerReservations,
	TrainerReservationsInquiry,
} from './types/reservation/trainer-reservation';
import { seoulNow } from './my-bookings';
import { isBookingDate } from './booking';

export interface ProgramCreateEnvelope {
	ownerId: string;
	createRequestId: string;
	payload: ProgramInput;
	status: 'unresolved' | 'confirmed';
	programId?: string;
}

export function readProgramCreateEnvelope(ownerId: string): ProgramCreateEnvelope | null {
	const value = window.sessionStorage.getItem('gymflow:program-create:' + ownerId);
	if (!value) return null;
	const stored = JSON.parse(value) as ProgramCreateEnvelope;
	if (
		stored.ownerId !== ownerId || !/^[a-f\d]{24}$/i.test(ownerId) ||
		!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(stored.createRequestId) ||
		!['unresolved', 'confirmed'].includes(stored.status) || programFormError(stored.payload) ||
		(stored.status === 'confirmed' && !/^[a-f\d]{24}$/i.test(stored.programId ?? ''))
	)
		throw new Error('Invalid saved Program submission');
	return {
		ownerId, createRequestId: stored.createRequestId, payload: programPayload(stored.payload),
		status: stored.status, ...(stored.status === 'confirmed' ? { programId: stored.programId } : {}),
	};
}

export function storeProgramCreateEnvelope(envelope: ProgramCreateEnvelope): void {
	// Whitelist the business payload; never persist auth/session metadata.
	window.sessionStorage.setItem('gymflow:program-create:' + envelope.ownerId, JSON.stringify({
		ownerId: envelope.ownerId, createRequestId: envelope.createRequestId,
		payload: programPayload(envelope.payload), status: envelope.status,
		...(envelope.status === 'confirmed' ? { programId: envelope.programId } : {}),
	}));
}

export function clearProgramCreateEnvelope(ownerId: string): void {
	window.sessionStorage.removeItem('gymflow:program-create:' + ownerId);
}

export function programCreateError(error: any): 'payload' | 'unavailable' | 'unknown' {
	for (const item of error?.graphQLErrors ?? []) {
		const reason = item.extensions?.reason ?? item.extensions?.originalError?.reason;
		if (reason === 'PROGRAM_CREATE_PAYLOAD_CONFLICT' || item.message === 'This create request belongs to a different Program submission.')
			return 'payload';
		if (reason === 'PROGRAM_CREATE_UNAVAILABLE' || item.message === 'This create request was already used. The original Program is unavailable.')
			return 'unavailable';
	}
	return 'unknown';
}

export function isProgramRevision(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 2147483647;
}

export function programUpdateError(error: any): 'stale' | 'contention' | 'unavailable' | 'rejected' | 'unknown' {
	if (error?.networkError || !error?.graphQLErrors?.length) return 'unknown';
	for (const item of error.graphQLErrors) {
		const reason = item.extensions?.reason ?? item.extensions?.originalError?.reason;
		if (
			reason === 'PROGRAM_REVISION_CONFLICT' ||
			item.message === 'Program has changed. Refresh and review the latest data.'
		)
			return 'stale';
		if (
			reason === 'PROGRAM_WRITE_CONTENTION' ||
			item.message === 'Program is busy. Review the latest data before saving again.'
		)
			return 'contention';
		if ((item.extensions?.code ?? item.code) === 'NOT_FOUND' || item.message === 'Editable program not found')
			return 'unavailable';
	}
	return error.graphQLErrors.some(
		(item: any) =>
			(item.extensions?.code ?? item.code) === 'INTERNAL_SERVER_ERROR' ||
			item.extensions?.originalError?.statusCode >= 500,
	)
		? 'unknown'
		: 'rejected';
}

export interface ProgramEditConstraints {
	hasProtected: boolean;
	maxOccupied: number;
}

export async function readProgramEditConstraints(
	programId: string,
	read: (input: TrainerReservationsInquiry) => Promise<TrainerReservations>,
	isCurrent: () => boolean = () => true,
): Promise<ProgramEditConstraints | null> {
	const reservations = new Map<string, TrainerReservation>();
	let page = 1;
	while (isCurrent()) {
		const result = await read({ page, limit: 100, search: { programId, period: ReservationPeriod.UPCOMING } });
		if (!isCurrent()) return null;
		const total = result?.metaCounter?.[0]?.total ?? (result?.list?.length === 0 ? 0 : undefined);
		if (
			!Array.isArray(result?.list) ||
			!Number.isSafeInteger(total) ||
			total! < 0 ||
			(!result.list.length && total! > (page - 1) * 100)
		)
			throw new Error('Incomplete reservation result');
		result.list.forEach((reservation) => {
			if (reservation.programId === programId) reservations.set(reservation._id, reservation);
		});
		if (page * 100 >= total!) break;
		page++;
	}
	if (!isCurrent()) return null;
	const now = seoulNow();
	const sessions = new Map<string, number>();
	reservations.forEach((reservation) => {
		if (![ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(reservation.reservationStatus)) return;
		if (
			!isBookingDate(reservation.reservationDate) ||
			![reservation.startTime, reservation.endTime].every((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) ||
			reservation.startTime >= reservation.endTime
		)
			throw new Error('Invalid reservation interval');
		if (
			reservation.reservationDate < now.date ||
			(reservation.reservationDate === now.date && reservation.endTime <= now.time)
		)
			return;
		const key = JSON.stringify([
			reservation.programId,
			reservation.reservationDate,
			reservation.startTime,
			reservation.endTime,
		]);
		sessions.set(key, (sessions.get(key) ?? 0) + 1);
	});
	return {
		hasProtected: sessions.size > 0,
		maxOccupied: Array.from(sessions.values()).reduce((max, count) => Math.max(max, count), 0),
	};
}

export function readTrainersInquiry(value: unknown, fallback: TrainersInquiry): TrainersInquiry {
	try {
		const input = typeof value === 'string' ? JSON.parse(value) : value;
		if (!input || typeof input !== 'object') return { ...fallback, search: { ...fallback.search } };
		const text = typeof input.search?.text === 'string' ? input.search.text.trim().slice(0, 100) : '';
		return {
			page: Number.isInteger(input.page) && input.page > 0 && input.page <= 2147483647 ? input.page : 1,
			limit: Number.isInteger(input.limit) && input.limit > 0 && input.limit <= 100 ? input.limit : fallback.limit,
			sort: ['createdAt', 'updatedAt', 'memberLikes', 'memberViews', 'memberRank'].includes(input.sort)
				? input.sort
				: fallback.sort,
			direction: input.direction === Direction.ASC ? Direction.ASC : Direction.DESC,
			search: text ? { text } : {},
		};
	} catch {
		return { ...fallback, search: { ...fallback.search } };
	}
}

export const programSorts = [
	'createdAt',
	'updatedAt',
	'programLikes',
	'programViews',
	'programRank',
	'programPrice',
	'programDuration',
	'programCapacity',
];
export const initialProgramsInquiry: ProgramsInquiry = {
	page: 1,
	limit: 9,
	sort: 'createdAt',
	direction: Direction.DESC,
	search: {},
};

// URL values are user input. Only send fields accepted by the GraphQL contract.
export function readProgramsInquiry(
	value: unknown,
	fallback: ProgramsInquiry = initialProgramsInquiry,
): ProgramsInquiry {
	try {
		const input = typeof value === 'string' ? JSON.parse(value) : value;
		if (!input || typeof input !== 'object' || Array.isArray(input))
			return { ...fallback, search: { ...fallback.search } };
		const source = input.search ?? {};
		const search: ProgramsInquiry['search'] = {};
		for (const [key, values] of [
			['typeList', Object.values(ProgramType)],
			['categoryList', Object.values(ProgramCategory)],
			['locationList', Object.values(ProgramLocation)],
		] as const) {
			if (Array.isArray(source[key])) {
				const selected = source[key].filter((item: string) => (values as readonly string[]).includes(item));
				if (selected.length) Object.assign(search, { [key]: selected });
			}
		}
		if (typeof source.memberId === 'string' && /^[a-f\d]{24}$/i.test(source.memberId))
			search.memberId = source.memberId;
		if (typeof source.text === 'string' && source.text.trim()) search.text = source.text.trim().slice(0, 100);
		const range = source.pricesRange;
		if (
			range &&
			[range.start, range.end].every((item) => Number.isInteger(item) && item >= 0 && item <= 2147483647) &&
			range.start <= range.end
		)
			search.pricesRange = { start: range.start, end: range.end };
		const period = source.periodsRange;
		if (
			period &&
			typeof period.start === 'string' &&
			typeof period.end === 'string' &&
			Number.isFinite(Date.parse(period.start)) &&
			Number.isFinite(Date.parse(period.end)) &&
			Date.parse(period.start) <= Date.parse(period.end)
		)
			search.periodsRange = { start: period.start, end: period.end };
		return {
			page: Number.isInteger(input.page) && input.page > 0 && input.page <= 2147483647 ? input.page : 1,
			limit: Number.isInteger(input.limit) && input.limit > 0 && input.limit <= 100 ? input.limit : fallback.limit,
			sort: programSorts.includes(input.sort) ? input.sort : fallback.sort,
			direction: input.direction === Direction.ASC ? Direction.ASC : Direction.DESC,
			search,
		};
	} catch {
		return { ...fallback, search: { ...fallback.search } };
	}
}

export function readTrainerProgramsInquiry(value: unknown): TrainerProgramsInquiry {
	const inquiry: TrainerProgramsInquiry = readProgramsInquiry(value, { ...initialProgramsInquiry, limit: 5 });
	try {
		const source = typeof value === 'string' ? JSON.parse(value) : value;
		if ([ProgramStatus.ACTIVE, ProgramStatus.PAUSED].includes(source?.search?.programStatus))
			inquiry.search.programStatus = source.search.programStatus;
	} catch {
		/* Use the safe management default. */
	}
	return inquiry;
}

// The management API enforces ownership and excludes deleted programs server-side.
export async function findTrainerProgram(
	programId: string,
	read: (input: TrainerProgramsInquiry) => Promise<Programs>,
	isCurrent: () => boolean = () => true,
): Promise<Program | null> {
	if (!/^[a-f\d]{24}$/i.test(programId)) return null;
	let page = 1;
	while (isCurrent()) {
		const result = await read({ page, limit: 100, sort: 'createdAt', direction: Direction.DESC, search: {} });
		if (!isCurrent()) return null;
		const program = result.list.find(
			(item) =>
				item._id === programId.toLowerCase() &&
				[ProgramStatus.ACTIVE, ProgramStatus.PAUSED].includes(item.programStatus),
		);
		if (program) return program;
		const total = result.metaCounter?.[0]?.total;
		if (!result.list.length || (total !== undefined && page * 100 >= total)) return null;
		page++;
	}
	return null;
}

export function programFormError(input: ProgramInput): string {
	if (
		!Object.values(ProgramType).includes(input.programType) ||
		!Object.values(ProgramCategory).includes(input.programCategory) ||
		!Object.values(ProgramLocation).includes(input.programLocation)
	)
		return 'Please select a type, category and location.';
	if (input.programName.trim().length < 3 || input.programName.trim().length > 100)
		return 'Program name must contain 3–100 characters.';
	for (const key of ['programPrice', 'programDuration', 'programCapacity'] as const) {
		if (!Number.isInteger(input[key]) || input[key] < (key === 'programPrice' ? 0 : 1) || input[key] > 2147483647)
			return 'Price must be a non-negative integer; duration and capacity must be positive integers.';
	}
	if (input.programType === ProgramType.PT_1ON1 && input.programCapacity !== 1)
		return 'One-on-one programs require capacity 1.';
	if ((input.programType === ProgramType.ONLINE) !== (input.programLocation === ProgramLocation.ONLINE))
		return 'Online type and location must be selected together.';
	const address = input.programAddress?.trim();
	if (input.programType !== ProgramType.ONLINE && !address) return 'In-person programs require a physical address.';
	if (address && (address.length < 3 || address.length > 100)) return 'Address must contain 3–100 characters.';
	const description = input.programDesc?.trim();
	if (description && (description.length < 5 || description.length > 500))
		return 'Description must contain 5–500 characters, or be empty.';
	if (input.programImages.length > 5) return 'Cannot upload more than 5 images.';
	if (!input.programImages.length || input.programImages.some((path) => !path.trim() || path.length > 2048))
		return 'Upload at least one program image.';
	return '';
}

export function programPayload(input: ProgramInput, updating = false): ProgramInput {
	return {
		programType: input.programType,
		programCategory: input.programCategory,
		programLocation: input.programLocation,
		programName: input.programName.trim(),
		programPrice: input.programPrice,
		programDuration: input.programDuration,
		programCapacity: input.programCapacity,
		programImages: [...input.programImages],
		...(input.programAddress?.trim()
			? { programAddress: input.programAddress.trim() }
			: updating
			? { programAddress: null }
			: {}),
		...(input.programDesc?.trim() ? { programDesc: input.programDesc.trim() } : updating ? { programDesc: null } : {}),
	};
}
