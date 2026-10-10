import React, { useState } from 'react';
import { Stack, Box } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import WestIcon from '@mui/icons-material/West';
import EastIcon from '@mui/icons-material/East';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Navigation, Pagination } from 'swiper';
import TopProgramCard from './TopProgramCard';
import { ProgramsInquiry } from '../../types/program/program.input';
import { Program } from '../../types/program/program';
import { GET_PROGRAMS } from '../../../apollo/user/query';
import { useMutation, useQuery } from '@apollo/client';
import { T } from '../../types/common';
import { LIKE_TARGET_PROGRAM } from '../../../apollo/user/mutation';
import { sweetMixinErrorAlert, sweetTopSmallSuccessAlert } from '../../sweetAlert';
import { Message } from '../../enums/common.enum';

interface TopProgramsProps {
	initialInput: ProgramsInquiry;
}

const TopPrograms = (props: TopProgramsProps) => {
	const { initialInput } = props;
	const device = useDeviceDetect();
	const [topPrograms, setTopPrograms] = useState<Program[]>([]);

	/** APOLLO REQUESTS **/
	const [likeTargetProgram] = useMutation(LIKE_TARGET_PROGRAM)

	const {
	loading: getProgramsLoading,
	data: getProgramsData,
	error: getProgramsError,
	refetch: getProgramsRefetch,
} = useQuery(GET_PROGRAMS, {
	fetchPolicy: 'cache-and-network',
	variables: { input: initialInput },
	notifyOnNetworkStatusChange: true,
	onCompleted: (data: T) => {
		setTopPrograms(data?.getPrograms?.list ?? []);
	},
});

	/** HANDLERS **/
	const likeProgramHandler = async (user: T, id: string) => {
		try {
			if (!id) return;
			if (!user._id) throw new Error(Message.NOT_AUTHENTICATED);
	
			await likeTargetProgram({
				variables: { input: id },
			});
	
			await getProgramsRefetch({ input: initialInput });
	
			await sweetTopSmallSuccessAlert('success', 800);
		} catch (err: any) {
			console.log('ERROR, likeProgramHandler:', err.message);
			sweetMixinErrorAlert(err.message).then();
		}
	};

	if (device === 'mobile') {
		return (
			<Stack className={'top-programs'}>
				<Stack className={'container'}>
					<Stack className={'info-box'}>
						<span>Top programs</span>
					</Stack>
					<Stack className={'card-box'}>
						<Swiper
							className={'top-program-swiper'}
							slidesPerView={'auto'}
							centeredSlides={true}
							spaceBetween={15}
							modules={[Autoplay]}
						>
							{topPrograms.map((program: Program) => {
								return (
									<SwiperSlide className={'top-program-slide'} key={program?._id}>
										<TopProgramCard program={program} likeProgramHandler={likeProgramHandler} />
									</SwiperSlide>
								);
							})}
						</Swiper>
					</Stack>
				</Stack>
			</Stack>
		);
	} else {
		return (
			<Stack className={'top-programs'}>
				<Stack className={'container'}>
					<Stack className={'info-box'}>
						<Box component={'div'} className={'left'}>
							<span>Top programs</span>
							<p>Check out our Top Programs</p>
						</Box>
						<Box component={'div'} className={'right'}>
							<div className={'pagination-box'}>
								<WestIcon className={'swiper-top-prev'} />
								<div className={'swiper-top-pagination'}></div>
								<EastIcon className={'swiper-top-next'} />
							</div>
						</Box>
					</Stack>
					<Stack className={'card-box'}>
						<Swiper
							className={'top-program-swiper'}
							slidesPerView={'auto'}
							spaceBetween={15}
							modules={[Autoplay, Navigation, Pagination]}
							navigation={{
								nextEl: '.swiper-top-next',
								prevEl: '.swiper-top-prev',
							}}
							pagination={{
								el: '.swiper-top-pagination',
							}}
						>
							{topPrograms.map((program: Program) => {
								return (
									<SwiperSlide className={'top-program-slide'} key={program?._id}>
										<TopProgramCard program={program} likeProgramHandler={likeProgramHandler} />
									</SwiperSlide>
								);
							})}
						</Swiper>
					</Stack>
				</Stack>
			</Stack>
		);
	}
};

TopPrograms.defaultProps = {
	initialInput: {
		page: 1,
		limit: 8,
		sort: 'programRank',
		direction: 'DESC',
		search: {},
	},
};

export default TopPrograms;
