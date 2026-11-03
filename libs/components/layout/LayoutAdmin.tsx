import type { ComponentType } from 'react';
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { AppBar, Avatar, Drawer, IconButton, Toolbar, useMediaQuery } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuList from '../admin/AdminMenuList';
import { logOut } from '../../auth';
import { useReactiveVar } from '@apollo/client';
import { userVar, authReadyVar, authErrorVar } from '../../../apollo/store';
import { REACT_APP_API_URL } from '../../config';
import { adminWorkspaceAccess } from '../../admin-workspace';
import { adminWorkspaceLabels } from '../../admin-workspace-labels';

const drawerWidth = 280;

const withAdminLayout = (Component: ComponentType) => {
	return function AdminLayout(props: object) {
		const router = useRouter();
		const user = useReactiveVar(userVar);
		const authReady = useReactiveVar(authReadyVar);
		const authError = useReactiveVar(authErrorVar);
		const labels = adminWorkspaceLabels(router.locale);
		const permanentDrawer = useMediaQuery('(min-width:1200px)');
		const [mounted, setMounted] = useState(false);
		const [drawerOpen, setDrawerOpen] = useState(false);
		const [loggingOut, setLoggingOut] = useState(false);
		const logoutLock = useRef(false);
		const [, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
		const [, setTitle] = useState('admin');
		const access = adminWorkspaceAccess(mounted && router.isReady && authReady, authError, user);
		const section = router.pathname.split('/')[2];
		const sectionTitle =
			(
				{
					users: labels.users,
					'trainer-applications': labels.applications,
					'gym-access': labels.gymAccess,
					programs: labels.programs,
					gyms: labels.gyms,
					community: labels.community,
					profile: labels.profile,
				} as Record<string, string>
			)[section] ?? labels.users;

		useEffect(() => setMounted(true), []);
		useEffect(() => {
			const closeDrawer = () => setDrawerOpen(false);
			router.events.on('routeChangeComplete', closeDrawer);
			return () => router.events.off('routeChangeComplete', closeDrawer);
		}, [router.events]);
		useEffect(() => {
			if (permanentDrawer) setDrawerOpen(false);
		}, [permanentDrawer]);

		const logoutHandler = async () => {
			if (logoutLock.current) return;
			logoutLock.current = true;
			setLoggingOut(true);
			try {
				await logOut({ redirectToPublic: true });
			} finally {
				logoutLock.current = false;
				setLoggingOut(false);
			}
		};

		if (access !== 'ready')
			return (
				<main className="admin-access">
					{access === 'loading' ? (
						<p role="status">{labels.loading}</p>
					) : (
						<>
							<p role="alert">{access === 'session' ? labels.session : labels.forbidden}</p>
							<Link href={{ pathname: '/account/join', query: { referrer: router.asPath } }}>{labels.signIn}</Link>
						</>
					)}
				</main>
			);

		return (
			<main id="pc-wrap" className="admin admin-workspace">
				<Head>
					<title>
						{sectionTitle} · {labels.workspace} · GymFlow
					</title>
					<link
						href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
						rel="stylesheet"
					/>
				</Head>
				<div className="workspace-frame">
					<AppBar
						position="fixed"
						className="workspace-header"
						sx={{
							width: { xs: '100%', lg: 'calc(100% - ' + drawerWidth + 'px)' },
							ml: { xs: 0, lg: drawerWidth + 'px' },
						}}
					>
						<Toolbar>
							{!permanentDrawer && (
								<IconButton
									aria-label={labels.openMenu}
									sx={{ minWidth: 44, minHeight: 44 }}
									aria-controls="admin-navigation"
									aria-expanded={drawerOpen}
									onClick={() => setDrawerOpen(true)}
								>
									<MenuIcon />
								</IconButton>
							)}
							<div className="workspace-heading">
								<span>{labels.workspace}</span>
								<strong>{sectionTitle}</strong>
							</div>
							<div className="workspace-header-actions">
								<Link href="/" className="workspace-public" aria-label={labels.publicSite}>
									<OpenInNewRoundedIcon aria-hidden="true" />
									<span>{labels.publicSite}</span>
								</Link>
								<Link
									href="/_admin/profile"
									className="workspace-identity"
									aria-label={labels.profile + ': ' + user.memberNick}
								>
									<Avatar
										src={user.memberImage ? REACT_APP_API_URL + '/' + user.memberImage : '/img/profile/defaultUser.svg'}
										alt=""
									/>
									<span>{user.memberNick}</span>
								</Link>
							</div>
						</Toolbar>
					</AppBar>
					<Drawer
						variant={permanentDrawer ? 'permanent' : 'temporary'}
						open={permanentDrawer || drawerOpen}
						onClose={() => setDrawerOpen(false)}
						ModalProps={{ keepMounted: true, disablePortal: true }}
						PaperProps={{ id: 'admin-navigation', role: 'navigation', 'aria-label': labels.navigation }}
						sx={{
							width: permanentDrawer ? drawerWidth : undefined,
							flexShrink: 0,
							'& .MuiDrawer-paper': { width: drawerWidth, maxWidth: 'calc(100% - 24px)', boxSizing: 'border-box' },
						}}
						className="aside workspace-drawer"
					>
						<div className="workspace-brand">
							<Link href="/_admin" aria-label={'GymFlow · ' + labels.workspace}>
								<img src="/img/logo/logoText.svg" alt="" />
								<strong>GymFlow</strong>
							</Link>
							{!permanentDrawer && (
								<IconButton aria-label={labels.closeMenu} onClick={() => setDrawerOpen(false)}>
									<CloseRoundedIcon />
								</IconButton>
							)}
						</div>
						<p className="workspace-nav-label">{labels.management}</p>
						<MenuList onNavigate={() => setDrawerOpen(false)} />
						<div className="workspace-account">
							<p className="workspace-nav-label">{labels.account}</p>
							<Link
								href="/_admin/profile"
								className={'workspace-link' + (section === 'profile' ? ' on' : '')}
								aria-current={section === 'profile' ? 'page' : undefined}
								onClick={() => setDrawerOpen(false)}
							>
								<PersonOutlineRoundedIcon />
								<span>{labels.profile}</span>
							</Link>
							<Link href="/" className="workspace-link">
								<OpenInNewRoundedIcon />
								<span>{labels.publicSite}</span>
							</Link>
							<button type="button" className="workspace-link" onClick={logoutHandler} disabled={loggingOut}>
								<LogoutRoundedIcon />
								<span>{loggingOut ? labels.loggingOut : labels.logout}</span>
							</button>
						</div>
					</Drawer>
					<div id="bunker">
						{/* @ts-ignore Existing management pages receive these shell callbacks. */}
						<Component key={user._id} {...props} setSnackbar={setSnackbar} setTitle={setTitle} />
					</div>
				</div>
			</main>
		);
	};
};

export default withAdminLayout;
