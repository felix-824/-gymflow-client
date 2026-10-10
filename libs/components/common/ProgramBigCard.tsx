import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import React from 'react';
import { Stack, Box, Divider, Typography } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { Program } from '../../types/program/program';
import { REACT_APP_API_URL, topProgramRank } from '../../config';
import { formatterStr } from '../../utils';
import { useReactiveVar } from '@apollo/client';
import { userVar } from '../../../apollo/store';
import { useRouter } from 'next/router';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';

interface ProgramBigCardProps {
	program: Program;
	likeProgramHandler?: any;
}

const ProgramBigCard = (props: ProgramBigCardProps) => {
	const { program, likeProgramHandler } = props;
	const device = useDeviceDetect();
	const user = useReactiveVar(userVar);
	const router = useRouter();

	/** HANDLERS **/
	const goProgramDetatilPage = (programId: string) => {
		router.push(`/program/detail?id=${programId}`);
	};

	if (device === 'mobile') {
		return <div>PROGRAM BIG CARD</div>;
	} else {
		return (
			<Stack className="program-big-card-box" onClick={() => goProgramDetatilPage(program?._id)}>
				<Box
					component={'div'}
					className={'card-img'}
					style={{ backgroundImage: `url(${REACT_APP_API_URL}/${program?.programImages?.[0]})` }}
				>
					{program && program?.programRank >= topProgramRank && (
						<div className={'status'}>
							<img src="/img/icons/electricity.svg" alt="" />
							<span>top</span>
						</div>
					)}

					<div className={'price'}>₩{formatterStr(program?.programPrice)} /session</div>
				</Box>
				<Box component={'div'} className={'info'}>
					<strong className={'title'}>{program?.programName}</strong>
					<p className={'desc'}>{program?.programAddress}</p>
					<div className={'options'}>
						<div>
							<GroupsOutlinedIcon fontSize="small" />
							<span>{program?.programCapacity} participants/session</span>
						</div>
						<div>
							<FitnessCenterOutlinedIcon fontSize="small" />
							<span>{program?.programCategory}</span>
						</div>
						<div>
							<ScheduleOutlinedIcon fontSize="small" />
							<span>{program?.programDuration} min/session</span>
						</div>
					</div>
					<Divider sx={{ mt: '15px', mb: '17px' }} />
					<div className={'bott'}>
						<div>
							{<p>{program.programType}</p>}
							{<p>{program.programCategory}</p>}
						</div>
						<div className="buttons-box">
							<IconButton color={'default'}>
								<RemoveRedEyeIcon />
							</IconButton>
							<Typography className="view-cnt">{program?.programViews}</Typography>
							<IconButton
								color={'default'}
								onClick={(e) => {
									e.stopPropagation();
									likeProgramHandler(user, program?._id);
								}}
							>
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

export default ProgramBigCard;
