import decodeJWT from 'jwt-decode';
import { initializeApollo } from '../../apollo/client';
import { authErrorVar, authReadyVar, emptyUser, userVar } from '../../apollo/store';
import { CustomJwtPayload } from '../types/customJwtPayload';
import { Member } from '../types/member/member';
import { LOGIN, SIGN_UP } from '../../apollo/user/mutation';
import { CHECK_AUTH, GET_MEMBER } from '../../apollo/user/query';

let restoring: Promise<void> | null = null;
let restoringToken = '';
let profileToken = '';

export function getJwtToken(): string {
	return typeof window !== 'undefined' ? localStorage.getItem('accessToken') ?? '' : '';
}

export function setJwtToken(token: string) {
	localStorage.setItem('accessToken', token);
}

export const updateStorage = ({ jwtToken }: { jwtToken: string }) => {
	if (!jwtToken) return;
	setJwtToken(jwtToken);
	localStorage.setItem('login', Date.now().toString());
};

export function invalidateSession() {
	profileToken = '';
	if (typeof window !== 'undefined') {
		localStorage.removeItem('accessToken');
		localStorage.setItem('logout', Date.now().toString());
	}
	userVar({ ...emptyUser });
	authErrorVar('');
	authReadyVar(true);
	return initializeApollo().clearStore();
}

export function isAuthenticationError(err: any): boolean {
	return (
		err?.networkError?.statusCode === 401 ||
		err?.response?.status === 401 ||
		Boolean(
			err?.graphQLErrors?.some(
				(error: any) =>
					error.extensions?.code === 'UNAUTHENTICATED' ||
					error.extensions?.originalError?.statusCode === 401 ||
					error.message === 'Unauthorized',
			),
		)
	);
}

export const updateUserInfo = (jwtToken: string, member?: Member): Promise<void> => {
	if (member) {
		if (getJwtToken() !== jwtToken) return Promise.resolve();
		profileToken = jwtToken;
		userVar({
			...emptyUser,
			...member,
			memberImage: member.memberImage ?? '',
			memberAddress: member.memberAddress ?? '',
			memberDesc: member.memberDesc ?? '',
			memberFullName: member.memberFullName ?? '',
		});
		authErrorVar('');
		authReadyVar(true);
		return Promise.resolve();
	}
	if (!jwtToken) {
		if (profileToken) void initializeApollo().clearStore();
		profileToken = '';
		userVar({ ...emptyUser });
		authErrorVar('');
		authReadyVar(true);
		return Promise.resolve();
	}
	if (restoring && restoringToken === jwtToken) return restoring;
	if (profileToken !== jwtToken) {
		userVar({ ...emptyUser });
		authReadyVar(false);
	}
	restoringToken = jwtToken;
	authErrorVar('');
	const request = (async () => {
		let claims: CustomJwtPayload;
		try {
			claims = decodeJWT<CustomJwtPayload>(jwtToken);
			if (!claims.sub || !/^[a-f\d]{24}$/i.test(claims.sub) || !claims.exp || claims.exp * 1000 <= Date.now()) {
				if (getJwtToken() === jwtToken) invalidateSession();
				return;
			}
		} catch {
			if (getJwtToken() === jwtToken) invalidateSession();
			return;
		}
		try {
			const client = initializeApollo();
			if (profileToken && profileToken !== jwtToken) await client.clearStore();
			await client.query({ query: CHECK_AUTH, fetchPolicy: 'network-only' });
			if (getJwtToken() !== jwtToken) return;
			const result = await client.query({
				query: GET_MEMBER,
				variables: { input: claims.sub },
				fetchPolicy: 'network-only',
			});
			if (getJwtToken() !== jwtToken) return;
			const profile: Member = result.data.getMember;
			if (profile.memberStatus !== 'ACTIVE') {
				invalidateSession();
				return;
			}
			await updateUserInfo(jwtToken, profile);
		} catch (err) {
			if (getJwtToken() !== jwtToken) return;
			if (isAuthenticationError(err)) invalidateSession();
			else authErrorVar('Could not load your profile. Please reload to retry.');
		} finally {
			if (getJwtToken() === jwtToken) authReadyVar(true);
		}
	})();
	restoring = request;
	void request.finally(() => {
		if (restoring === request) restoring = null;
	});
	return request;
};

export const logIn = async (
	nick: string,
	password: string,
	context: { handleErrorLocally?: boolean } = {},
): Promise<void> => {
	const client = initializeApollo();
	const result = await client.mutate({
		mutation: LOGIN,
		variables: { input: { memberNick: nick, memberPassword: password } },
		context,
	});
	const member: Member = result.data?.login;
	if (!member?.accessToken) throw new Error('Login failed. Please check your credentials.');
	await client.clearStore();
	updateStorage({ jwtToken: member.accessToken });
	await updateUserInfo(member.accessToken, member);
};

export const signUp = async (
	nick: string,
	password: string,
	phone: string,
	type: string,
	context: { handleErrorLocally?: boolean } = {},
): Promise<void> => {
	if (!['USER', 'TRAINER'].includes(type)) throw new Error('Invalid signup role');
	const client = initializeApollo();
	const result = await client.mutate({
		mutation: SIGN_UP,
		variables: { input: { memberNick: nick, memberPassword: password, memberPhone: phone, memberType: type } },
		context,
	});
	const member: Member = result.data?.signup;
	if (!member?.accessToken) throw new Error('Signup failed. Please try again.');
	await client.clearStore();
	updateStorage({ jwtToken: member.accessToken });
	await updateUserInfo(member.accessToken, member);
};

export const logOut = () => {
	const member = userVar();
	const isUser = Boolean(member._id) && member.memberType === 'USER';
	const cleanup = invalidateSession();
	if (isUser) {
		return cleanup.then(
			() => {
				window.location.replace('/');
				return true;
			},
			() => false,
		);
	}
	window.location.reload();
};
