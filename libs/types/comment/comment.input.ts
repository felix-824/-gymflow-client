
import { Direction } from '../../enums/common.enum';

export interface CommentInput {
	commentContent: string;
	articleId: string;
}

interface CISearch {
	articleId: string;
}

export interface CommentsInquiry {
	page: number;
	limit: number;
	sort?: string;
	direction?: Direction;
	search: CISearch;
}
