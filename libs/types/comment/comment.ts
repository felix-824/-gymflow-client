import { CommentStatus } from '../../enums/comment.enum';
import { MeLiked, TotalCounter } from '../program/program';
import { Member } from '../member/member';

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
	memberData?: Member;
}

export interface Comments {
	list: Comment[];
	metaCounter: TotalCounter[];
}
