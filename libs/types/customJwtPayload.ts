import { JwtPayload } from 'jwt-decode';

export interface CustomJwtPayload extends JwtPayload {
	sub: string;
}

// Profiles come from Member responses, never from JWT profile claims.
export interface UserProfile {
	_id: string;
	memberType: string;
	memberStatus: string;
	memberAuthType: string;
	memberPhone: string;
	memberNick: string;
	memberFullName?: string;
	memberImage?: string;
	memberAddress?: string;
	memberDesc?: string;
	memberPrograms: number;
	memberRank: number;
	memberArticles: number;
	memberPoints: number;
	memberLikes: number;
	memberViews: number;
	memberComments: number;
	memberFollowers?: number;
	memberFollowings?: number;
}
