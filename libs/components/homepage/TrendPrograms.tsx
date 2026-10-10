import React, { useState } from 'react';
import { Stack, Box, IconButton } from '@mui/material';
import { useTranslation } from 'next-i18next';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import WestIcon from '@mui/icons-material/West';
import EastIcon from '@mui/icons-material/East';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Navigation, Pagination } from 'swiper';
import { Program } from '../../types/program/program';
import { ProgramsInquiry } from '../../types/program/program.input';
import TrendProgramCard from './TrendProgramCard';
import { GET_PROGRAMS } from '../../../apollo/user/query';
import { useMutation, useQuery } from '@apollo/client';
import { T } from '../../types/common';
import { LIKE_TARGET_PROGRAM } from '../../../apollo/user/mutation';
import { sweetMixinErrorAlert, sweetTopSmallSuccessAlert } from '../../sweetAlert';
import { Message } from '../../enums/common.enum';

interface TrendProgramsProps {
	initialInput: ProgramsInquiry;
}

const TrendPrograms = (props: TrendProgramsProps) => {
	const { initialInput } = props;
	const device = useDeviceDetect();
	const { t } = useTranslation('common');
	const [trendPrograms, setTrendPrograms] = useState<Program[]>([]);

	/** APOLLO REQUESTS **/
    // GET_PROGRAMS query orqali program'larni olib,
// natija kelgach ularni trendPrograms state'iga saqlaydi.
const [likeTargetProgram] = useMutation(LIKE_TARGET_PROGRAM);

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
		setTrendPrograms(data?.getPrograms?.list ?? []);
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
	

	
	if (!trendPrograms) return null;

	if (device === 'mobile') {
		return (
			<Stack className={'trend-programs'}>
				<Stack className={'container'}>
					<Stack className={'info-box'}>
						<h2>{t('Trend Programs')}</h2>
					</Stack>
					<Stack className={'card-box'}>
						{trendPrograms.length === 0 ? (
							<Box component={'div'} className={'empty-list'}>
								{t('No trending programs')}
							</Box>
						) : (
							<Swiper
								className={'trend-program-swiper'}
								slidesPerView={'auto'}
								centeredSlides={true}
								spaceBetween={15}
								modules={[Autoplay]}
							>
								{trendPrograms.map((program: Program) => {
									return (
										<SwiperSlide key={program._id} className={'trend-program-slide'}>
											<TrendProgramCard program={program} likeProgramHandler={likeProgramHandler} />
										</SwiperSlide>
									);
								})}
							</Swiper>
						)}
					</Stack>
				</Stack>
			</Stack>
		);
	} else {
		return (
			<Stack className={'trend-programs'}>
				<Stack className={'container'}>
					<Stack className={'info-box'}>
						<Box component={'div'} className={'left'}>
							<h2>{t('Trend Programs')}</h2>
							<p>{t('Trend is based on likes')}</p>
						</Box>
						<Box component={'div'} className={'right'}>
							<div className={'pagination-box'}>
								<IconButton className={'swiper-trend-prev'} aria-label={t('Previous programs')}>
									<WestIcon />
								</IconButton>
								<div className={'swiper-trend-pagination'}></div>
								<IconButton className={'swiper-trend-next'} aria-label={t('Next programs')}>
									<EastIcon />
								</IconButton>
							</div>
						</Box>
					</Stack>
					<Stack className={'card-box'}>
						{trendPrograms.length === 0 ? (
							<Box component={'div'} className={'empty-list'}>
								{t('No trending programs')}
							</Box>
						) : (
							<Swiper
								className={'trend-program-swiper'}
								slidesPerView={'auto'}
								spaceBetween={15}
								modules={[Autoplay, Navigation, Pagination]}
								navigation={{
									nextEl: '.swiper-trend-next',
									prevEl: '.swiper-trend-prev',
								}}
								pagination={{
									el: '.swiper-trend-pagination',
								}}
							>
								{trendPrograms.map((program: Program) => {
									return (
										<SwiperSlide key={program._id} className={'trend-program-slide'}>
											<TrendProgramCard program={program} likeProgramHandler={likeProgramHandler} />
										</SwiperSlide>
									);
								})}
							</Swiper>
						)}
					</Stack>
				</Stack>
			</Stack>
		);
	}
};

TrendPrograms.defaultProps = {
	initialInput: {
		page: 1,
		limit: 8,
		sort: 'programLikes',
		direction: 'DESC',
		search: {},
	},
};

export default TrendPrograms;
