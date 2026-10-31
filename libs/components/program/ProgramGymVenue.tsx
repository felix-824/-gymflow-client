import React from 'react';
import Link from 'next/link';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useTranslation } from 'next-i18next';
import { Program } from '../../types/program/program';
import { ProgramType } from '../../enums/program.enum';

const ProgramGymVenue = ({ program }: { program: Program }) => {
	const { t } = useTranslation('gyms');
	const gym = program.gymData;
	if (program.programType === ProgramType.ONLINE || !/^[a-f\d]{24}$/i.test(program.gymId ?? '') ||
		gym?._id !== program.gymId || !gym?.gymName?.trim()) return null;
	return (
		<div className="detail-gym-venue">
			<span className="detail-gym-label">{t('venue.atGym')}</span>
			<Link className="detail-gym-link" href={'/gym/detail?id=' + program.gymId} passHref>
				<span className="detail-gym-name">{gym.gymName}</span>
				<span className="detail-gym-action">
					{t('venue.viewGym')} <ArrowForwardRoundedIcon aria-hidden="true" />
				</span>
			</Link>
		</div>
	);
};

export default ProgramGymVenue;
