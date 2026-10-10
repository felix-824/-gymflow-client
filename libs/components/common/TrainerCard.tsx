import React from 'react';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Stack, Box, Typography } from '@mui/material';
import Link from 'next/link';
import { REACT_APP_API_URL } from '../../config';
import IconButton from '@mui/material/IconButton';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { useReactiveVar } from '@apollo/client';
import { userVar } from '../../../apollo/store';

interface TrainerCardProps {
	trainer: any;
	likeMemberHandler: any;
}

const TrainerCard = (props: TrainerCardProps) => {
	const { trainer, likeMemberHandler } = props;
	const device = useDeviceDetect();
	const user = useReactiveVar(userVar);
	const imagePath: string = trainer?.memberImage
		? `${REACT_APP_API_URL}/${trainer?.memberImage}`
		: '/img/profile/defaultUser.svg';

	if (device === 'mobile') {
		return <div>TRAINER CARD</div>;
	} else {
		return (
			<Stack className="trainer-general-card">
				<Link
					href={{
						pathname: '/trainer/detail',
						query: { trainerId: trainer?._id },
					}}
				>
					<Box
						component={'div'}
						className={'trainer-img'}
						style={{
							backgroundImage: `url(${imagePath})`,
							backgroundSize: 'cover',
							backgroundPosition: 'center',
							backgroundRepeat: 'no-repeat',
						}}
					>
						<div>{trainer?.memberPrograms} programs</div>
					</Box>
				</Link>

				<Stack className={'trainer-desc'}>
					<Box component={'div'} className={'trainer-info'}>
						<Link
							href={{
								pathname: '/trainer/detail',
								query: { trainerId: trainer?._id },
							}}
						>
							<strong>{trainer?.memberFullName ?? trainer?.memberNick}</strong>
						</Link>
						<span>Trainer</span>
					</Box>
					<Box component={'div'} className={'buttons'}>
						<IconButton color={'default'}>
							<RemoveRedEyeIcon />
						</IconButton>
						<Typography className="view-cnt">{trainer?.memberViews}</Typography>
						<IconButton color={'default'} onClick={() => likeMemberHandler(user, trainer?._id)}>
							{trainer?.meLiked && trainer?.meLiked[0]?.myFavorite ? (
								<FavoriteIcon color={'primary'} />
							) : (
								<FavoriteBorderIcon />
							)}
						</IconButton>
						<Typography className="view-cnt">{trainer?.memberLikes}</Typography>
					</Box>
				</Stack>
			</Stack>
		);
	}
};

export default TrainerCard;
