import type { ComponentType } from 'react';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import MenuList from '../admin/AdminMenuList';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { Menu, MenuItem, useMediaQuery } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Drawer from '@mui/material/Drawer';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { logOut } from '../../auth';
import { useReactiveVar } from '@apollo/client';
import { userVar, authReadyVar, authErrorVar } from '../../../apollo/store';
import { REACT_APP_API_URL } from '../../config';
import { MemberType } from '../../enums/member.enum';
import enGyms from '../../../public/locales/en/admin-gyms.json';
import krGyms from '../../../public/locales/kr/admin-gyms.json';
import ruGyms from '../../../public/locales/ru/admin-gyms.json';
const drawerWidth = 280;

const withAdminLayout = (Component: ComponentType) => {
	return function AdminLayout(props: object) {
		const router = useRouter();
		const user = useReactiveVar(userVar);
		const authReady = useReactiveVar(authReadyVar);
		const authError = useReactiveVar(authErrorVar);
		const gymRoute = router.pathname === '/_admin/gyms' || router.pathname.startsWith('/_admin/gyms/');
		const permanentDrawer = useMediaQuery('(min-width:1200px)');
		const [drawerOpen, setDrawerOpen] = useState(false);
		const navigation = (router.locale === 'kr' ? krGyms : router.locale === 'ru' ? ruGyms : enGyms).navigation;
		const [anchorElUser, setAnchorElUser] = React.useState<null | HTMLElement>(null);
		const [openMenu, setOpenMenu] = useState(false);
		const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
		const [title, setTitle] = useState('admin');
		const [loading, setLoading] = useState(true);

		/** LIFECYCLES **/
		useEffect(() => {
			setLoading(false);
		}, []);

		useEffect(() => {
			const closeDrawer = () => setDrawerOpen(false);
			router.events.on('routeChangeComplete', closeDrawer);
			return () => router.events.off('routeChangeComplete', closeDrawer);
		}, [router.events]);

		useEffect(() => {
			if (permanentDrawer) setDrawerOpen(false);
		}, [permanentDrawer]);

		useEffect(() => {
			if (!gymRoute && authReady && !authError && !loading && user.memberType !== MemberType.ADMIN) {
				router.push('/').then();
			}
		}, [authReady, authError, loading, user, router, gymRoute]);

		/** HANDLERS **/
		const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
			setAnchorElUser(event.currentTarget);
		};

		const handleCloseUserMenu = () => {
			setAnchorElUser(null);
		};

		const logoutHandler = () => {
			setDrawerOpen(false);
			logOut();
			router.push('/').then();
		};

		if (gymRoute && (authError || !authReady || !user._id || user.memberType !== MemberType.ADMIN))
			return <Component {...props} />;
		if (authError) return <p role="alert">{authError}</p>;
		if (!authReady || !user || user?.memberType !== MemberType.ADMIN) return null;

		return (
			<main id="pc-wrap" className="admin">
				<Box component={'div'} sx={{ display: 'flex' }}>
					<AppBar
						position="fixed"
						sx={{
							width: { xs: '100%', lg: `calc(100% - ${drawerWidth}px)` },
							ml: { xs: 0, lg: `${drawerWidth}px` },
							boxShadow: 'rgb(100 116 139 / 12%) 0px 1px 4px',
							background: 'none',
						}}
					>
						<Toolbar sx={{ width: '100%', justifyContent: { xs: 'space-between', lg: 'flex-end' } }}>
							{!permanentDrawer && (
								<IconButton
									aria-label={navigation.openMenu}
									aria-controls="admin-navigation"
									aria-expanded={drawerOpen}
									onClick={() => setDrawerOpen(true)}
									sx={{ minWidth: 44, minHeight: 44 }}
								>
									<MenuIcon />
								</IconButton>
							)}
							<Tooltip title="Open settings">
								<IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
									<Avatar
										src={
											user?.memberImage ? `${REACT_APP_API_URL}/${user?.memberImage}` : '/img/profile/defaultUser.svg'
										}
									/>
								</IconButton>
							</Tooltip>
							<Menu
								sx={{ mt: '45px' }}
								id="menu-appbar"
								className={'pop-menu'}
								anchorEl={anchorElUser}
								anchorOrigin={{
									vertical: 'top',
									horizontal: 'right',
								}}
								keepMounted
								transformOrigin={{
									vertical: 'top',
									horizontal: 'right',
								}}
								open={Boolean(anchorElUser)}
								onClose={handleCloseUserMenu}
							>
								<Box
									component={'div'}
									onClick={handleCloseUserMenu}
									sx={{
										width: '200px',
									}}
								>
									<Stack sx={{ px: '20px', my: '12px' }}>
										<Typography variant={'h6'} component={'h6'} sx={{ mb: '4px' }}>
											{user?.memberNick}
										</Typography>
										<Typography variant={'subtitle1'} component={'p'} color={'#757575'}>
											{user?.memberPhone}
										</Typography>
									</Stack>
									<Divider />
									<Box component={'div'} sx={{ p: 1, py: '6px' }} onClick={logoutHandler}>
										<MenuItem sx={{ px: '16px', py: '6px' }}>
											<Typography variant={'subtitle1'} component={'span'}>
												Logout
											</Typography>
										</MenuItem>
									</Box>
								</Box>
							</Menu>
						</Toolbar>
					</AppBar>

					<Drawer
						sx={{
							width: permanentDrawer ? drawerWidth : undefined,
							flexShrink: 0,
							'& .MuiDrawer-paper': {
								width: drawerWidth,
								maxWidth: 'calc(100% - 24px)',
								boxSizing: 'border-box',
							},
						}}
						variant={permanentDrawer ? 'permanent' : 'temporary'}
						open={permanentDrawer || drawerOpen}
						onClose={() => setDrawerOpen(false)}
						ModalProps={{ keepMounted: true, disablePortal: true }}
						PaperProps={{ id: 'admin-navigation', role: 'navigation', 'aria-label': navigation.menu }}
						anchor="left"
						className="aside"
					>
						<Toolbar sx={{ flexDirection: 'column', alignItems: 'flexStart' }}>
							<Stack className={'logo-box'}>
								<img src={'/img/logo/logoText.svg'} alt={'GymFlow'} className={'gymflow-logo'} />
							</Stack>

							<Stack
								className="user"
								direction={'row'}
								alignItems={'center'}
								sx={{
									bgcolor: openMenu ? 'rgba(255, 255, 255, 0.04)' : 'none',
									borderRadius: '8px',
									px: '24px',
									py: '11px',
								}}
							>
								<Avatar
									src={user?.memberImage ? `${REACT_APP_API_URL}/${user?.memberImage}` : '/img/profile/defaultUser.svg'}
								/>
								<Typography variant={'body2'} p={1} ml={1}>
									{user?.memberNick} <br />
									{user?.memberPhone}
								</Typography>
							</Stack>
						</Toolbar>

						<Divider />

						<MenuList onNavigate={() => setDrawerOpen(false)} />
					</Drawer>

					<Box component={'div'} id="bunker" sx={{ flexGrow: 1 }}>
						{/*@ts-ignore*/}
						<Component {...props} setSnackbar={setSnackbar} setTitle={setTitle} />
					</Box>
				</Box>
			</main>
		);
	};
};

export default withAdminLayout;
