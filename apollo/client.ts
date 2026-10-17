import { useMemo } from 'react';
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, from, NormalizedCacheObject } from '@apollo/client';
import createUploadLink from 'apollo-upload-client/public/createUploadLink.js';
import { onError } from '@apollo/client/link/error';
import { getJwtToken, invalidateSession, updateUserInfo } from '../libs/auth';
import { TokenRefreshLink } from 'apollo-link-token-refresh';
import { sweetErrorAlert } from '../libs/sweetAlert';
let apolloClient: ApolloClient<NormalizedCacheObject>;

//getHeaders() — JWT tokenni requestga qo‘shadi
function getHeaders() {
	const headers = {} as HeadersInit;
	const token = getJwtToken();
	// @ts-ignore
	if (token) headers['Authorization'] = `Bearer ${token}`;
	return headers;
}

//access token eskirganda yangilash uchun
const tokenRefreshLink = new TokenRefreshLink({
	accessTokenField: 'accessToken',
	isTokenValidOrUndefined: () => {
		return true;
	}, // @ts-ignore
	fetchAccessToken: () => {
		// execute refresh token
		return null;
	},
});

function createIsomorphicLink() {
	if (typeof window !== 'undefined') {
		const authLink = new ApolloLink((operation, forward) => {
			operation.setContext(({ headers = {} }) => ({
				authToken: getJwtToken(),
				headers: {
					...headers,
					...getHeaders(),
				},
			}));
			return forward(operation);
		});

		// @ts-ignore
		//Query/Mutation + file upload uchun HTTP
		const link = new createUploadLink({
			uri: process.env.REACT_APP_API_GRAPHQL_URL,
		});

		const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
			const currentSession = operation.getContext().authToken === getJwtToken();
			if (
				currentSession &&
				(graphQLErrors?.some(
					(error) =>
						error.extensions?.code === 'UNAUTHENTICATED' ||
						(error.extensions?.originalError as any)?.statusCode === 401 ||
						error.message === 'Unauthorized',
				) ||
					(networkError as any)?.statusCode === 401)
			) {
				invalidateSession();
			} else if (currentSession && graphQLErrors?.some((error) => error.extensions?.code === 'FORBIDDEN')) {
				void updateUserInfo(getJwtToken());
			}
			if (graphQLErrors) {
				graphQLErrors.map(({ message, locations, path, extensions }) => {
					console.log(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`);
					if (!operation.getContext().handleErrorLocally && !message.includes('input')) sweetErrorAlert(message);
				});
			}
			if (networkError) console.log(`[Network error]: ${networkError}`);
		});

		return from([errorLink, tokenRefreshLink, authLink.concat(link)]);
	}
	return new HttpLink({ uri: process.env.REACT_APP_API_GRAPHQL_URL ?? 'http://localhost:3007/graphql' });
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
