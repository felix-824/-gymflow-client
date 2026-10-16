import { ProgramCategory, ProgramLocation, ProgramStatus, ProgramType } from './enums/program.enum';
import { Direction } from './enums/common.enum';
import { ProgramInput, ProgramsInquiry, TrainerProgramsInquiry } from './types/program/program.input';
import { TrainersInquiry } from './types/member/member.input';
import { Program, Programs } from './types/program/program';

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
