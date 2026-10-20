import { gql } from '@apollo/client';

export const REVIEW_TRAINER_APPLICATION = gql`
	mutation ReviewTrainerApplication($input: TrainerApplicationReview!) {
		reviewTrainerApplication(input: $input) {
			_id
			fullName
			categories
			status
			experienceSummary
			bio
			rejectionReason
		}
	}
`;

/**************************
 *         MEMBER         *
 *************************/

export const UPDATE_MEMBER_BY_ADMIN = gql`
	mutation UpdateMemberByAdmin($input: MemberUpdate!) {
		updateMemberByAdmin(input: $input) {
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
			memberPrograms
			memberArticles
			memberComments
			memberFollowers
			memberFollowings
			memberRank
			memberArticles
			memberPoints
			memberLikes
			memberViews
			memberWarnings
			memberBlocks
			deletedAt
			createdAt
			updatedAt
		}
	}
`;

/**************************
 *        PROGRAM        *
 *************************/

export const UPDATE_PROGRAM_BY_ADMIN = gql`
	mutation UpdateProgramByAdmin($input: ProgramUpdate!) {
		updateProgramByAdmin(input: $input) {
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
		}
	}
`;

export const REMOVE_PROGRAM_BY_ADMIN = gql`
	mutation RemoveProgramByAdmin($input: String!) {
		removeProgramByAdmin(programId: $input) {
			_id
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
		}
	}
`;

/**************************
 *      BOARD-ARTICLE     *
 *************************/

export const UPDATE_BOARD_ARTICLE_BY_ADMIN = gql`
	mutation UpdateBoardArticleByAdmin($input: BoardArticleUpdate!) {
		updateBoardArticleByAdmin(input: $input) {
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
		}
	}
`;

export const REMOVE_BOARD_ARTICLE_BY_ADMIN = gql`
	mutation RemoveBoardArticleByAdmin($input: String!) {
		removeBoardArticleByAdmin(articleId: $input) {
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
		}
	}
`;

/**************************
 *         COMMENT        *
 *************************/

export const REMOVE_COMMENT_BY_ADMIN = gql`
	mutation RemoveCommentByAdmin($input: String!) {
		removeCommentByAdmin(commentId: $input) {
			_id
			commentStatus

			commentContent
			articleId
			memberId
			createdAt
			updatedAt
		}
	}
`;
