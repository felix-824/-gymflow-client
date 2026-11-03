import { ApolloClient } from '@apollo/client';
import { GET_MY_APPROVED_GYMS } from '../apollo/user/query';
import { Program } from './types/program/program';

export type ProgramGym = NonNullable<Program['gymData']>;
export interface ApprovedProgramGymsInquiry {
	page: number;
	limit: number;
	search: { text?: string };
}

export async function readApprovedProgramGyms(
	client: Pick<ApolloClient<object>, 'query'>,
	input: ApprovedProgramGymsInquiry,
): Promise<{ list: ProgramGym[]; total: number }> {
	const { data } = await client.query({
		query: GET_MY_APPROVED_GYMS,
		variables: { input },
		fetchPolicy: 'no-cache',
		context: { queryDeduplication: false, handleErrorLocally: true },
	});
	const gyms = data?.getMyApprovedGyms;
	if (
		!Array.isArray(gyms?.list) ||
		!Number.isSafeInteger(gyms.metaCounter?.[0]?.total) ||
		gyms.metaCounter[0].total < 0
	)
		throw new Error('Incomplete approved Gym result');
	return { list: gyms.list, total: gyms.metaCounter[0].total };
}

// Verify the current venue independently of the selector's search/page. Absence from
// one filtered page says nothing about its approval. This never changes the draft.
export async function findApprovedProgramGym(
	client: Pick<ApolloClient<object>, 'query'>,
	gymId: string,
	isCurrent: () => boolean = () => true,
): Promise<ProgramGym | null> {
	for (let page = 1; isCurrent(); page++) {
		const { list, total } = await readApprovedProgramGyms(client, { page, limit: 100, search: {} });
		if (!isCurrent()) return null;
		const gym = list.find((item) => item._id === gymId);
		if (gym) return gym;
		if (page * 100 >= total) return null;
		if (!list.length) throw new Error('Incomplete approved Gym page');
	}
	return null;
}
