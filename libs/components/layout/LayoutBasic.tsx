import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import Head from 'next/head';
import Top from '../Top';
import Footer from '../Footer';
import { ProgramsBottomNavigation } from '../program/ProgramsNavigation';
import { Stack, useMediaQuery } from '@mui/material';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';

import Chat from '../Chat';

import { useTranslation } from 'next-i18next';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

const withLayoutBasic = (Component: any) => {
	return function BasicLayout(props: any) {
		const router = useRouter();
		const { t, i18n } = useTranslation('common');
		const device = useDeviceDetect();
		const compactViewport = useMediaQuery('(max-width:767px)');
		const compactTrainer = compactViewport && router.pathname === '/trainer';
		const trainerDetail = router.pathname === '/trainer/detail';
		const compactTrainerDetail = compactViewport && trainerDetail;
		const authHeader = router.pathname === '/account/join';
		const communityDiscovery = router.pathname === '/community';
		const communityArticle = router.pathname === '/community/detail';
		const theme = useTheme();
		const programTheme = useMemo(() => {
			if (router.pathname !== '/program' && !communityDiscovery && !communityArticle) return theme;
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
		}, [theme, router.pathname, communityDiscovery, communityArticle]);

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
		useEffect(() => {
			if (!compactTrainer && !compactTrainerDetail) return;
			const layout = document.querySelector<HTMLElement>('.trainer-discovery-layout');
			if (!layout) return;
			let frame = 0;
			const positionChat = () => {
				const navigation = layout.querySelector('.programs-bottom-navigation')?.getBoundingClientRect();
				const button = layout.querySelector('.chat-button')?.getBoundingClientRect();
				const height = button?.height || 50;
				const left = button?.left ?? window.innerWidth - 66;
				const right = button?.right ?? window.innerWidth - 16;
				let top = (navigation?.top ?? window.innerHeight - 88) - 16 - height;
				const obstacles = Array.from(layout.querySelectorAll('.trainer-card-actions, #footer'))
					.map((element) => element.getBoundingClientRect())
					.sort((a, b) => b.top - a.top);
				obstacles.forEach((rect) => {
					if (rect.left < right && rect.right > left && rect.top < top + height + 8 && rect.bottom > top - 8) {
						top = rect.top - height - 8;
					}
				});
				layout.style.setProperty('--trainer-chat-bottom', `${window.innerHeight - top - height}px`);
			};
			const schedulePosition = () => {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(positionChat);
			};
			const observer = new ResizeObserver(schedulePosition);
			layout.querySelectorAll('#main, #footer, .programs-bottom-navigation').forEach((element) => observer.observe(element));
			window.addEventListener('scroll', schedulePosition, { passive: true });
			window.addEventListener('resize', schedulePosition);
			schedulePosition();
			return () => {
				cancelAnimationFrame(frame);
				observer.disconnect();
				window.removeEventListener('scroll', schedulePosition);
				window.removeEventListener('resize', schedulePosition);
				layout.style.removeProperty('--trainer-chat-bottom');
			};
		}, [compactTrainer, compactTrainerDetail]);

		/** HANDLERS **/

		if (router.pathname === '/program' || compactTrainer || trainerDetail || communityDiscovery || communityArticle) {
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
						className={`program-discovery-layout${compactTrainer || trainerDetail ? ' trainer-discovery-layout' : ''}${
							trainerDetail ? ' trainer-detail-layout' : ''
						}${device === 'mobile' || compactTrainer ? ' is-mobile' : ''}${communityDiscovery ? ' community-discovery-layout' : ''}${communityArticle ? ' community-article-layout' : ''}`}
					>
						<Stack id={'top'}>
							<Top variant={'programs'} />
						</Stack>
						<Stack id={'main'} component="main">
							<Component {...props} />
						</Stack>
						{device !== 'mobile' && <Chat />}
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
					<Stack id="pc-wrap" className={router.pathname === '/trainer' ? 'trainer-discovery-layout' : undefined}>
						<Stack id={'top'}>
							<Top />
						</Stack>

						{router.pathname !== '/trainer' && (
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

export default withLayoutBasic;
