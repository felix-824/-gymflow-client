import { gql } from '@apollo/client';

export const GET_TRAINER_RESERVATIONS = gql`
	query GetTrainerReservations($input: TrainerReservationsInquiry!) {
		getTrainerReservations(input: $input) {
			list {
				_id
				reservationDate
				startTime
				endTime
				reservationStatus
				specialRequest
				memberId
				trainerId
				programId
				createdAt
				updatedAt
				programData { _id programName programImages programType programLocation programAddress }
				memberData { _id memberFullName memberNick memberImage }
			}
			metaCounter { total }
		}
	}
`;

export const GET_MY_RESERVATIONS = gql`
	query GetMyReservations($input: ReservationsInquiry!) {
		getMyReservations(input: $input) {
			list {
				_id
				reservationDate
				startTime
				endTime
				reservationStatus
				reviewId
				specialRequest
				memberId
				trainerId
				programId
				createdAt
				updatedAt
				programData {
					_id
					programName
					programImages
					programType
					programLocation
					programAddress
				}
				trainerData {
					_id
					memberFullName
					memberNick
					memberImage
				}
			}
			metaCounter { total }
		}
	}
`;

export const GET_REVIEWS = gql`
	query GetReviews($input: ReviewsInquiry!) {
		getReviews(input: $input) {
			list {
				_id
				rating
				content
				programId
				createdAt
				memberData { _id memberNick memberFullName memberImage }
			}
			metaCounter { total }
			averageRating
		}
	}
`;

export const CHECK_AUTH = gql`
	query CheckAuth {
		checkAuth
	}
`;

export const GET_MY_MEMBER = gql`
	query GetMyMember {
		getMyMember {
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
			memberFollowers
			memberFollowings
			memberPoints
			memberLikes
			memberViews
			memberComments
			memberRank
			createdAt
			updatedAt
		}
	}
`;

export const GET_MY_TRAINER_SCHEDULE = gql`
	query GetMyTrainerSchedule {
		getMyTrainerSchedule {
			_id
			memberId
			dayOfWeek
			isAvailable
			startTime
			endTime
			createdAt
			updatedAt
		}
	}
`;

/**************************
 *         MEMBER         *
 *************************/

export const GET_TRAINERS = gql`
	query GetTrainers($input: TrainersInquiry!) {
		getTrainers(input: $input) {
			list {
				_id
				memberType
				memberNick
				memberFullName
				memberImage
				memberDesc
				memberPrograms
				memberFollowers
				memberRank
				memberLikes
				memberViews
				meLiked {
					memberId
					likeRefId
					myFavorite
				}
				meFollowed {
					myFollowing
				}
			}
			metaCounter {
				total
			}
		}
	}
`;

export const GET_MEMBER = gql(`
query GetMember($input: String!) {
    getMember(memberId: $input) {
        _id
        memberType
        memberNick
        memberFullName
        memberImage
        memberDesc
        memberPrograms
        memberArticles
		memberComments
        memberLikes
        memberViews
        memberFollowings
				memberFollowers
        memberRank
        meFollowed {
					followingId
					followerId
					myFollowing
				}
    }
}
`);

/**************************
 *        PROGRAM        *
 *************************/

export const GET_PROGRAM_AVAILABILITY = gql`
	query GetProgramAvailability($input: ProgramAvailabilityInquiry!) {
		getProgramAvailability(input: $input) {
			startTime
			endTime
		}
	}
`;

export const GET_PROGRAM = gql`
	query GetProgram($input: String!) {
		getProgram(programId: $input) {
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
			memberData {
				_id
				memberType
				memberNick
				memberFullName
				memberImage
				memberDesc
				memberLikes
				memberViews
			}
			meLiked {
				memberId
				likeRefId
				myFavorite
			}
		}
	}
`;

export const GET_PROGRAMS = gql`
	query GetPrograms($input: ProgramsInquiry!) {
		getPrograms(input: $input) {
			list {
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
				programRank
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
				meLiked {
					memberId
					likeRefId
					myFavorite
				}
			}
			metaCounter {
				total
			}
		}
	}
`;

export const GET_TRAINER_PROGRAMS = gql`
	query GetTrainerPrograms($input: TrainerProgramsInquiry!) {
		getTrainerPrograms(input: $input) {
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
			}
			metaCounter {
				total
			}
		}
	}
`;

export const GET_FAVORITES = gql`
	query GetFavorites($input: OrdinaryInquiry!) {
		getFavorites(input: $input) {
			list {
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

				programRank
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
					memberArticles
					memberLikes
					memberViews
					memberComments
					memberFollowings
					memberFollowers
					memberRank
				}
			}
			metaCounter {
				total
			}
		}
	}
`;

export const GET_VISITED = gql`
	query GetVisited($input: OrdinaryInquiry!) {
		getVisited(input: $input) {
			list {
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

				programRank
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
					memberArticles
					memberLikes
					memberViews
					memberComments
					memberFollowings
					memberFollowers
					memberRank
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

export const GET_BOARD_ARTICLE = gql`
	query GetBoardArticle($input: String!) {
		getBoardArticle(articleId: $input) {
			_id
			articleCategory
			articleStatus
			articleTitle
			articleContent
			articleImage
			articleViews
			articleLikes
			articleComments
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
			meLiked {
				memberId
				likeRefId
				myFavorite
			}
		}
	}
`;

export const GET_MY_BOARD_ARTICLE = gql`
	query GetMyBoardArticle($input: String!) {
		getMyBoardArticle(articleId: $input) {
			_id
			articleCategory
			articleStatus
			articleTitle
			articleContent
			articleImage
			articleRevision
			memberId
			createdAt
			updatedAt
		}
	}
`;

export const GET_MY_BOARD_ARTICLES = gql`
	query GetMyBoardArticles($input: OrdinaryInquiry!) {
		getMyBoardArticles(input: $input) {
			list {
				_id
				articleCategory
				articleStatus
				articleTitle
				articleContent
				articleImage
				articleViews
				articleLikes
				articleComments
				articleRevision
				memberId
				createdAt
				updatedAt
			}
			metaCounter {
				total
			}
		}
	}
`;

export const GET_BOARD_ARTICLES = gql`
	query GetBoardArticles($input: BoardArticlesInquiry!) {
		getBoardArticles(input: $input) {
			list {
				_id
				articleCategory
				articleStatus
				articleTitle
				articleContent
				articleImage
				articleViews
				articleLikes
				articleComments
				memberId
				createdAt
				updatedAt
				meLiked {
					memberId
					likeRefId
					myFavorite
				}
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

/**************************
 *         FOLLOW        *
 *************************/
export const GET_MEMBER_FOLLOWERS = gql`
	query GetMemberFollowers($input: FollowInquiry!) {
		getMemberFollowers(input: $input) {
			list {
				_id
				followingId
				followerId
				createdAt
				updatedAt
				meLiked {
					memberId
					likeRefId
					myFavorite
				}
				meFollowed {
					followingId
					followerId
					myFollowing
				}
				followerData {
					_id
					memberType
					memberNick
					memberFullName
					memberImage
					memberDesc
					memberPrograms
					memberArticles
					memberLikes
					memberViews
					memberComments
					memberFollowings
					memberFollowers
					memberRank
				}
			}
			metaCounter {
				total
			}
		}
	}
`;

export const GET_MEMBER_FOLLOWINGS = gql`
	query GetMemberFollowings($input: FollowInquiry!) {
		getMemberFollowings(input: $input) {
			list {
				_id
				followingId
				followerId
				createdAt
				updatedAt
				followingData {
					_id
					memberType
					memberNick
					memberFullName
					memberImage
					memberDesc
					memberPrograms
					memberArticles
					memberLikes
					memberViews
					memberComments
					memberFollowings
					memberFollowers
					memberRank
				}
				meLiked {
					memberId
					likeRefId
					myFavorite
				}
				meFollowed {
					followingId
					followerId
					myFollowing
				}
			}
			metaCounter {
				total
			}
		}
	}
`;
