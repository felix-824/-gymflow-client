import React from 'react';
import { useRouter } from 'next/router';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import Head from 'next/head';
import Top from '../Top';
import Footer from '../Footer';
import { Stack, useMediaQuery } from '@mui/material';
import { ProgramsHeader, ProgramsBottomNavigation } from '../program/ProgramsNavigation';

import Chat from '../Chat';

import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

const withLayoutFull = (Component: any) => {
	return function FullLayout(props: any) {
		const router = useRouter();
		const device = useDeviceDetect();
		const compactViewport = useMediaQuery('(max-width:767px)');

		/** LIFECYCLES **/

		/** HANDLERS **/

		if (router.pathname === '/program/detail' && compactViewport) {
			return (
				<>
					<Head>
						<title>GymFlow</title>
						<meta name={'title'} content={`GymFlow`} />
						<link
							rel="stylesheet"
							href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
						/>
					</Head>
					<Stack id="pc-wrap" className="program-discovery-layout program-detail-layout">
						<Stack id="top">
							<ProgramsHeader />
						</Stack>
						<Stack id="main" component="main">
							<Component {...props} />
						</Stack>
						<ProgramsBottomNavigation />
					</Stack>
				</>
			);
		}

		if (device == 'mobile') {
			return (
				<>
					<Head>
						<title>GymFlow</title>
						<meta name={'title'} content={`GymFlow`} />
					</Head>
					<Stack id="mobile-wrap" className={router.pathname === '/program/detail' ? 'program-detail-layout' : undefined}>
						<Stack id={'top'}>
							<Top />
						</Stack>

						<Stack id={'main'}>
							<Component {...props} />
						</Stack>

						<Stack id={'footer'}>
							<Footer />
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
					<Stack id="pc-wrap" className={router.pathname === '/program/detail' ? 'program-detail-layout' : undefined}>
						<Stack id={'top'}>
							<Top />
						</Stack>

						<Stack id={'main'}>
							<Component {...props} />
						</Stack>

						<Chat />

						<Stack id={'footer'}>
							<Footer />
						</Stack>
					</Stack>
				</>
			);
		}
	};
};

export default withLayoutFull;
