import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';

const destinations = [
	{ label: 'My Bookings', mobile: 'Bookings', category: 'myBookings', Icon: EventNoteOutlinedIcon },
	{ label: 'Favorites', mobile: 'Favorites', category: 'myFavorites', Icon: FavoriteBorderRoundedIcon },
	{ label: 'Profile', mobile: 'Profile', category: 'myProfile', Icon: PersonOutlineRoundedIcon },
];

const UserAccountNavigation = ({ active }: { active: 'My Bookings' | 'Favorites' | 'Profile' }) => {
	const { t } = useTranslation('common');
	return (
		<nav className="user-account-navigation" aria-label={t('User profile.Account navigation')}>
			{destinations.map(({ label, mobile, category, Icon }) => (
				<Link
					passHref
					key={category}
					href={{ pathname: '/mypage', query: { category } }}
					aria-current={label === active ? 'page' : undefined}
				>
					<Icon aria-hidden="true" />
					<span className="user-profile-desktop-copy">{t(`User profile.${label}`)}</span>
					<span className="user-profile-mobile-copy">{t(`User profile.${mobile}`)}</span>
				</Link>
			))}
		</nav>
	);
};

export default UserAccountNavigation;
