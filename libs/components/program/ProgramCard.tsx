import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import React from 'react';
import { Stack, Typography, Box } from '@mui/material';
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

interface ProgramCardType {
	program: Program;
	likeProgramHandler?: any;
	myFavorites?: boolean;
	recentlyVisited?: boolean;
}

const ProgramCard = (props: ProgramCardType) => {
	const { program, likeProgramHandler, myFavorites, recentlyVisited } = props;
	const device = useDeviceDetect();
	const user = useReactiveVar(userVar);
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

export default ProgramCard;
