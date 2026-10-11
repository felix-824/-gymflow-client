import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import React, { useState } from 'react';
import { Avatar, Stack, Typography, Box } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { Program } from '../../types/program/program';
import Link from 'next/link';
import { formatterStr } from '../../utils';
import { REACT_APP_API_URL, topProgramRank } from '../../config';
import { useReactiveVar } from '@apollo/client';
import { userVar } from '../../../apollo/store';
import IconButton from '@mui/material/IconButton';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useTranslation } from 'next-i18next';
import { ProgramType } from '../../enums/program.enum';

interface ProgramCardType {
	program: Program;
	likeProgramHandler?: any;
	myFavorites?: boolean;
	recentlyVisited?: boolean;
	variant?: 'default' | 'discovery' | 'related';
}

const ProgramCard = (props: ProgramCardType) => {
	const { program, likeProgramHandler, myFavorites, recentlyVisited, variant = 'default' } = props;
	const device = useDeviceDetect();
	const user = useReactiveVar(userVar);

	if (variant === 'discovery' || variant === 'related') {
		return <DiscoveryProgramCard program={program} likeProgramHandler={likeProgramHandler} variant={variant} />;
	}

	const imagePath: string = program?.programImages[0]
		? `${REACT_APP_API_URL}/${program?.programImages[0]}`
		: '/img/banner/header1.svg';

	if (device === 'mobile') {
		return <div>PROGRAM CARD</div>;
	} else {
		return (
			<Stack className="card-config">
				<Stack className="top">
					<Link
						href={{
							pathname: '/program/detail',
							query: { id: program?._id },
						}}
					>
						<img src={imagePath} alt="" />
					</Link>
					{program && program?.programRank > topProgramRank && (
						<Box component={'div'} className={'top-badge'}>
							<img src="/img/icons/electricity.svg" alt="" />
							<Typography>TOP</Typography>
						</Box>
					)}
					<Box component={'div'} className={'price-box'}>
						<Typography>₩{formatterStr(program?.programPrice)} /session</Typography>
					</Box>
				</Stack>
				<Stack className="bottom">
					<Stack className="name-address">
						<Stack className="name">
							<Link
								href={{
									pathname: '/program/detail',
									query: { id: program?._id },
								}}
							>
								<Typography>{program.programName}</Typography>
							</Link>
						</Stack>
						<Stack className="address">
							<Typography>
								{program.programType === 'ONLINE'
									? 'Online'
									: [program.programAddress, program.programLocation].filter(Boolean).join(', ')}
							</Typography>
						</Stack>
					</Stack>
					<Stack className="options">
						<Stack className="option">
							<GroupsOutlinedIcon fontSize="small" />{' '}
							<Typography>{program.programCapacity} participants/session</Typography>
						</Stack>
						<Stack className="option">
							<FitnessCenterOutlinedIcon fontSize="small" /> <Typography>{program.programCategory}</Typography>
						</Stack>
						<Stack className="option">
							<ScheduleOutlinedIcon fontSize="small" /> <Typography>{program.programDuration} min/session</Typography>
						</Stack>
					</Stack>
					<Stack className="divider"></Stack>
					<Stack className="type-buttons">
						<Stack className="type">
							<Typography sx={{ fontWeight: 500, fontSize: '13px' }}>{program.programType}</Typography>
							<Typography sx={{ fontWeight: 500, fontSize: '13px' }}>{program.programCategory}</Typography>
						</Stack>
						{!recentlyVisited && (
							<Stack className="buttons">
								<IconButton color={'default'}>
									<RemoveRedEyeIcon />
								</IconButton>
								<Typography className="view-cnt">{program?.programViews}</Typography>
								<IconButton color={'default'} onClick={() => likeProgramHandler(user, program?._id)}>
									{myFavorites ? (
										<FavoriteIcon color="primary" />
									) : program?.meLiked && program?.meLiked[0]?.myFavorite ? (
										<FavoriteIcon color="primary" />
									) : (
										<FavoriteBorderIcon />
									)}
								</IconButton>
								<Typography className="view-cnt">{program?.programLikes}</Typography>
							</Stack>
						)}
					</Stack>
				</Stack>
			</Stack>
		);
	}
};

const DiscoveryProgramCard = ({ program, likeProgramHandler, variant }: ProgramCardType) => {
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const [failedImage, setFailedImage] = useState('');
	const imageSrc = program.programImages?.[0] ? `${REACT_APP_API_URL}/${program.programImages[0]}` : '';
	const trainerName = program.memberData?.memberFullName?.trim() || program.memberData?.memberNick?.trim();
	const trainerImage = program.memberData?.memberImage;
	const trainerInitials = trainerName
		?.split(/\s+/)
		.slice(0, 2)
		.map((name) => Array.from(name)[0])
		.join('')
		.toUpperCase();
	const isLiked = Boolean(program.meLiked?.[0]?.myFavorite);
	const isRelated = variant === 'related';
	const detailHref = { pathname: '/program/detail', query: { id: program._id } };
	const location =
		program.programType === ProgramType.ONLINE
			? t('ONLINE')
			: [t(program.programLocation), program.programAddress?.trim()].filter(Boolean).join(' · ');

	return (
		<Stack component={'article'} className={'discovery-program-card'}>
			<Box component={'div'} className={'discovery-card-media'}>
				<Link
					href={detailHref}
					className={'discovery-card-image'}
					aria-label={t('View program', { name: program.programName })}
				>
					{isRelated ? (
						<RelatedProgramImage key={program._id} program={program} />
					) : imageSrc && imageSrc !== failedImage ? (
						<Box
							component={'img'}
							src={imageSrc}
							alt=""
							loading="lazy"
							width={400}
							height={250}
							onError={() => setFailedImage(imageSrc)}
						/>
					) : (
						<Box component={'span'} className={'discovery-image-fallback'} aria-hidden={true}>
							<FitnessCenterOutlinedIcon />
						</Box>
					)}
				</Link>
				<Box component={'div'} className={'discovery-card-badges'}>
					<span className={'discovery-category'}>{t(`Program discovery card.${program.programCategory}`)}</span>
					<span className={'discovery-type'}>{t(`Program discovery card.${program.programType}`)}</span>
				</Box>
				<IconButton
					type={'button'}
					className={`discovery-like-button${isLiked ? ' is-liked' : ''}`}
					aria-label={t(isLiked ? 'Unlike program' : 'Like program', { name: program.programName })}
					aria-pressed={isLiked}
					disabled={!likeProgramHandler}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						likeProgramHandler(user, program._id);
					}}
				>
					{isLiked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
				</IconButton>
				{!isRelated && program.programRank > topProgramRank && <span className={'discovery-top-badge'}>TOP</span>}
				{!isRelated && (
					<span className={'discovery-views'} aria-label={t('Program views', { views: program.programViews })}>
						<RemoveRedEyeIcon />
						{formatterStr(program.programViews)}
					</span>
				)}
			</Box>
			<Box component={'div'} className={'discovery-card-body'}>
				<Typography component={'h3'} className={'discovery-card-title'}>
					<Link href={detailHref} title={program.programName}>
						{program.programName}
					</Link>
				</Typography>
				{!isRelated && trainerName && (
					<Box component={'div'} className={'discovery-trainer'}>
						<Avatar src={trainerImage ? `${REACT_APP_API_URL}/${trainerImage}` : undefined} alt="">
							{trainerInitials}
						</Avatar>
						<span>{trainerName}</span>
					</Box>
				)}
				<Typography component={'p'} className={'discovery-location'}>
					<LocationOnOutlinedIcon />
					<span>{location}</span>
				</Typography>
				<Box component={'div'} className={'discovery-session-details'}>
					<span>
						<ScheduleOutlinedIcon />
						{t('Session duration', { duration: program.programDuration })}
					</span>
					<span>
						<GroupsOutlinedIcon />
						{t('Session capacity', { capacity: program.programCapacity })}
					</span>
				</Box>
				<Box component={'div'} className={'discovery-card-footer'}>
					<Typography component={'p'} className={'discovery-price'}>
						<strong>₩{formatterStr(program.programPrice)}</strong>
						<span>{t('Per session')}</span>
					</Typography>
					<span className={'discovery-likes'} aria-label={t('Program likes', { likes: program.programLikes })}>
						<FavoriteBorderIcon />
						{formatterStr(program.programLikes)}
					</span>
					<Link
						href={detailHref}
						passHref
						className={'discovery-detail-link'}
						aria-label={t('View program', { name: program.programName })}
					>
						{t('Program discovery card.View Program')}
						<ArrowForwardRoundedIcon />
					</Link>
				</Box>
			</Box>
		</Stack>
	);
};

const relatedDemoImages = [
	'/img/fiber/strength-dumbbells.webp',
	'/img/fiber/yoga-mat-practice.webp',
	'/img/fiber/cardio-running.webp',
	'/img/fiber/pilates-training.webp',
];

const RelatedProgramImage = ({ program }: { program: Program }) => {
	const { t } = useTranslation('common');
	const [failedImages, setFailedImages] = useState<string[]>([]);
	const image = program.programImages?.find((path) => path?.trim() && !failedImages.includes(path));
	const imageIndex = Array.from(program._id).reduce((index, character) => (index * 31 + character.charCodeAt(0)) >>> 0, 0);
	const demoImage = relatedDemoImages[imageIndex % relatedDemoImages.length];
	const imageSrc = image ? `${REACT_APP_API_URL}/${image}` : demoImage;

	if (!image && failedImages.includes(demoImage)) {
		return (
			<Box component={'span'} className={'discovery-image-fallback'} aria-hidden={true}>
				<FitnessCenterOutlinedIcon />
			</Box>
		);
	}

	return (
		<>
			<Box
				component={'img'}
				src={imageSrc}
				alt=""
				loading="lazy"
				width={400}
				height={250}
				onError={() => setFailedImages((previous) => [...previous, image || demoImage])}
			/>
			{!image && <span className={'detail-demo-image-label'}>{t('Program detail.Demo image')}</span>}
		</>
	);
};

export default ProgramCard;
