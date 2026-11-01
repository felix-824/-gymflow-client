import type { UserProfile } from './types/customJwtPayload';

type Account = Partial<Pick<UserProfile, '_id' | 'memberType' | 'memberStatus'>>;

export function isActiveAdmin(user: Account): boolean {
	return Boolean(user._id) && user.memberType === 'ADMIN' && user.memberStatus === 'ACTIVE';
}

export function adminWorkspaceAccess(ready: boolean, error: string, user: Account) {
	if (!ready) return 'loading';
	if (error) return 'session';
	return isActiveAdmin(user) ? 'ready' : 'forbidden';
}

export function adminMyPageRedirect(category: unknown, user: Account): boolean {
	return isActiveAdmin(user) && (category == null || category === 'myProfile');
}
