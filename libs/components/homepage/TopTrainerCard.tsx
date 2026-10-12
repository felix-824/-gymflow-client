import React from 'react';
import Link from 'next/link';
import { Stack } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { useTranslation } from 'next-i18next';
import { REACT_APP_API_URL } from '../../config';
import { Member } from '../../types/member/member';

interface TopTrainerProps {
	trainer: Member;
}

const TopTrainerCard = ({ trainer }: TopTrainerProps) => {
	const { t } = useTranslation('common');
	const name = trainer.memberFullName?.trim() || trainer.memberNick;
	const nickname = trainer.memberNick?.trim();
	const fallback = '/img/profile/defaultUser.svg';
	const trainerImage = trainer.memberImage?.trim() ? `${REACT_APP_API_URL}/${trainer.memberImage}` : fallback;
	const profileHref = { pathname: '/trainer/detail', query: { trainerId: trainer._id } };

	return (
		<Stack component={'article'} className={'home-trainer-card'}>
			<Link
				href={profileHref}
				passHref
				className={'home-trainer-photo'}
				aria-label={t('Trainer discovery.View named profile', { name })}
			>
				<img
					src={trainerImage}
					alt={name}
					loading={'lazy'}
					onError={(event) => {
						if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback;
					}}
				/>
			</Link>
			<div className={'home-trainer-body'}>
				<div className={'home-trainer-copy'}>
					<div className={'home-trainer-heading'}>
						<h3>
							<Link href={profileHref}>{name}</Link>
						</h3>
						{nickname && nickname !== name && <span>{nickname}</span>}
					</div>
					{trainer.memberAddress?.trim() && (
						<p className={'home-trainer-address'}>
							<LocationOnOutlinedIcon aria-hidden={true} />
							<span>{trainer.memberAddress}</span>
						</p>
					)}
					{trainer.memberDesc?.trim() && <p className={'home-trainer-description'}>{trainer.memberDesc}</p>}
				</div>
				<dl className={'home-trainer-stats'}>
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
				<Link href={profileHref} passHref className={'home-trainer-profile'}>
					{t('Trainer discovery.View Profile')}
					<ArrowForwardRoundedIcon aria-hidden={true} />
				</Link>
			</div>
		</Stack>
	);
};

export default TopTrainerCard;
