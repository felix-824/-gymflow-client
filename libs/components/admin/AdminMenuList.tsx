import React, { useEffect, useState } from 'react';
import { useRouter, withRouter } from 'next/router';
import Link from 'next/link';
import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { Buildings, ChatsCircle, User, UserCircleGear } from 'phosphor-react';
import cookies from 'js-cookie';
import enApplications from '../../../public/locales/en/admin-trainer-applications.json';
import krApplications from '../../../public/locales/kr/admin-trainer-applications.json';
import ruApplications from '../../../public/locales/ru/admin-trainer-applications.json';
import { adminTrainerApplicationsRoute } from '../../admin-trainer-applications';
import enGyms from '../../../public/locales/en/admin-gyms.json';
import krGyms from '../../../public/locales/kr/admin-gyms.json';
import ruGyms from '../../../public/locales/ru/admin-gyms.json';

const AdminMenuList = (props: any) => {
	const router = useRouter();
	const applicationLabels =
		router.locale === 'kr' ? krApplications : router.locale === 'ru' ? ruApplications : enApplications;
	const gymLabels = router.locale === 'kr' ? krGyms : router.locale === 'ru' ? ruGyms : enGyms;
	const gymsRoute = '/_admin/gyms';
	const gymsActive = router.pathname === gymsRoute || router.pathname.startsWith(gymsRoute + '/');
	const [openMenu] = useState(typeof window === 'object' ? cookies.get('admin_menu') === 'true' : false);
	const [clickMenu, setClickMenu] = useState<any>([]);
	const [clickSubMenu, setClickSubMenu] = useState('');

	const {
		router: { pathname },
	} = props;

	/** LIFECYCLES **/
	useEffect(() => {
		const pathnames = pathname.split('/').filter(Boolean);

		switch (pathnames[1]) {
			case 'trainer-applications':
			case 'gyms':
				setClickMenu([]);
				break;
			case 'programs':
				setClickMenu(['Programs']);
				break;
			case 'community':
				setClickMenu(['Community']);
				break;
			case 'cs':
				setClickMenu(['Cs']);
				break;
			default:
				setClickMenu(['Users']);
				break;
		}

		switch (pathnames[2]) {
			case 'logs':
				setClickSubMenu('Logs');
				break;
			case 'inquiry':
				setClickSubMenu('1:1 Inquiry');
				break;
			case 'notice':
				setClickSubMenu('Notice');
				break;
			case 'faq':
				setClickSubMenu('FAQ');
				break;
			case 'board_create':
				setClickSubMenu('Board Create');
				break;
			default:
				setClickSubMenu('List');
				break;
		}
	}, [pathname]);

	/** HANDLERS **/
	const subMenuChangeHandler = (target: string) => {
		if (clickMenu.find((item: string) => item === target)) {
			setClickMenu(clickMenu.filter((menu: string) => target !== menu));
		} else {
			setClickMenu([...clickMenu, target]);
		}
	};

	const menu_set = [
		{
			title: 'Users',
			icon: <User size={20} color="#bdbdbd" weight="fill" />,
			on_click: () => subMenuChangeHandler('Users'),
		},
		{
			title: 'Programs',
			icon: <UserCircleGear size={20} color="#bdbdbd" weight="fill" />,
			on_click: () => subMenuChangeHandler('Programs'),
		},
		{
			title: 'Gyms',
			icon: <Buildings size={20} color="#bdbdbd" weight="fill" />,
		},
		{
			title: 'Community',
			icon: <ChatsCircle size={20} color="#bdbdbd" weight="fill" />,
			on_click: () => subMenuChangeHandler('Community'),
		},
	];

	const sub_menu_set: any = {
		Users: [{ title: 'List', url: '/_admin/users' }],
		Programs: [{ title: 'List', url: '/_admin/programs' }],
		Community: [{ title: 'List', url: '/_admin/community' }],
	};

	return (
		<>
			<List className="menu_wrap" disablePadding>
				<Link href={adminTrainerApplicationsRoute} passHref legacyBehavior>
					<ListItemButton
						component="a"
						onClick={props.onNavigate}
						className={router.pathname.startsWith(adminTrainerApplicationsRoute) ? 'menu on' : 'menu'}
						aria-current={router.pathname.startsWith(adminTrainerApplicationsRoute) ? 'page' : undefined}
						sx={{ minHeight: 48, px: 2.5 }}
					>
						<ListItemIcon>
							<UserCircleGear size={20} color="#bdbdbd" weight="fill" />
						</ListItemIcon>
						<ListItemText primary={applicationLabels.Title} />
					</ListItemButton>
				</Link>
			</List>
			{menu_set.map((item, index) =>
				item.title === 'Gyms' ? (
					<List className="menu_wrap" key={item.title} disablePadding>
						<Link href={gymsRoute} passHref legacyBehavior>
							<ListItemButton
								component="a"
								onClick={props.onNavigate}
								className={gymsActive ? 'menu on' : 'menu'}
								aria-current={gymsActive ? 'page' : undefined}
								sx={{ minHeight: 48, px: 2.5 }}
							>
								<ListItemIcon>{item.icon}</ListItemIcon>
								<ListItemText primary={gymLabels.navigation.title} />
							</ListItemButton>
						</Link>
					</List>
				) : (
					<List className={'menu_wrap'} key={index} disablePadding>
						<ListItemButton
							onClick={item.on_click}
							component="button"
							type="button"
							aria-expanded={clickMenu.includes(item.title)}
							className={clickMenu[0] === item.title ? 'menu on' : 'menu'}
							sx={{
								minHeight: 48,
								width: '100%',
								justifyContent: openMenu ? 'initial' : 'center',
								px: 2.5,
							}}
						>
							<ListItemIcon
								sx={{
									minWidth: 0,
									mr: openMenu ? 3 : 'auto',
									justifyContent: 'center',
								}}
							>
								{item.icon}
							</ListItemIcon>
							<ListItemText>{item.title}</ListItemText>
							{clickMenu.find((menu: string) => item.title === menu) ? <ExpandLess /> : <ExpandMore />}
						</ListItemButton>
						<Collapse
							in={!!clickMenu.find((menu: string) => menu === item.title)}
							className="menu"
							timeout="auto"
							component="li"
							unmountOnExit
						>
							<List className="menu-list" disablePadding>
								{sub_menu_set[item.title] &&
									sub_menu_set[item.title].map((sub: any, i: number) => (
										<Link href={sub.url} shallow={true} replace={true} key={i} passHref legacyBehavior>
											<ListItemButton
												component="a"
												onClick={props.onNavigate}
												className={clickMenu[0] === item.title && clickSubMenu === sub.title ? 'li on' : 'li'}
											>
												<Typography variant={sub.title} component={'span'}>
													{sub.title}
												</Typography>
											</ListItemButton>
										</Link>
									))}
							</List>
						</Collapse>
					</List>
				),
			)}
		</>
	);
};

export default withRouter(AdminMenuList);
