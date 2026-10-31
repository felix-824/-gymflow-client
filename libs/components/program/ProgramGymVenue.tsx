import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { Program } from '../../types/program/program';
import { ProgramType } from '../../enums/program.enum';

const ProgramGymVenue = ({ program }: { program: Program }) => {
	const { t } = useTranslation('gyms');
	const gym = program.gymData;
	if (program.programType === ProgramType.ONLINE || !/^[a-f\d]{24}$/i.test(program.gymId ?? '') ||
		gym?._id !== program.gymId || !gym?.gymName?.trim()) return null;
	return <p className="detail-gym-venue">
		<span>{t('venue.atGym')}</span> <Link href={'/gym/detail?id=' + program.gymId}>{gym.gymName}</Link>
	</p>;
};

export default ProgramGymVenue;
