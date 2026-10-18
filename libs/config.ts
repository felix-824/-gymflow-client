function apiUrl(name: string, value: string | undefined, developmentUrl: string): string {
	if (process.env.NODE_ENV !== 'production') return value || developmentUrl;
	if (!value || value === 'undefined') throw new Error(`${name} is required in production`);
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${name} must be a valid absolute HTTPS URL in production`);
	}
	if (parsed.protocol !== 'https:' || !value.startsWith('https://') || value !== value.trim())
		throw new Error(`${name} must be a valid absolute HTTPS URL in production`);
	if (parsed.username || parsed.password || parsed.search || parsed.hash)
		throw new Error(`${name} must not contain credentials, a query or a fragment`);
	if (['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(parsed.hostname) || parsed.hostname.endsWith('.localhost'))
		throw new Error(`${name} must not use a loopback host in production`);
	if (name === 'REACT_APP_API_GRAPHQL_URL' && parsed.pathname === '/')
		throw new Error(`${name} must include the GraphQL endpoint path`);
	return value;
}

export const REACT_APP_API_URL = apiUrl('REACT_APP_API_URL', process.env.REACT_APP_API_URL, 'http://localhost:3007').replace(/\/$/, '');

export function getApiGraphqlUrl(): string {
	return apiUrl('REACT_APP_API_GRAPHQL_URL', process.env.REACT_APP_API_GRAPHQL_URL, 'http://localhost:3007/graphql');
}

// Validate both public endpoints when production modules load, before any request.
if (process.env.NODE_ENV === 'production') getApiGraphqlUrl();

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
export const IMAGE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const Messages = {
	error1: 'Something went wrong!',
	error2: 'Please login first!',
	error3: 'Please fulfill all inputs!',
	error4: 'Message is empty!',
	error5: 'Only images with jpeg, jpg, png format allowed!',
};

export const topProgramRank = 2;
