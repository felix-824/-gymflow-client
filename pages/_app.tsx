import type { AppProps } from 'next/app';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { handleAuthStorage, updateUserInfo } from '../libs/auth';
import LogoutTransition from '../libs/components/auth/LogoutTransition';
import { light } from '../scss/MaterialTheme';
import { ApolloProvider } from '@apollo/client';
import { useApollo } from '../apollo/client';
import { appWithTranslation, useTranslation } from 'next-i18next';
import enGyms from '../public/locales/en/gyms.json';
import krGyms from '../public/locales/kr/gyms.json';
import ruGyms from '../public/locales/ru/gyms.json';
import '../scss/app.scss';
import '../scss/pc/main.scss';
import '../scss/mobile/main.scss';

const App = ({ Component, pageProps }: AppProps) => {
	// Shared navigation needs the feature namespace on every route, including SSR.
	const { i18n } = useTranslation('common');
	if (typeof i18n.hasResourceBundle === 'function' && typeof i18n.addResourceBundle === 'function') {
		for (const [locale, messages] of Object.entries({ en: enGyms, kr: krGyms, ru: ruGyms })) {
			if (!i18n.hasResourceBundle(locale, 'gyms')) i18n.addResourceBundle(locale, 'gyms', messages);
		}
	}
	// @ts-ignore
	const [theme, setTheme] = useState(createTheme(light));
	const client = useApollo(pageProps.initialApolloState);
	useEffect(() => {
		const restore = () => { void updateUserInfo(); };
		restore();
		window.addEventListener('storage', handleAuthStorage);
		window.addEventListener('focus', restore);
		return () => {
			window.removeEventListener('storage', handleAuthStorage);
			window.removeEventListener('focus', restore);
		};
	}, []);

	return (
		<ApolloProvider client={client}>
			<ThemeProvider theme={theme}>
				<CssBaseline />
				<LogoutTransition>
					<Component {...pageProps} />
				</LogoutTransition>
			</ThemeProvider>
		</ApolloProvider>
	);
};

export default appWithTranslation(App);
