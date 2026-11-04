import decodeJWT from 'jwt-decode';
import Router from 'next/router';
import { print } from 'graphql';
import { initializeApollo } from '../../apollo/client';
import { authErrorVar, authReadyVar, emptyUser, logoutInProgressVar, userVar } from '../../apollo/store';
import { CustomJwtPayload } from '../types/customJwtPayload';
import { OwnerMember } from '../types/member/member';
import { MemberInput } from '../types/member/member.input';
import { MemberType } from '../enums/member.enum';
import { LOGIN, SIGN_UP, REFRESH_SESSION, LOGOUT_SESSION } from '../../apollo/user/mutation';
import { GET_MY_MEMBER } from '../../apollo/user/query';
import { getApiGraphqlUrl } from '../config';
import { NetworkStatus } from '@apollo/client';
import { isPublicQuery } from '../../apollo/auth-policy';

let accessToken = '';
let sessionId = '';
let generation = 0;
let bootstrapped = false;
let refreshing: { generation: number; promise: Promise<string> } | null = null;
let restoring: { generation: number; promise: Promise<void> } | null = null;
let signingOut = false;
let revokingSession: Promise<boolean> | null = null;
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
	const response = await fetch(getApiGraphqlUrl(), {
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
	if (localStorage.getItem(logoutPendingKey)) {
		if (required) throw new Error('Sign out is awaiting confirmation');
		return '';
	}
	if (accessToken) {
		try { if (tokenClaims(accessToken).exp! * 1000 > Date.now() + 30000) return accessToken; }
		catch { /* Expiry requires cookie-authorized renewal, never bearer-based renewal. */ }
	}
	const token = !accessToken && bootstrapped ? '' : await refreshAccessToken();
	if (required && !token) throw authFailure();
	return token;
}
export async function renewExpiredAccessToken(rejectedToken: string): Promise<string> {
	if (!rejectedToken || !accessToken || localStorage.getItem(logoutPendingKey) || signingOut)
		throw authFailure();
	// Late expiry responses from one cohort reuse the credential already renewed by that cohort.
	if (accessToken !== rejectedToken) {
		try { tokenClaims(accessToken); return accessToken; }
		catch { /* The newer credential also expired while this response was in flight. */ }
	}
	const token = await refreshAccessToken();
	if (!token) throw authFailure();
	return token;
}
function applyOwner(member: OwnerMember): void {
	const { accessToken: ignoredCredential, ...profile } = member;
	const next = {
		...emptyUser, ...profile,
		memberImage: member.memberImage ?? '', memberAddress: member.memberAddress ?? '',
		memberDesc: member.memberDesc ?? '', memberFullName: member.memberFullName ?? '',
	};
	const identityChanged = next._id !== userVar()._id;
	if (JSON.stringify(next) !== JSON.stringify(userVar())) userVar(next);
	authErrorVar('');
	authReadyVar(true);
	bootstrapped = true;
	if (identityChanged) {
		// Replace anonymous discovery personalization without refetching private forms.
		void initializeApollo().refetchQueries?.({
			include: 'active',
			onQueryUpdated: (query) => isPublicQuery(query.options.query)
				? query.reobserve({
					fetchPolicy: 'network-only',
					context: { ...query.options.context, queryDeduplication: false },
				}, NetworkStatus.refetch) : false,
		}).catch(() => undefined);
	}
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
	if (signingOut) return Promise.resolve();
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
	// An explicit new login must not race a late logout response that clears the refresh cookie.
	if (revokingSession) await revokingSession;
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
	nick: string, password: string, phone: string,
	context: { handleErrorLocally?: boolean } = {},
): Promise<void> => {
	const input: MemberInput = {
		memberNick: nick, memberPassword: password, memberPhone: phone, memberType: MemberType.USER,
	};
	await authenticate(SIGN_UP, input, 'signup', context);
};
export const logOut = async (_options: { redirectToPublic?: boolean } = {}): Promise<boolean> => {
	if (signingOut) return false;
	signingOut = true;
	// Publish before invalidation so the app unmounts protected pages during cleanup/navigation.
	logoutInProgressVar(true);
	let current = generation;
	try {
		localStorage.setItem(logoutPendingKey, '1');
		signal('logout');
		const clearing = invalidateSession();
		current = generation;
		let cacheCleared = true;
		await clearing.catch(() => { cacheCleared = false; });
		revokingSession = (async () => {
			try {
				await withAuthLock(() => {
					if (generation !== current) throw new Error('Authentication session changed');
					return authRequest('logoutSession');
				});
				if (generation === current) localStorage.removeItem(logoutPendingKey);
				return true;
			} catch {
				if (generation === current) authErrorVar('Could not confirm sign out. Please retry.');
				return false;
			}
		})();
		if (generation !== current) return await revokingSession;
		if (!cacheCleared) {
			await revokingSession;
			if (generation === current) authErrorVar('Signed out. Please reload to finish clearing your session.');
			return false;
		}
		let navigated = false;
		try {
			navigated = await Router.replace('/');
			if (!navigated) throw new Error('Navigation cancelled');
		} catch {
			if (generation === current) authErrorVar('Signed out. Could not open Home. Please retry navigation.');
		} finally {
			// Home can mount once its route and the cache are ready; revocation need not hold the UI.
			logoutInProgressVar(false);
		}
		const confirmed = await revokingSession;
		return navigated && confirmed;
	} catch {
		if (generation !== current) return false;
		authErrorVar('Could not confirm sign out. Please retry.');
		return false;
	} finally {
		revokingSession = null;
		signingOut = false;
		logoutInProgressVar(false);
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
