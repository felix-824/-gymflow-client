import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Avatar } from '@mui/material';
import { useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { userVar } from '../../../apollo/store';
import { REACT_APP_API_URL } from '../../config';

const workspaceDestinations = [
	{ label: 'Dashboard', icon: GridViewOutlinedIcon, category: 'trainerDashboard' },
	{ label: 'Programs', icon: FitnessCenterOutlinedIcon, category: 'myPrograms' },
	{ label: 'Schedule', icon: CalendarMonthOutlinedIcon, category: 'trainerSchedule' },
	{ label: 'Reservations', icon: EventNoteOutlinedIcon, category: 'trainerReservations' },
	{ label: 'Profile', icon: AccountCircleOutlinedIcon, category: 'myProfile' },
];

export function TrainerWorkspaceNavigation({
	active,
	mobile = false,
}: {
	active: 'Dashboard' | 'Programs' | 'Schedule' | 'Reservations' | 'Profile';
	mobile?: boolean;
}) {
	const { t } = useTranslation('common');
	return (
		<nav
			className={mobile ? 'schedule-mobile-navigation' : 'schedule-desktop-navigation'}
			aria-label={t('Trainer schedule.Navigation')}
		>
			{workspaceDestinations.map(({ label, icon: Icon, category }) =>
				category ? (
					<Link
						passHref
						key={label}
						href={{ pathname: '/mypage', query: { category } }}
						aria-current={label === active ? 'page' : undefined}
					>
						{mobile && <Icon aria-hidden="true" />}
						<span>{t(`Trainer schedule.${label}`)}</span>
					</Link>
				) : (
					<button key={label} type="button" disabled title={t('Trainer schedule.Not available')}>
						{mobile && <Icon aria-hidden="true" />}
						<span>{t(`Trainer schedule.${label}`)}</span>
					</button>
				),
			)}
		</nav>
	);
}

export function TrainerWorkspaceHeader({
	active,
}: {
	active: 'Dashboard' | 'Programs' | 'Schedule' | 'Reservations' | 'Profile';
}) {
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const name = user.memberFullName?.trim() || user.memberNick;
	return (
		<header className="schedule-workspace-header">
			<div className="schedule-workspace-header-inner">
				<Link href="/" passHref className="schedule-brand" aria-label={t('Program navigation.GymFlow home')}>
					<Image src="/img/logo/gymflow-mark.svg" width={24} height={24} alt="" />
					<span>GymFlow</span>
				</Link>
				<span className="schedule-workspace-label">
					<span className="schedule-desktop-copy">{t('Trainer schedule.Workspace')}</span>
					<span className="schedule-mobile-copy">{t('Trainer schedule.Workspace short')}</span>
				</span>
				<TrainerWorkspaceNavigation active={active} />
				<div className="schedule-workspace-account">
					<Link href="/" passHref className="schedule-member-view">
						<VisibilityOutlinedIcon aria-hidden="true" />
						{t('Trainer schedule.Member view')}
					</Link>
					<Link
						passHref
						href="/mypage?category=myProfile"
						className="schedule-identity"
						aria-label={`${t('Trainer schedule.Profile')}: ${name}`}
					>
						<span className="schedule-identity-name">{name}</span>
						<Avatar src={user.memberImage ? `${REACT_APP_API_URL}/${user.memberImage}` : undefined} alt="">
							{name ? Array.from(name)[0].toUpperCase() : <AccountCircleOutlinedIcon />}
						</Avatar>
					</Link>
				</div>
			</div>
		</header>
	);
}
