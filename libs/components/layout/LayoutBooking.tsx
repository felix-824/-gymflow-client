import React, { useMemo } from 'react';
import Head from 'next/head';
import { Stack } from '@mui/material';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import { ProgramsHeader, ProgramsBottomNavigation } from '../program/ProgramsNavigation';
import Footer from '../Footer';

const withLayoutBooking = (Component: any) => {
	return function BookingLayout(props: any) {
		const theme = useTheme();
		const bookingTheme = useMemo(
			() =>
				createTheme(theme, {
					typography: { fontFamily: "'Plus Jakarta Sans', sans-serif" },
					palette: { primary: { main: '#EB6753', dark: '#A53425' } },
				}),
			[theme],
		);
		return (
			<ThemeProvider theme={bookingTheme}>
				<Head>
					<title>GymFlow</title>
					<link
						rel="stylesheet"
						href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
					/>
				</Head>
				<Stack id="pc-wrap" className="program-discovery-layout booking-layout">
					<Stack id="top">
						<ProgramsHeader />
					</Stack>
					<Stack id="main" component="main">
						<Component {...props} />
					</Stack>
					<Stack id="footer" component="footer">
						<Footer variant="programs" />
					</Stack>
					<ProgramsBottomNavigation />
				</Stack>
			</ThemeProvider>
		);
	};
};

export default withLayoutBooking;
