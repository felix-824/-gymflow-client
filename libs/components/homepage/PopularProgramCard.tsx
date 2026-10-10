import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import React from 'react';
import { Stack, Box, Divider, Typography } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Program } from '../../types/program/program';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';
import { REACT_APP_API_URL, topProgramRank } from '../../config';
import { useRouter } from 'next/router';
import { useReactiveVar } from '@apollo/client';
import { userVar } from '../../../apollo/store';

interface PopularProgramCardProps {
	program: Program;
}

const PopularProgramCard = (props: PopularProgramCardProps) => {
	const { program } = props;
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
			<Stack className="popular-card-box">
				<Box
					component={'div'}
					className={'card-img'}
					style={{ backgroundImage: `url(${REACT_APP_API_URL}/${program?.programImages[0]})` }}
					onClick={() => {pushDetailHandler(program._id)}}
				>
					{program && program?.programRank >= topProgramRank ? (
						<div className={'status'}>
							<img src="/img/icons/electricity.svg" alt="" />
							<span>top</span>
						</div>
					) : (
						''
					)}

					<div className={'price'}>₩{program.programPrice} /session</div>
				</Box>
				<Box component={'div'} className={'info'}>
					<strong className={'title'} 
					onClick={() => {pushDetailHandler(program._id)}}
						>
						{program.programName}</strong>
					<p className={'desc'}>{program.programAddress}</p>
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
						<p>{program.programType}</p>
						<div className="view-like-box">
							<IconButton color={'default'}>
								<RemoveRedEyeIcon />
							</IconButton>
							<Typography className="view-cnt">{program?.programViews}</Typography>
						</div>
					</div>
				</Box>
			</Stack>
		);
	} else {
		return (
			<Stack className="popular-card-box">
				<Box
					component={'div'}
					className={'card-img'}
					style={{ backgroundImage: `url(${REACT_APP_API_URL}/${program?.programImages[0]})` }}
					onClick={() => {pushDetailHandler(program._id)}}
				>
					{program && program?.programRank >= topProgramRank ? (
						<div className={'status'}>
							<img src="/img/icons/electricity.svg" alt="" />
							<span>top</span>
						</div>
					) : (
						''
					)}

					<div className={'price'}>₩{program.programPrice} /session</div>
				</Box>
				<Box component={'div'} className={'info'}>
					<strong className={'title'} onClick={() => {pushDetailHandler(program._id)}}>
						{program.programName}</strong>
					<p className={'desc'}>{program.programAddress}</p>
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
						<p>{program.programType}</p>
						<div className="view-like-box">
							<IconButton color={'default'}>
								<RemoveRedEyeIcon />
							</IconButton>
							<Typography className="view-cnt">{program?.programViews}</Typography>
						</div>
					</div>
				</Box>
			</Stack>
		);
	}
};

export default PopularProgramCard;
