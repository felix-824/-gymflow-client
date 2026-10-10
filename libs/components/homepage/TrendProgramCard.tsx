import React, { useState } from 'react';
import { Stack, Box, Typography } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useReactiveVar } from '@apollo/client';
import { Program } from '../../types/program/program';
import { ProgramType } from '../../enums/program.enum';
import { REACT_APP_API_URL } from '../../config';
import { formatterStr } from '../../utils';
import { userVar } from '../../../apollo/store';

interface TrendProgramCardProps {
	program: Program;
	likeProgramHandler: any;
}

const TrendProgramCard = (props: TrendProgramCardProps) => {
	const { program, likeProgramHandler } = props;
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const [failedImage, setFailedImage] = useState('');
	const imageSrc = program.programImages?.[0] ? `${REACT_APP_API_URL}/${program.programImages[0]}` : '';
	const isLiked = Boolean(program.meLiked?.[0]?.myFavorite);
	const detailHref = { pathname: '/program/detail', query: { id: program._id } };
	const description = program.programDesc?.trim();

	return (
		<Stack component={'article'} className={'trend-card-box'}>
			<Box component={'div'} className={'card-media'}>
				<Link href={detailHref} className={'card-img'} aria-label={t('View program', { name: program.programName })}>
					{imageSrc && imageSrc !== failedImage ? (
						<Box
							component={'img'}
							src={imageSrc}
							alt=""
							loading="lazy"
							width={300}
							height={190}
							onError={() => setFailedImage(imageSrc)}
						/>
					) : (
						<Box component={'span'} className={'image-fallback'} aria-hidden={true}>
							<FitnessCenterOutlinedIcon />
						</Box>
					)}
				</Link>
				<Box component={'span'} className={'category-badge'}>
					{t(program.programCategory)}
				</Box>
				<IconButton
					className={`like-button${isLiked ? ' is-liked' : ''}`}
					aria-label={t(isLiked ? 'Unlike program' : 'Like program', { name: program.programName })}
					aria-pressed={isLiked}
					onClick={() => likeProgramHandler(user, program._id)}
				>
					{isLiked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
				</IconButton>
			</Box>
			<Box component={'div'} className={'info'}>
				<Typography component={'p'} className={'program-type'}>
					{t(program.programType)}
				</Typography>
				<Typography component={'h3'} className={'title'}>
					<Link href={detailHref}>{program.programName}</Link>
				</Typography>
				<Typography component={'p'} className={'program-location'}>
					<LocationOnOutlinedIcon />
					<span>{t(program.programType === ProgramType.ONLINE ? 'ONLINE' : program.programLocation)}</span>
				</Typography>
				{description && (
					<Typography component={'p'} className={'desc'}>
						{description}
					</Typography>
				)}
				<Box component={'div'} className={'session-details'}>
					<span>
						<ScheduleOutlinedIcon />
						{t('Session duration', { duration: program.programDuration })}
					</span>
					<span>
						<GroupsOutlinedIcon />
						{t('Session capacity', { capacity: program.programCapacity })}
					</span>
				</Box>
				<Box component={'div'} className={'card-footer'}>
					<Typography component={'p'} className={'program-price'}>
						<strong>₩{formatterStr(program.programPrice)}</strong>
						<span>{t('Per session')}</span>
					</Typography>
					<Box component={'div'} className={'engagement'}>
						<span aria-label={t('Program views', { views: program.programViews })}>
							<RemoveRedEyeOutlinedIcon />
							{formatterStr(program.programViews)}
						</span>
						<span aria-label={t('Program likes', { likes: program.programLikes })}>
							<FavoriteBorderIcon />
							{formatterStr(program.programLikes)}
						</span>
					</Box>
				</Box>
			</Box>
		</Stack>
	);
};

export default TrendProgramCard;
