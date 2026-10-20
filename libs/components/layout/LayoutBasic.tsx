import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import Head from 'next/head';
import Top from '../Top';
import Footer from '../Footer';
import { ProgramsBottomNavigation } from '../program/ProgramsNavigation';
import { Stack, useMediaQuery } from '@mui/material';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import { useReactiveVar } from '@apollo/client';
import { userVar } from '../../../apollo/store';

import { useTranslation } from 'next-i18next';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

const withLayoutBasic = (Component: any) => {
	return function BasicLayout(props: any) {
		const router = useRouter();
		const { t, i18n } = useTranslation('common');
		const device = useDeviceDetect();
		const user = useReactiveVar(userVar);
		const compactViewport = useMediaQuery('(max-width:767px)');
		const compactTrainer = compactViewport && router.pathname === '/trainer';
		const trainerDetail = router.pathname === '/trainer/detail';
		const compactTrainerDetail = compactViewport && trainerDetail;
		const authHeader = router.pathname === '/account/join';
		const communityDiscovery = router.pathname === '/community';
		const communityArticle = router.pathname === '/community/detail';
		const helpCenter = router.pathname === '/help';
		const communityWrite = router.pathname === '/mypage' && (router.query.category === 'writeArticle' || router.query.category === 'editArticle');
		const communityMyArticles = router.pathname === '/mypage' && router.query.category === 'myArticles';
		const trainerSchedule = router.pathname === '/mypage' && router.query.category === 'trainerSchedule';
		const trainerReservations = router.pathname === '/mypage' && router.query.category === 'trainerReservations';
		const trainerDashboard = router.pathname === '/mypage' && router.query.category === 'trainerDashboard';
		const trainerProfile = router.pathname === '/mypage' && user.memberType === 'TRAINER' &&
			(router.query.category == null || router.query.category === 'myProfile');
		const trainerPrograms = router.pathname === '/mypage' && router.query.category === 'myPrograms';
		const trainerProgramEditor = router.pathname === '/mypage' && user.memberType === 'TRAINER' &&
			router.query.category === 'addProgram';
		const userProfile = router.pathname === '/mypage' && (user.memberType === 'USER' || !user._id) &&
			(router.query.category == null || router.query.category === 'myProfile');
		const myBookings = (router.pathname === '/mypage' && router.query.category === 'myBookings') || router.pathname === '/mypage/review';
		const userFavorites = router.pathname === '/mypage' && router.query.category === 'myFavorites';
		const trainerApplication = router.pathname === '/mypage' && router.query.category === 'trainerApplication';
		const theme = useTheme();
		const programTheme = useMemo(() => {
			if (router.pathname !== '/program' && !helpCenter && !communityDiscovery && !communityArticle && !communityWrite && !communityMyArticles && !myBookings && !userProfile && !userFavorites && !trainerReservations && !trainerDashboard && !trainerProfile && !trainerPrograms && !trainerProgramEditor && !trainerApplication) return theme;
			const fontFamily = "'Plus Jakarta Sans', sans-serif";
			const typography = Object.fromEntries(
				Object.entries(theme.typography).map(([variant, value]) => [
					variant,
					typeof value === 'object' ? { ...value, fontFamily } : value,
				]),
			);
			return createTheme(theme, {
				palette: {
					primary: { main: '#EB6753', dark: '#A53425', contrastText: '#12151D' },
				},
				typography: { ...typography, fontFamily },
			});
		}, [theme, router.pathname, helpCenter, communityDiscovery, communityArticle, communityWrite, communityMyArticles, myBookings, userProfile, userFavorites, trainerReservations, trainerDashboard, trainerProfile, trainerPrograms, trainerProgramEditor, trainerApplication]);

		const memoizedValues = useMemo(() => {
			let title = '',
				desc = '',
				bgImage = '';

			switch (router.pathname) {
				case '/program':
					title = 'Program Search';
					desc = 'We are glad to see you again!';
					bgImage = '/img/banner/properties.png';
					break;
				case '/trainer':
					title = 'Trainers';
					desc = 'Home / Programs';
					bgImage = '/img/banner/agents.webp';
					break;
				case '/trainer/detail':
					title = 'Trainer Page';
					desc = 'Home / Programs';
					bgImage = '/img/banner/header2.svg';
					break;
				case '/mypage':
					title = 'my page';
					desc = 'Home / Programs';
					bgImage = '/img/banner/header1.svg';
					break;
				case '/community':
					title = 'Community';
					desc = 'Home / Programs';
					bgImage = '/img/banner/header2.svg';
					break;
				case '/community/detail':
					title = 'Community Detail';
					desc = 'Home / Programs';
					bgImage = '/img/banner/header2.svg';
					break;
				case '/cs':
					title = 'CS';
					desc = 'We are glad to see you again!';
					bgImage = '/img/banner/header2.svg';
					break;
				case '/account/join':
					title = 'Login/Signup';
					desc = 'Authentication Process';
					bgImage = '/img/banner/header2.svg';
					break;
				case '/member':
					title = 'Member Page';
					desc = 'Home / Programs';
					bgImage = '/img/banner/header1.svg';
					break;
				case '/about':
					title = 'About GymFlow';
					desc = 'Fitness for your goals';
					bgImage = '/img/banner/header2.svg';
					break;
				default:
					break;
			}

			return { title, desc, bgImage };
		}, [router.pathname]);

		/** LIFECYCLES **/

		/** HANDLERS **/
		if (authHeader) {
			return <ThemeProvider theme={theme}>
				<Head>
					<title>GymFlow</title>
					<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
					<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" />
				</Head>
				<main className="auth-layout"><Component {...props} /></main>
			</ThemeProvider>;
		}
		if (trainerSchedule || trainerReservations || trainerDashboard || trainerProfile || trainerPrograms || trainerProgramEditor) {
			return (
				<ThemeProvider theme={trainerSchedule ? theme : programTheme}>
					<Head>
						<title>GymFlow</title>
						<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" />
					</Head>
					<Stack id="pc-wrap" className={`trainer-schedule-layout${trainerReservations || trainerDashboard || trainerProfile || trainerPrograms || trainerProgramEditor ? ' trainer-reservations-layout' : ''}${trainerDashboard ? ' trainer-dashboard-layout' : ''}${trainerProfile ? ' trainer-profile-layout' : ''}${trainerPrograms ? ' trainer-programs-layout' : ''}${trainerProgramEditor ? ' trainer-program-editor-layout' : ''}`}>
						<Stack id="main" component="main"><Component {...props} /></Stack>
						<Stack id="footer" component="footer"><Footer variant="programs" /></Stack>
					</Stack>
				</ThemeProvider>
			);
		}

		if (router.pathname === '/program' || helpCenter || compactTrainer || trainerDetail || communityDiscovery || communityArticle || communityWrite || communityMyArticles || myBookings || userProfile || userFavorites || trainerApplication) {
			return (
				<ThemeProvider theme={programTheme}>
					<Head>
						<title>GymFlow</title>
						<meta name={'title'} content={`GymFlow`} />
						<link
							rel="stylesheet"
							href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
						/>
					</Head>
					<Stack
						id="pc-wrap"
						className={`program-discovery-layout${helpCenter ? ' help-center-layout' : ''}${compactTrainer || trainerDetail ? ' trainer-discovery-layout' : ''}${
							trainerDetail ? ' trainer-detail-layout' : ''
						}${device === 'mobile' || compactTrainer ? ' is-mobile' : ''}${communityDiscovery ? ' community-discovery-layout' : ''}${communityArticle ? ' community-article-layout' : ''}${communityWrite ? ' community-write-layout' : ''}${communityMyArticles ? ' community-my-articles-layout' : ''}${myBookings ? ' my-bookings-layout' : ''}${userProfile ? ' user-profile-layout' : ''}${userFavorites ? ' user-favorites-layout' : ''}`}
					>
						<Stack id={'top'}>
							<Top variant={'programs'} />
						</Stack>
						<Stack id={'main'} component="main">
							<Component {...props} />
						</Stack>
						<Stack id={'footer'} component={'footer'}>
							<Footer variant={compactTrainer || trainerDetail ? 'default' : 'programs'} />
						</Stack>
						{!communityDiscovery && !communityArticle && <ProgramsBottomNavigation />}
					</Stack>
				</ThemeProvider>
			);
		}

		if (device == 'mobile') {
			return (
				<>
					<Head>
						<title>GymFlow</title>
						<meta name={'title'} content={`GymFlow`} />
					</Head>
					<Stack id="mobile-wrap" className={router.pathname === '/trainer' ? 'trainer-discovery-layout' : undefined}>
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
					<Stack id="pc-wrap" className={router.pathname === '/cs' ? 'legacy-support-layout' : router.pathname === '/trainer' ? 'trainer-discovery-layout' : undefined}>
						<Stack id={'top'}>
							<Top />
						</Stack>

						{router.pathname !== '/trainer' && router.pathname !== '/cs' && (
							<Stack
								className={`header-basic ${authHeader && 'auth'}`}
								style={{
									backgroundImage: `url(${memoizedValues.bgImage})`,
									backgroundSize: 'cover',
									boxShadow: 'inset 10px 40px 150px 40px rgb(24 22 36)',
								}}
							>
								<Stack className={'container'}>
									<strong>{t(memoizedValues.title)}</strong>
									<span>{t(memoizedValues.desc)}</span>
								</Stack>
							</Stack>
						)}

						<Stack id={'main'}>
							<Component {...props} />
						</Stack>

						<Stack id={'footer'}>
							<Footer />
						</Stack>
					</Stack>
				</>
			);
		}
	};
};

export default withLayoutBasic;
