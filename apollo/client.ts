import { useMemo } from 'react';
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, from, NormalizedCacheObject, Observable } from '@apollo/client';
import createUploadLink from 'apollo-upload-client/public/createUploadLink.js';
import { onError } from '@apollo/client/link/error';
import { ensureAccessToken, getAuthGeneration, getJwtToken, invalidateSession, isAuthenticationError, updateUserInfo } from '../libs/auth';
import { sweetErrorAlert } from '../libs/sweetAlert';
import { getApiGraphqlUrl } from '../libs/config';
let apolloClient: ApolloClient<NormalizedCacheObject>;

function createIsomorphicLink() {
	if (typeof window === 'undefined')
		return new HttpLink({ uri: getApiGraphqlUrl() });
	const authLink = new ApolloLink((operation, forward) => new Observable((observer) => {
		const generation = getAuthGeneration();
		let stopped = false;
		let subscription: { unsubscribe(): void } | undefined;
		const current = () => !stopped && generation === getAuthGeneration();
		void (async () => {
			try {
				const token = operation.getContext().skipAuth ? '' : operation.getContext().skipRefresh
					? getJwtToken() : await ensureAccessToken();
				if (!current()) throw new Error('Authentication session changed');
				operation.setContext(({ headers = {} }) => ({
					authGeneration: generation,
					headers: {
						...Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'authorization')),
						'Apollo-Require-Preflight': 'true', ...(token ? { Authorization: 'Bearer ' + token } : {}),
					},
				}));
				subscription = forward(operation).subscribe({
					next: (result) => {
						if (!current()) { observer.error(new Error('Authentication session changed')); return; }
						if (!operation.getContext().skipAuth && isAuthenticationError({ graphQLErrors: result.errors })) {
							void invalidateSession();
							observer.error(Object.assign(new Error('Please sign in again'), { graphQLErrors: result.errors }));
							return;
						}
						// Fence before Apollo sees the result, including cache-writing mutations.
						if (current()) observer.next(result);
					},
					error: (error) => {
						if (!current()) { observer.error(new Error('Authentication session changed')); return; }
						if (!operation.getContext().skipAuth && isAuthenticationError({ networkError: error })) void invalidateSession();
						observer.error(error);
					},
					complete: () => observer.complete(),
				});
			} catch (error) { if (!stopped) observer.error(error); }
		})();
		return () => { stopped = true; subscription?.unsubscribe(); };
	}));
	const errorLink = onError(({ graphQLErrors, operation }) => {
		if (operation.getContext().authGeneration !== getAuthGeneration()) return;
		if (graphQLErrors?.some((error: any) => (error.extensions?.code ?? error.code) === 'FORBIDDEN'))
			void updateUserInfo();
		for (const error of graphQLErrors ?? []) {
			if (!operation.getContext().handleErrorLocally && !error.message.includes('input')) sweetErrorAlert(error.message);
		}
	});
	// @ts-ignore
	const uploadLink = new createUploadLink({ uri: getApiGraphqlUrl(), credentials: 'include' });
	return from([errorLink, authLink, uploadLink]);
}

function createApolloClient() {
	return new ApolloClient({
		ssrMode: typeof window === 'undefined',
		link: createIsomorphicLink(),
		cache: new InMemoryCache(),
		resolvers: {},
	});
}

export function initializeApollo(initialState = null) {
	const _apolloClient = apolloClient ?? createApolloClient();
	if (initialState) _apolloClient.cache.restore(initialState);
	if (typeof window === 'undefined') return _apolloClient;
	if (!apolloClient) apolloClient = _apolloClient;

	return _apolloClient;
}

export function useApollo(initialState: any) {
	return useMemo(() => initializeApollo(initialState), [initialState]);
}

/**
import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";

// No Subscription required for develop process

const httpLink = createHttpLink({
  uri: "http://localhost:3007/graphql",
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
});

export default client;
*/
