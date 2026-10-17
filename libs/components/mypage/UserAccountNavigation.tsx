import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';

const destinations = [
	{ label: 'My Bookings', mobile: 'Bookings', category: 'myBookings', Icon: EventNoteOutlinedIcon },
	{ label: 'Favorites', mobile: 'Favorites', category: 'myFavorites', Icon: FavoriteBorderRoundedIcon },
	{ label: 'My Articles', mobile: 'My Articles', category: 'myArticles', Icon: ArticleOutlinedIcon },
	{ label: 'Profile', mobile: 'Profile', category: 'myProfile', Icon: PersonOutlineRoundedIcon },
];

const UserAccountNavigation = ({ active }: { active: 'My Bookings' | 'Favorites' | 'My Articles' | 'Profile' }) => {
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
					<span className="user-profile-desktop-copy">
						{t(category === 'myArticles' ? 'My articles.Title' : `User profile.${label}`)}
					</span>
					<span className="user-profile-mobile-copy">
						{t(category === 'myArticles' ? 'My articles.Title' : `User profile.${mobile}`)}
					</span>
				</Link>
			))}
		</nav>
	);
};

export default UserAccountNavigation;
