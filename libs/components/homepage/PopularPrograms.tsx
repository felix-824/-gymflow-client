import React, { useState } from 'react';
import { Stack, Box } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Navigation, Pagination } from 'swiper';
import WestIcon from '@mui/icons-material/West';
import EastIcon from '@mui/icons-material/East';
import PopularProgramCard from './PopularProgramCard';
import { Program } from '../../types/program/program';
import Link from 'next/link';
import { ProgramsInquiry } from '../../types/program/program.input';
import { useQuery } from '@apollo/client';
import { GET_PROGRAMS } from '../../../apollo/user/query';
import { T } from '../../types/common';

interface PopularProgramsProps {
	initialInput: ProgramsInquiry;
}

const PopularPrograms = (props: PopularProgramsProps) => {
	const { initialInput } = props;
	const device = useDeviceDetect();
	const [popularPrograms, setPopularPrograms] = useState<Program[]>([]);

	/** APOLLO REQUESTS **/
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
			setPopularPrograms(data?.getPrograms?.list ?? []);
		},
	});

	/** HANDLERS **/

	if (!popularPrograms) return null;

	if (device === 'mobile') {
		return (
			<Stack className={'popular-programs'}>
				<Stack className={'container'}>
					<Stack className={'info-box'}>
						<span>Popular programs</span>
					</Stack>
					<Stack className={'card-box'}>
						<Swiper
							className={'popular-program-swiper'}
							slidesPerView={'auto'}
							centeredSlides={true}
							spaceBetween={25}
							modules={[Autoplay]}
						>
							{popularPrograms.map((program: Program) => {
								return (
									<SwiperSlide key={program._id} className={'popular-program-slide'}>
										<PopularProgramCard program={program} />
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
			<Stack className={'popular-programs'}>
				<Stack className={'container'}>
					<Stack className={'info-box'}>
						<Box component={'div'} className={'left'}>
							<span>Popular programs</span>
							<p>Popularity is based on views</p>
						</Box>
						<Box component={'div'} className={'right'}>
							<div className={'more-box'}>
								<Link href={'/program'}>
									<span>See All Categories</span>
								</Link>
								<img src="/img/icons/rightup.svg" alt="" />
							</div>
						</Box>
					</Stack>
					<Stack className={'card-box'}>
						<Swiper
							className={'popular-program-swiper'}
							slidesPerView={'auto'}
							spaceBetween={25}
							modules={[Autoplay, Navigation, Pagination]}
							navigation={{
								nextEl: '.swiper-popular-next',
								prevEl: '.swiper-popular-prev',
							}}
							pagination={{
								el: '.swiper-popular-pagination',
							}}
						>
							{popularPrograms.map((program: Program) => {
								return (
									<SwiperSlide key={program._id} className={'popular-program-slide'}>
										<PopularProgramCard program={program} />
									</SwiperSlide>
								);
							})}
						</Swiper>
					</Stack>
					<Stack className={'pagination-box'}>
						<WestIcon className={'swiper-popular-prev'} />
						<div className={'swiper-popular-pagination'}></div>
						<EastIcon className={'swiper-popular-next'} />
					</Stack>
				</Stack>
			</Stack>
		);
	}
};

PopularPrograms.defaultProps = {
	initialInput: {
		page: 1,
		limit: 7,
		sort: 'programViews',
		direction: 'DESC',
		search: {},
	},
};

export default PopularPrograms;
