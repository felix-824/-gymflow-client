export function safeAuthDestination(referrer: unknown): string {
	if (typeof referrer !== 'string' || !referrer.startsWith('/') || referrer.startsWith('//')) return '/';
	// Backslashes/control characters can turn an apparent local URL into an external destination.
	if (
		/[\\\u0000-\u001f\u007f]/.test(referrer) ||
		/%(?:5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(referrer) ||
		/^\/%2f/i.test(referrer)
	)
		return '/';
	return referrer;
}

export function authErrorMessage(error: unknown, connectionMessage: string, fallback: string): string {
	const failure = error as {
		networkError?: unknown;
		message?: string;
		graphQLErrors?: { message?: string; extensions?: { originalError?: { message?: string | string[] } } }[];
	} | null;
	const messages = failure?.graphQLErrors?.flatMap((item) => {
		const validation = item.extensions?.originalError?.message;
		return validation ? (Array.isArray(validation) ? validation : [validation]) : item.message ? [item.message] : [];
	});
	if (messages?.length) return messages.join(' ');
	if (failure?.networkError) return connectionMessage;
	return failure?.message || fallback;
}
