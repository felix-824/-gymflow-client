import { CommentStatus } from '../../enums/comment.enum';
import { MeLiked, TotalCounter } from '../program/program';
import { PublicMember } from '../member/member';

export interface Comment {
	_id: string;
	commentStatus: CommentStatus;
	commentContent: string;
	articleId: string;
	memberId: string;
	createdAt: Date;
	updatedAt: Date;
	/** from aggregation **/
	meLiked?: MeLiked[];
	memberData?: PublicMember;
}

export interface Comments {
	list: Comment[];
	metaCounter: TotalCounter[];
}
