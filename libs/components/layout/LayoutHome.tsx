import React from 'react';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import Head from 'next/head';
import { ProgramsHeader } from '../program/ProgramsNavigation';
import Footer from '../Footer';
import { Stack } from '@mui/material';
import HomeHero from '../homepage/HomeHero';

import Chat from '../Chat';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

const withLayoutMain = (Component: any) => {
	return function HomeLayout(props: any) {
		const device = useDeviceDetect();

		/** LIFECYCLES **/

		/** HANDLERS **/

		if (device == 'mobile') {
			return (
				<>
					<Head>
						<title>GymFlow</title>
						<meta name={'title'} content={`GymFlow`} />
					</Head>
					<Stack id="mobile-wrap">
						<Stack id={'top'} className="home-top-experience">
							<ProgramsHeader />
							<HomeHero />
						</Stack>

						<Stack id={'main'}>
							<Component {...props} />
						</Stack>

						<Stack id={'footer'} className="home-footer-shell">
							<Footer variant="home" />
						</Stack>
					</Stack>
				</>
			);
		} else {
			return (
				<>
					<Head>
						<title>GymFlow</title>
						<meta name={'title'} content={`GymFlow`} />
					</Head>
					<Stack id="pc-wrap">
						<Stack id={'top'} className="home-top-experience">
							<ProgramsHeader />
							<HomeHero />
						</Stack>

						<Stack id={'main'}>
							<Component {...props} />
						</Stack>

						<Chat />

						<Stack id={'footer'} className="home-footer-shell">
							<Footer variant="home" />
						</Stack>
					</Stack>
				</>
			);
		}
	};
};

export default withLayoutMain;
