import { BoardArticleCategory, BoardArticleStatus } from '../../enums/board-article.enum';
import { PublicMember } from '../member/member';
import { MeLiked, TotalCounter } from '../program/program';

export interface BoardArticle {
	_id: string;
	/** Selected by owner documents; existing public documents omit it. */
	articleRevision?: number;
	articleCategory: BoardArticleCategory;
	articleStatus: BoardArticleStatus;
	articleTitle: string;
	articleContent: string;
	articleImage?: string | null;
	articleViews: number;
	articleLikes: number;
	articleComments: number;
	memberId: string;
	createdAt: Date;
	updatedAt: Date;
	/** from aggregation **/
	meLiked?: MeLiked[];
	memberData?: PublicMember;
}

export interface BoardArticles {
	list: BoardArticle[];
	metaCounter: TotalCounter[];
}
