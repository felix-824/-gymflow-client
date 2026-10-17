import React from 'react';
import { Stack, Button } from '@mui/material';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { REACT_APP_API_URL } from '../../config';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PersonAddAltRoundedIcon from '@mui/icons-material/PersonAddAltRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useReactiveVar } from '@apollo/client';
import { userVar } from '../../../apollo/store';
import { PublicMember } from '../../types/member/member';

interface TrainerCardProps {
	trainer: PublicMember;
	likeMemberHandler: (user: any, id: string) => Promise<void>;
	followMemberHandler: (user: any, id: string, following: boolean) => Promise<void>;
	followPending: boolean;
}

const TrainerCard = (props: TrainerCardProps) => {
	const { trainer, likeMemberHandler, followMemberHandler, followPending } = props;
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const name = trainer.memberFullName?.trim() || trainer.memberNick;
	const nickname = trainer.memberNick?.trim();
	const fallback = '/img/profile/defaultUser.svg';
	const imagePath = trainer.memberImage?.trim() ? `${REACT_APP_API_URL}/${trainer.memberImage}` : fallback;
	const liked = Boolean(trainer.meLiked?.[0]?.myFavorite);
	const following = Boolean(user._id && trainer.meFollowed?.[0]?.myFollowing);
	const profileHref = { pathname: '/trainer/detail', query: { trainerId: trainer._id } };

	return (
		<Stack component={'article'} className={'trainer-discovery-card'}>
			<div className={'trainer-card-media'}>
				<Link
					passHref
					href={profileHref}
					className={'trainer-card-photo'}
					aria-label={t('Trainer discovery.View named profile', { name })}
				>
					<img
						src={imagePath}
						alt={name}
						loading={'lazy'}
						onError={(event) => {
							if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback;
						}}
					/>
				</Link>
				<Button
					className={'trainer-card-like'}
					aria-pressed={liked}
					aria-label={t(liked ? 'Trainer discovery.Unlike trainer' : 'Trainer discovery.Like trainer', { name })}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						void likeMemberHandler(user, trainer._id);
					}}
				>
					{liked ? <FavoriteIcon aria-hidden={'true'} /> : <FavoriteBorderIcon aria-hidden={'true'} />}
					<span>{trainer.memberLikes ?? 0}</span>
				</Button>
			</div>
			<div className={'trainer-card-body'}>
				<div className={'trainer-card-copy'}>
					<div className={'trainer-card-heading'}>
						<h2>
							<Link href={profileHref}>{name}</Link>
						</h2>
						{nickname && nickname !== name && <span className={'trainer-card-nickname'}>{nickname}</span>}
					</div>
					{trainer.memberDesc?.trim() && <p className={'trainer-card-description'}>{trainer.memberDesc}</p>}
				</div>
				<dl className={'trainer-card-stats'}>
					<div>
						<dt>{t('Trainer discovery.Programs')}</dt>
						<dd>{trainer.memberPrograms ?? 0}</dd>
					</div>
					<div>
						<dt>{t('Trainer discovery.Followers')}</dt>
						<dd>{trainer.memberFollowers ?? 0}</dd>
					</div>
					<div>
						<dt>{t('Trainer discovery.Views')}</dt>
						<dd>{trainer.memberViews ?? 0}</dd>
					</div>
				</dl>
				<div className={'trainer-card-actions'}>
					<Link href={profileHref} passHref className={'trainer-card-profile'}>
						{t('Trainer discovery.View Profile')}
						<ArrowForwardRoundedIcon aria-hidden={'true'} />
					</Link>
					{trainer._id !== user._id && (
						<Button
							className={'trainer-card-follow'}
							aria-pressed={following}
							aria-busy={followPending}
							aria-label={t(following ? 'Trainer discovery.Unfollow trainer' : 'Trainer discovery.Follow trainer', {
								name,
							})}
							disabled={followPending}
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								void followMemberHandler(user, trainer._id, following);
							}}
						>
							{following ? <CheckRoundedIcon aria-hidden={'true'} /> : <PersonAddAltRoundedIcon aria-hidden={'true'} />}
							<span>{t(following ? 'Trainer discovery.Following' : 'Trainer discovery.Follow')}</span>
						</Button>
					)}
				</div>
			</div>
		</Stack>
	);
};

export default TrainerCard;
