import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useReactiveVar } from '@apollo/client';
import { Avatar, Box, Button, Divider, IconButton, Menu, MenuItem, useMediaQuery } from '@mui/material';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import { userVar } from '../../../apollo/store';
import { logOut } from '../../auth';
import { REACT_APP_API_URL } from '../../config';
import GlobalProgramSearch from '../GlobalProgramSearch';

const programDestinations = [
	{ label: 'Home', href: '/', icon: HomeOutlinedIcon },
	{ label: 'Programs', href: '/program', icon: GridViewOutlinedIcon },
	{ label: 'Trainers', href: '/trainer', icon: FitnessCenterOutlinedIcon },
	{ label: 'Community', href: '/community?articleCategory=FREE', icon: ForumOutlinedIcon },
	{ label: 'My Page', href: '/mypage', icon: AccountCircleOutlinedIcon },
];

const isDestinationActive = (pathname: string, href: string, category?: string | string[]) =>
	pathname === '/mypage' && (category === 'writeArticle' || category === 'editArticle' || category === 'myArticles') ? href === '/community?articleCategory=FREE' :
	pathname === href.split('?')[0] || (pathname === '/trainer/detail' && href === '/trainer') ||
	(pathname === '/program/booking' && href === '/program') ||
	(pathname === '/mypage/review' && href === '/mypage');

export const ProgramsHeader = () => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const isCompact = useMediaQuery('(max-width:1199px)');
	const shouldReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const [localeAnchor, setLocaleAnchor] = useState<HTMLElement | null>(null);
	const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
	const [navigationAnchor, setNavigationAnchor] = useState<HTMLElement | null>(null);
	const [searchHeight, setSearchHeight] = useState(0);
	const locale = router.locale ?? 'en';
	const memberName = user.memberFullName?.trim() || user.memberNick?.trim();
	const destinations = [
		...programDestinations.filter((destination) => destination.href !== '/mypage' || user._id),
		{ label: 'CS', href: '/help' },
	];

	useEffect(() => {
		if (!isCompact) setNavigationAnchor(null);
	}, [isCompact]);

	const languageChoiceHandler = async (event: React.MouseEvent<HTMLLIElement>) => {
		const nextLocale = event.currentTarget.id;
		localStorage.setItem('locale', nextLocale);
		setLocaleAnchor(null);
		await router.push(router.asPath, router.asPath, { locale: nextLocale });
	};

	return (
		<>
		<Box component={'header'} className={'programs-header mui-fixed'}>
			<Box component={'div'} className={'programs-header-inner'}>
				<Link href={'/'} passHref className={'programs-brand'} aria-label={t('Program navigation.GymFlow home')}>
					<Image src={'/img/logo/gymflow-mark.svg'} width={32} height={32} alt={''} />
					<span>GymFlow</span>
				</Link>
				<Box
					component={'nav'}
					className={'programs-desktop-links'}
					aria-label={t('Program navigation.Main navigation')}
				>
					{destinations.map(({ href, label }) => (
						<Link key={href} href={href} aria-current={isDestinationActive(router.pathname, href, router.query.category) ? 'page' : undefined}>
							{t(label)}
						</Link>
					))}
				</Box>
				<Box component={'div'} className={'programs-header-actions'}>
					<GlobalProgramSearch onDesktopHeightChange={setSearchHeight} />
					<Button
						id={'programs-language-button'}
						className={'programs-language-button'}
						aria-label={t('Program navigation.Language', { locale: locale.toUpperCase() })}
						aria-haspopup={'menu'}
						aria-expanded={Boolean(localeAnchor)}
						aria-controls={localeAnchor ? 'programs-language-menu' : undefined}
						onClick={(event) => setLocaleAnchor(event.currentTarget)}
						endIcon={<ExpandMoreRoundedIcon />}
					>
						{locale.toUpperCase()}
					</Button>
					{user._id ? (
						<IconButton
							id={'programs-account-button'}
							className={'programs-account-button'}
							aria-label={t('Program navigation.Account menu')}
							aria-haspopup={'menu'}
							aria-expanded={Boolean(accountAnchor)}
							aria-controls={accountAnchor ? 'programs-account-menu' : undefined}
							onClick={(event) => setAccountAnchor(event.currentTarget)}
						>
							<Avatar src={user.memberImage ? `${REACT_APP_API_URL}/${user.memberImage}` : undefined} alt={''}>
								{memberName ? Array.from(memberName)[0].toUpperCase() : <AccountCircleOutlinedIcon />}
							</Avatar>
						</IconButton>
					) : (
						<Link
							href={'/account/join'}
							passHref
							className={'programs-auth-link'}
							aria-label={`${t('Login')} / ${t('Register')}`}
						>
							<AccountCircleOutlinedIcon aria-hidden={true} />
							<span>
								{t('Login')} / {t('Register')}
							</span>
						</Link>
					)}
					<IconButton
						id={'programs-navigation-button'}
						className={'programs-navigation-button'}
						aria-label={t('Program navigation.Main menu')}
						aria-haspopup={'menu'}
						aria-expanded={Boolean(navigationAnchor)}
						aria-controls={navigationAnchor ? 'programs-navigation-menu' : undefined}
						onClick={(event) => setNavigationAnchor(event.currentTarget)}
					>
						<MenuRoundedIcon />
					</IconButton>
				</Box>
			</Box>
			<Menu
				id={'programs-language-menu'}
				transitionDuration={shouldReduceMotion ? 0 : undefined}
				className={'programs-navigation-menu'}
				anchorEl={localeAnchor}
				open={Boolean(localeAnchor)}
				onClose={() => setLocaleAnchor(null)}
				MenuListProps={{ 'aria-labelledby': 'programs-language-button' }}
			>
				{(['en', 'kr', 'ru'] as const).map((value) => (
					<MenuItem key={value} id={value} onClick={languageChoiceHandler} selected={locale === value}>
						{t(`Program navigation.${value}`)}
					</MenuItem>
				))}
			</Menu>
			<Menu
				id={'programs-account-menu'}
				transitionDuration={shouldReduceMotion ? 0 : undefined}
				className={'programs-navigation-menu'}
				anchorEl={accountAnchor}
				open={Boolean(accountAnchor) && Boolean(user._id)}
				onClose={() => setAccountAnchor(null)}
				MenuListProps={{ 'aria-labelledby': 'programs-account-button' }}
			>
				{memberName && (
					<MenuItem disabled className={'programs-account-name'}>
						{memberName}
					</MenuItem>
				)}
				{memberName && <Divider />}
				<MenuItem component={Link} href={'/mypage'} onClick={() => setAccountAnchor(null)}>
					<AccountCircleOutlinedIcon />
					{t('My Page')}
				</MenuItem>
				<MenuItem
					onClick={() => {
						setAccountAnchor(null);
						logOut();
					}}
				>
					<LogoutRoundedIcon />
					{t('Program navigation.Logout')}
				</MenuItem>
			</Menu>
			<Menu
				id={'programs-navigation-menu'}
				transitionDuration={shouldReduceMotion ? 0 : undefined}
				className={'programs-navigation-menu'}
				anchorEl={navigationAnchor}
				open={Boolean(navigationAnchor) && isCompact}
				onClose={() => setNavigationAnchor(null)}
				MenuListProps={{ 'aria-labelledby': 'programs-navigation-button' }}
			>
				{destinations.map(({ href, label }) => (
					<MenuItem
						key={href}
						component={Link}
						href={href}
						onClick={() => setNavigationAnchor(null)}
						aria-current={isDestinationActive(router.pathname, href, router.query.category) ? 'page' : undefined}
						selected={isDestinationActive(router.pathname, href, router.query.category)}
					>
						{t(label)}
					</MenuItem>
				))}
			</Menu>
		</Box>
		<div className="global-program-search-space" style={{ height: searchHeight }} aria-hidden={true} />
		</>
	);
};

export const ProgramsBottomNavigation = () => {
	const router = useRouter();
	const { t } = useTranslation('common');
	return (
		<Box
			component={'nav'}
			className={'programs-bottom-navigation'}
			aria-label={t('Program navigation.Mobile navigation')}
		>
			{programDestinations.map(({ href, label, icon: Icon }) => (
				<Link
					key={href}
					href={href}
					passHref
					aria-current={isDestinationActive(router.pathname, href, router.query.category) ? 'page' : undefined}
				>
					<Icon aria-hidden={true} />
					<span>{t(label)}</span>
				</Link>
			))}
		</Box>
	);
};
