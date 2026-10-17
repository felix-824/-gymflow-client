import decodeJWT from 'jwt-decode';
import { print } from 'graphql';
import { initializeApollo } from '../../apollo/client';
import { authErrorVar, authReadyVar, emptyUser, userVar } from '../../apollo/store';
import { CustomJwtPayload } from '../types/customJwtPayload';
import { OwnerMember } from '../types/member/member';
import { LOGIN, SIGN_UP, REFRESH_SESSION, LOGOUT_SESSION } from '../../apollo/user/mutation';
import { GET_MY_MEMBER } from '../../apollo/user/query';

let accessToken = '';
let sessionId = '';
let generation = 0;
let bootstrapped = false;
let refreshing: { generation: number; promise: Promise<string> } | null = null;
let restoring: { generation: number; promise: Promise<void> } | null = null;
const signalKey = 'gymflow.auth';
const logoutPendingKey = 'gymflow.logoutPending';

export function getJwtToken(): string {
	return typeof window === 'undefined' ? '' : accessToken;
}
export function getAuthSessionId(): string {
	return sessionId ? generation + ':' + sessionId : '';
}
export function getAuthGeneration(): number {
	return generation;
}
function tokenClaims(token: string): CustomJwtPayload {
	const claims = decodeJWT<CustomJwtPayload>(token);
	if (
		claims.purpose !== 'access' || !/^[a-f\d]{24}$/i.test(claims.sub ?? '') ||
		!/^[a-f\d]{24}$/i.test(claims.sid ?? '') || !Number.isInteger(claims.exp) || claims.exp! * 1000 <= Date.now()
	) throw new Error('Invalid access credential');
	return claims;
}
export function setJwtToken(token: string) {
	const claims = tokenClaims(token);
	if (sessionId && sessionId !== claims.sid) throw new Error('Authentication session changed');
	accessToken = token;
	sessionId = claims.sid;
}
function signal(action: 'login' | 'logout') {
	localStorage.setItem(signalKey, JSON.stringify({ action, id: Date.now() + ':' + Math.random() }));
}
export function invalidateSession(): Promise<void> {
	generation++;
	accessToken = '';
	sessionId = '';
	bootstrapped = true;
	if (typeof window !== 'undefined') localStorage.removeItem('accessToken');
	userVar({ ...emptyUser });
	authErrorVar('');
	authReadyVar(true);
	return initializeApollo().clearStore().then(() => undefined);
}
export function isAuthenticationError(err: any): boolean {
	return err?.networkError?.statusCode === 401 || err?.response?.status === 401 ||
		Boolean(err?.graphQLErrors?.some((error: any) =>
			(error.extensions?.code ?? error.code) === 'UNAUTHENTICATED' ||
			error.extensions?.originalError?.statusCode === 401 || error.message === 'Unauthorized',
		));
}
function authFailure(message = 'Please sign in again'): Error {
	return Object.assign(new Error(message), { graphQLErrors: [{ code: 'UNAUTHENTICATED', message }] });
}
async function withAuthLock<T>(action: () => Promise<T>): Promise<T> {
	const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
	// Native locks serialize cookie-changing operations between same-origin tabs.
	// Older clients still fail closed under the server's atomic rotation/reuse checks.
	return locks ? locks.request('gymflow-auth-session', action) : action();
}
async function authRequest(operation: 'refreshSession' | 'logoutSession'): Promise<any> {
	const query = print(operation === 'refreshSession' ? REFRESH_SESSION : LOGOUT_SESSION);
	const response = await fetch(process.env.REACT_APP_API_GRAPHQL_URL ?? 'http://localhost:3007/graphql', {
		method: 'POST', credentials: 'include',
		headers: { 'Content-Type': 'application/json', 'Apollo-Require-Preflight': 'true' },
		body: JSON.stringify({ query }),
	});
	if (response.status === 401) throw authFailure();
	const result = await response.json();
	if (result.errors?.length) throw Object.assign(new Error('Authentication request failed'), { graphQLErrors: result.errors });
	if (!response.ok) throw new Error('Authentication service unavailable');
	return result.data?.[operation];
}
async function refreshAccessToken(): Promise<string> {
	const current = generation;
	if (refreshing?.generation === current) return refreshing.promise;
	const promise = withAuthLock(async () => {
		if (generation !== current) throw new Error('Authentication session changed');
		try {
			const receipt = await authRequest('refreshSession');
			if (generation !== current) throw new Error('Authentication session changed');
			try {
				if (typeof receipt?.accessToken !== 'string') throw new Error('Invalid authentication receipt');
				setJwtToken(receipt.accessToken);
			} catch { throw authFailure(); }
			bootstrapped = true;
			return accessToken;
		} catch (error) {
			if (generation !== current) throw error;
			if (isAuthenticationError(error)) {
				if (accessToken || sessionId || userVar()._id) await invalidateSession();
				else { bootstrapped = true; authReadyVar(true); authErrorVar(''); }
				return '';
			}
			throw error;
		}
	});
	refreshing = { generation: current, promise };
	void promise.then(
		() => { if (refreshing?.promise === promise) refreshing = null; },
		() => { if (refreshing?.promise === promise) refreshing = null; },
	);
	return promise;
}
export async function ensureAccessToken(required = false): Promise<string> {
	if (typeof window === 'undefined') return '';
	if (localStorage.getItem(logoutPendingKey)) throw new Error('Sign out is awaiting confirmation');
	if (accessToken) {
		try { if (tokenClaims(accessToken).exp! * 1000 > Date.now() + 30000) return accessToken; }
		catch { /* Expiry requires cookie-authorized renewal, never bearer-based renewal. */ }
	}
	const token = !accessToken && bootstrapped ? '' : await refreshAccessToken();
	if (required && !token) throw authFailure();
	return token;
}
function applyOwner(member: OwnerMember): void {
	const { accessToken: ignoredCredential, ...profile } = member;
	const next = {
		...emptyUser, ...profile,
		memberImage: member.memberImage ?? '', memberAddress: member.memberAddress ?? '',
		memberDesc: member.memberDesc ?? '', memberFullName: member.memberFullName ?? '',
	};
	if (JSON.stringify(next) !== JSON.stringify(userVar())) userVar(next);
	authErrorVar('');
	authReadyVar(true);
	bootstrapped = true;
}
export const updateUserInfo = (_legacyToken?: string, member?: OwnerMember): Promise<void> => {
	if (typeof window === 'undefined') return Promise.resolve();
	localStorage.removeItem('accessToken');
	if (member) {
		const claims = tokenClaims(accessToken);
		if (member._id !== claims.sub || member.memberStatus !== 'ACTIVE') return Promise.reject(authFailure());
		applyOwner(member);
		return Promise.resolve();
	}
	const current = generation;
	if (restoring?.generation === current) return restoring.promise;
	if (!userVar()._id) authReadyVar(false);
	const promise = (async () => {
		try {
			if (localStorage.getItem(logoutPendingKey)) {
				await withAuthLock(() => {
					if (generation !== current) throw new Error('Authentication session changed');
					return authRequest('logoutSession');
				});
				if (generation !== current) return;
				localStorage.removeItem(logoutPendingKey);
				authReadyVar(true);
				authErrorVar('');
				return;
			}
			const token = await ensureAccessToken();
			if (generation !== current) return;
			if (!token) { authReadyVar(true); return; }
			const { data } = await initializeApollo().query({
				query: GET_MY_MEMBER, fetchPolicy: 'no-cache',
				context: { skipRefresh: true, queryDeduplication: false, handleErrorLocally: true },
			});
			if (generation !== current) return;
			const profile: OwnerMember = data.getMyMember;
			if (profile._id !== tokenClaims(accessToken).sub || profile.memberStatus !== 'ACTIVE') throw authFailure();
			applyOwner(profile);
		} catch (error) {
			if (generation !== current) return;
			if (isAuthenticationError(error)) await invalidateSession();
			else {
				// An established form remains mounted during temporary service/network failure.
				if (!userVar()._id) authErrorVar('Could not restore your session. Please retry.');
				authReadyVar(true);
			}
		}
	})();
	restoring = { generation: current, promise };
	void promise.then(
		() => { if (restoring?.promise === promise) restoring = null; },
		() => { if (restoring?.promise === promise) restoring = null; },
	);
	return promise;
};
async function authenticate(mutation: any, input: any, field: 'login' | 'signup', context: object): Promise<void> {
	const clearing = invalidateSession();
	const current = generation;
	await clearing;
	if (generation !== current) throw new Error('Authentication session changed');
	bootstrapped = false;
	authReadyVar(false);
	try {
		await withAuthLock(async () => {
			if (generation !== current) throw new Error('Authentication session changed');
			const result = await initializeApollo().mutate({
				mutation, variables: { input }, fetchPolicy: 'no-cache', context: { ...context, skipAuth: true },
			});
			if (generation !== current) throw new Error('Authentication session changed');
			const member: OwnerMember = result.data?.[field];
			if (!member?.accessToken) throw new Error('Invalid authentication receipt');
			setJwtToken(member.accessToken);
			applyOwner(member);
			localStorage.removeItem(logoutPendingKey);
			signal('login');
		});
	} finally { if (generation === current) authReadyVar(true); }
}
export const logIn = (nick: string, password: string, context: { handleErrorLocally?: boolean } = {}) =>
	authenticate(LOGIN, { memberNick: nick, memberPassword: password }, 'login', context);
export const signUp = async (
	nick: string, password: string, phone: string, type: string,
	context: { handleErrorLocally?: boolean } = {},
): Promise<void> => {
	if (!['USER', 'TRAINER'].includes(type)) throw new Error('Invalid signup role');
	await authenticate(SIGN_UP, { memberNick: nick, memberPassword: password, memberPhone: phone, memberType: type }, 'signup', context);
};
export const logOut = async (): Promise<boolean> => {
	const isUser = Boolean(userVar()._id) && userVar().memberType === 'USER';
	localStorage.setItem(logoutPendingKey, '1');
	signal('logout');
	const clearing = invalidateSession();
	const current = generation;
	let cacheCleared = true;
	await clearing.catch(() => { cacheCleared = false; });
	try {
		await withAuthLock(() => {
			if (generation !== current) throw new Error('Authentication session changed');
			return authRequest('logoutSession');
		});
		if (generation !== current) return true;
		localStorage.removeItem(logoutPendingKey);
		if (!cacheCleared) { authErrorVar('Signed out. Please reload to finish clearing your session.'); return false; }
		if (isUser) window.location.replace('/');
		else window.location.reload();
		return true;
	} catch {
		if (generation !== current) return false;
		authErrorVar('Could not confirm sign out. Please retry.');
		return false;
	}
};
export function handleAuthStorage(event: StorageEvent): void {
	if (event.key !== signalKey) return;
	let action: string;
	try { action = JSON.parse(event.newValue ?? '{}').action; } catch { return; }
	if (action !== 'login' && action !== 'logout') return;
	const clearing = invalidateSession();
	const current = generation;
	void clearing.then(() => {
		if (generation === current && action === 'login') { bootstrapped = false; void updateUserInfo(); }
	});
}
