import React from 'react';
import { useRouter } from 'next/router';
import { Stack } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Member } from '../../types/member/member';

interface TopTrainerProps {
	trainer: Member;
}
const TopTrainerCard = (props: TopTrainerProps) => {
	const { trainer } = props;
	const device = useDeviceDetect();
	const router = useRouter();
	const trainerImage = trainer?.memberImage
		? `${process.env.REACT_APP_API_URL}/${trainer?.memberImage}`
		: '/img/profile/defaultUser.svg';

	/** HANDLERS **/

	if (device === 'mobile') {
		return (
			<Stack className="top-trainer-card" onClick={() => router.push({ pathname: "/trainer/detail", query: { trainerId: trainer._id } })} sx={{ cursor: "pointer" }}>
				<img src={trainerImage} alt="" />

				<strong>{trainer?.memberNick}</strong>
				<span>{trainer?.memberType}</span>
			</Stack>
		);
	} else {
		return (
			<Stack className="top-trainer-card" onClick={() => router.push({ pathname: "/trainer/detail", query: { trainerId: trainer._id } })} sx={{ cursor: "pointer" }}>
				<img src={trainerImage} alt="" />

				<strong>{trainer?.memberNick}</strong>
				<span>{trainer?.memberType}</span>
			</Stack>
		);
	}
};

export default TopTrainerCard;
