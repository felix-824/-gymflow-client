import { MeLiked, TotalCounter } from '../program/program';
import { PublicMember } from '../member/member';

export interface MeFollowed {
	followingId: string;
	followerId: string;
	myFollowing: boolean;
}

export interface Follower {
	_id: string;
	followingId: string;
	followerId: string;
	createdAt: Date;
	updatedAt: Date;
	/** from aggregation **/
	meLiked?: MeLiked[];
	meFollowed?: MeFollowed[];
	followerData?: PublicMember;
}

export interface Followers {
	list: Follower[];
	metaCounter: TotalCounter[];
}

export interface Following {
	_id: string;
	followingId: string;
	followerId: string;
	createdAt: Date;
	updatedAt: Date;
	/** from aggregation **/
	meLiked?: MeLiked[];
	meFollowed?: MeFollowed[];
	followingData?: PublicMember;
}

export interface Followings {
	list: Following[];
	metaCounter: TotalCounter[];
}
