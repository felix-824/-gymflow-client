import { Direction } from './enums/common.enum';
import { GymAmenity, GymLocation } from './enums/gym.enum';
import { GymsInquiry } from './types/gym/gym.input';

export function isGymImagePath(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^uploads\/gym\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|png|webp)$/.test(value)
	);
}

export const initialGymsInquiry: GymsInquiry = {
	page: 1,
	limit: 9,
	sort: 'createdAt',
	direction: Direction.DESC,
	search: {},
};

export function readGymsInquiry(value: unknown, fallback: GymsInquiry = initialGymsInquiry): GymsInquiry {
	try {
		const input = typeof value === 'string' ? JSON.parse(value) : value;
		if (!input || typeof input !== 'object' || Array.isArray(input))
			return { ...fallback, search: { ...fallback.search } };
		const source = input.search ?? {};
		const search: GymsInquiry['search'] = {};
		if (typeof source.text === 'string' && source.text.trim()) search.text = source.text.trim().slice(0, 100);
		for (const [key, values] of [
			['locationList', Object.values(GymLocation)],
			['amenities', Object.values(GymAmenity)],
		] as const) {
			if (Array.isArray(source[key])) {
				const selected = Array.from(
					new Set(source[key].filter((item: string) => (values as readonly string[]).includes(item))),
				);
				if (selected.length) Object.assign(search, { [key]: selected });
			}
		}
		return {
			page: Number.isInteger(input.page) && input.page > 0 && input.page <= 2147483647 ? input.page : 1,
			limit: Number.isInteger(input.limit) && input.limit > 0 && input.limit <= 100 ? input.limit : fallback.limit,
			sort: input.sort === 'createdAt' || input.sort === 'updatedAt' ? input.sort : fallback.sort,
			direction: input.direction === Direction.ASC ? Direction.ASC : Direction.DESC,
			search,
		};
	} catch {
		return { ...fallback, search: { ...fallback.search } };
	}
}
