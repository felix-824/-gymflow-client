import { gql } from '@apollo/client';

/**************************
 *         MEMBER         *
 *************************/

export const GET_ALL_MEMBERS_BY_ADMIN = gql`
	query GetAllMembersByAdmin($input: MembersInquiry!) {
		getAllMembersByAdmin(input: $input) {
			list {
				_id
				memberType
				memberStatus
				memberAuthType
				memberPhone
				memberNick
				memberFullName
				memberImage
				memberAddress
				memberDesc
				memberWarnings
				memberBlocks
				memberPrograms
				memberRank
				memberArticles
				memberPoints
				memberLikes
				memberViews
				deletedAt
				createdAt
				updatedAt
			}
			metaCounter {
				total
			}
		}
	}
`;

/**************************
 *        PROGRAM        *
 *************************/

export const GET_ALL_PROGRAMS_BY_ADMIN = gql`
	query GetAllProgramsByAdmin($input: AllProgramsInquiry!) {
		getAllProgramsByAdmin(input: $input) {
			list {
				_id
				programRevision
				programType
				programStatus
				programLocation
				programAddress
				programName
				programPrice
				programDuration
				programCapacity
				programCategory
				programViews
				programLikes
				programImages
				programDesc


				memberId

				deletedAt

				createdAt
				updatedAt
				memberData {
					_id
					memberType
					memberNick
					memberFullName
					memberImage
					memberDesc
					memberPrograms
					memberRank
					memberLikes
					memberViews
				}
			}
			metaCounter {
				total
			}
		}
	}
`;

/**************************
 *      BOARD-ARTICLE     *
 *************************/

export const GET_ALL_BOARD_ARTICLES_BY_ADMIN = gql`
	query GetAllBoardArticlesByAdmin($input: AllBoardArticlesInquiry!) {
		getAllBoardArticlesByAdmin(input: $input) {
			list {
				_id
				articleCategory
				articleStatus
				articleTitle
				articleContent
				articleImage
				articleViews
				articleLikes
				memberId
				createdAt
				updatedAt
				memberData {
					_id
					memberType
					memberNick
					memberFullName
					memberImage
					memberDesc
					memberPrograms
					memberRank
					memberLikes
					memberViews
				}
			}
			metaCounter {
				total
			}
		}
	}
`;

/**************************
 *         COMMENT        *
 *************************/

export const GET_COMMENTS = gql`
	query GetComments($input: CommentsInquiry!) {
		getComments(input: $input) {
			list {
				_id
				commentStatus

				commentContent
				articleId
				memberId
				createdAt
				updatedAt
				memberData {
					_id
					memberType
					memberNick
					memberFullName
					memberImage
					memberDesc
					memberPrograms
					memberRank
					memberLikes
					memberViews
				}
			}
			metaCounter {
				total
			}
		}
	}
`;
