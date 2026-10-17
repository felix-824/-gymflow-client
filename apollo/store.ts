import { makeVar } from '@apollo/client';

import { UserProfile } from '../libs/types/customJwtPayload';
export const themeVar = makeVar({});

export const emptyUser: UserProfile = {
	_id: '',
	memberType: '',
	memberStatus: '',
	memberAuthType: '',
	memberPhone: '',
	memberNick: '',
	memberFullName: '',
	memberImage: '',
	memberAddress: '',
	memberDesc: '',
	memberPrograms: 0,
	memberRank: 0,
	memberArticles: 0,
	memberPoints: 0,
	memberLikes: 0,
	memberViews: 0,
	memberComments: 0,
};

export const userVar = makeVar<UserProfile>({ ...emptyUser });
export const authReadyVar = makeVar(false);
export const authErrorVar = makeVar('');

//@ts-ignore
export const socketVar = makeVar<WebSocket>();
