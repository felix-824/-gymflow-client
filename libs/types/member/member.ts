import { MemberAuthType, MemberStatus, MemberType } from '../../enums/member.enum';
import { MeLiked, TotalCounter } from '../program/program';
import { MeFollowed } from '../follow/follow';

export interface PublicMember {
	_id: string;
	memberType: MemberType;
	memberNick: string;
	memberFullName?: string;
	memberImage?: string;
	memberDesc?: string;
	memberPrograms: number;
	memberRank: number;
	memberArticles: number;
	memberLikes: number;
	memberFollowers?: number;
	memberFollowings?: number;
	memberViews: number;
	memberComments: number;
	meLiked?: MeLiked[];
	meFollowed?: MeFollowed[];
}

export interface OwnerMember extends PublicMember {
	memberStatus: MemberStatus;
	memberAuthType: MemberAuthType;
	memberPhone: string;
	memberAddress?: string;
	memberPoints: number;
	createdAt: Date;
	updatedAt: Date;
	accessToken?: string;
}

// Admin management only. Authentication tokens are never an Admin result.
export interface Member extends Omit<OwnerMember, 'accessToken'> {
	memberWarnings: number;
	memberBlocks: number;
	deletedAt?: Date;
}

export interface PublicMembers {
	list: PublicMember[];
	metaCounter: TotalCounter[];
}

export interface Members {
	list: Member[];
	metaCounter: TotalCounter[];
}
