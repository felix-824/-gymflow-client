import { DocumentNode, getOperationAST } from 'graphql';

// Only reviewed public resolvers may bypass an unresolved cookie bootstrap.
const publicReads = new Set([
	'getPrograms', 'getProgram', 'getGyms', 'getGym', 'getTrainers', 'getMember',
	'getBoardArticles', 'getBoardArticle', 'getComments', 'getReviews',
	'getMemberFollowers', 'getMemberFollowings', 'getProgramAvailability',
]);
// Detail queries that record views are deliberately excluded from automatic retry.
const retryableReads = new Set([
	...Array.from(publicReads).filter((field) => !['getProgram', 'getMember', 'getBoardArticle'].includes(field)),
	'checkAuth', 'getMyMember', 'getMyReservations', 'getTrainerReservations',
	'getMyTrainerSchedule', 'getTrainerPrograms', 'getFavorites', 'getVisited',
	'getMyBoardArticle', 'getMyBoardArticles', 'getMyTrainerApplication',
	'getMyApprovedGyms', 'getMyTrainerGymAccesses', 'getAllMembersByAdmin',
	'getAllProgramsByAdmin', 'getAllBoardArticlesByAdmin', 'getAllGymsByAdmin', 'getGymByAdmin',
	'getTrainerApplicationsByAdmin', 'getTrainerApplicationByAdmin',
	'getTrainerGymAccessesByAdmin', 'getTrainerGymAccessByAdmin',
]);

function matches(document: DocumentNode, names: Set<string>, operationName?: string): boolean {
	const operation = getOperationAST(document, operationName);
	return operation?.operation === 'query' && operation.selectionSet.selections.length > 0 &&
		operation.selectionSet.selections.every((field) =>
			field.kind === 'Field' && (field.name.value === '__typename' || names.has(field.name.value)),
		);
}
export const isPublicQuery = (document: DocumentNode, operationName?: string) => matches(document, publicReads, operationName);
export const isRetryableQuery = (document: DocumentNode, operationName?: string) => matches(document, retryableReads, operationName);

export function isAccessExpiry(errors: readonly any[] | undefined): boolean {
	return Boolean(errors?.length && errors.every((error) =>
		(error.extensions?.code ?? error.code) === 'UNAUTHENTICATED' &&
		error.extensions?.reason === 'ACCESS_TOKEN_EXPIRED',
	));
}
