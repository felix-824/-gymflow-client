import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import React from 'react';
import { Stack, Box, Divider, Typography } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { Program } from '../../types/program/program';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';
import { REACT_APP_API_URL } from '../../config';
import { useRouter } from 'next/router';
import { useReactiveVar } from '@apollo/client';
import { userVar } from '../../../apollo/store';

interface TrendProgramCardProps {
	program: Program;
	likeProgramHandler: any;
}

const TrendProgramCard = (props: TrendProgramCardProps) => {
	const { program, likeProgramHandler } = props;
	const device = useDeviceDetect();
	const router = useRouter();
	const user = useReactiveVar(userVar);

	/** HANDLERS **/
   const pushDetailHandler = async (programId: string) => {
	console.log('programId', programId);
	await router.push({ pathname: '/program/detail', query: {id: programId } });
   }

	if (device === 'mobile') {
		return (
			<Stack className="trend-card-box" key={program._id}>
				<Box
					component={'div'}
					className={'card-img'}
					style={{ backgroundImage: `url(${REACT_APP_API_URL}/${program?.programImages[0]})` }}
					onClick={() => {pushDetailHandler(program._id)}}
				>
					<div>₩{program.programPrice} /session</div>
				</Box>
				<Box component={'div'} className={'info'}>
					<strong
					 className={'title'}  onClick={() => {pushDetailHandler(program._id)}}>{program.programName}
					</strong>
					<p className={'desc'}>{program.programDesc ?? 'no description'}</p>
					<div className={'options'}>
						<div>
							<GroupsOutlinedIcon fontSize="small" />
							<span>{program.programCapacity} participants/session</span>
						</div>
						<div>
							<FitnessCenterOutlinedIcon fontSize="small" />
							<span>{program.programCategory}</span>
						</div>
						<div>
							<ScheduleOutlinedIcon fontSize="small" />
							<span>{program.programDuration} min/session</span>
						</div>
					</div>
					<Divider sx={{ mt: '15px', mb: '17px' }} />
					<div className={'bott'}>
						<p>
							{program.programType}
						</p>
						<div className="view-like-box">
							<IconButton color={'default'}>
								<RemoveRedEyeIcon />
							</IconButton>
							<Typography className="view-cnt">{program?.programViews}</Typography>
							<IconButton color={'default'} onClick={() => likeProgramHandler(user, program?._id)}>
								{program?.meLiked && program?.meLiked[0]?.myFavorite ? (
									<FavoriteIcon style={{ color: 'red' }} />
								) : (
									<FavoriteIcon />
								)}
							</IconButton>
							<Typography className="view-cnt">{program?.programLikes}</Typography>
						</div>
					</div>
				</Box>
			</Stack>
		);
	} else {
		return (
			<Stack className="trend-card-box" key={program._id}>
				<Box
					component={'div'}
					className={'card-img'}
					style={{ backgroundImage: `url(${REACT_APP_API_URL}/${program?.programImages[0]})` }}
					onClick={() => {pushDetailHandler(program._id)}}
				>
					<div>₩{program.programPrice} /session</div>
				</Box>
				<Box component={'div'} className={'info'}>
					<strong className={'title'}  onClick={() => {
						pushDetailHandler(program._id);
						}}
						>
							{program.programName}</strong>
					<p className={'desc'}>{program.programDesc ?? 'no description'}</p>
					<div className={'options'}>
						<div>
							<GroupsOutlinedIcon fontSize="small" />
							<span>{program.programCapacity} participants/session</span>
						</div>
						<div>
							<FitnessCenterOutlinedIcon fontSize="small" />
							<span>{program.programCategory}</span>
						</div>
						<div>
							<ScheduleOutlinedIcon fontSize="small" />
							<span>{program.programDuration} min/session</span>
						</div>
					</div>
					<Divider sx={{ mt: '15px', mb: '17px' }} />
					<div className={'bott'}>
						<p>
							{program.programType}
						</p>
						<div className="view-like-box">
							<IconButton color={'default'}>
								<RemoveRedEyeIcon />
							</IconButton>
							<Typography className="view-cnt">{program?.programViews}</Typography>
							<IconButton color={'default'} onClick={() => likeProgramHandler(user, program?._id)}>
								{program?.meLiked && program?.meLiked[0]?.myFavorite ? (
									<FavoriteIcon style={{ color: 'red' }} />
								) : (
									<FavoriteIcon />
								)}
							</IconButton>
							<Typography className="view-cnt">{program?.programLikes}</Typography>
						</div>
					</div>
				</Box>
			</Stack>
		);
	}
};

export default TrendProgramCard;
