import React from 'react';
import Link from 'next/link';
import { Box, Button, CircularProgress, IconButton, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import EastRoundedIcon from '@mui/icons-material/EastRounded';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import WestRoundedIcon from '@mui/icons-material/WestRounded';
import { useTranslation } from 'next-i18next';
import { Navigation } from 'swiper';
import { Swiper, SwiperSlide } from 'swiper/react';
import { NetworkStatus, useMutation, useQuery } from '@apollo/client';
import { GET_PROGRAMS } from '../../../apollo/user/query';
import { LIKE_TARGET_PROGRAM } from '../../../apollo/user/mutation';
import { Message } from '../../enums/common.enum';
import { Program } from '../../types/program/program';
import { ProgramsInquiry } from '../../types/program/program.input';
import { T } from '../../types/common';
import { sweetMixinErrorAlert, sweetTopSmallSuccessAlert } from '../../sweetAlert';
import ProgramCard from '../program/ProgramCard';

interface TrendProgramsProps {
	initialInput: ProgramsInquiry;
}

const TrendPrograms = ({ initialInput }: TrendProgramsProps) => {
	const { t } = useTranslation('common');
	const [likeTargetProgram] = useMutation(LIKE_TARGET_PROGRAM);
	const {
		loading: getProgramsLoading,
		networkStatus: getProgramsNetworkStatus,
		data: getProgramsData,
		previousData: previousProgramsData,
		error: getProgramsError,
		refetch: getProgramsRefetch,
	} = useQuery(GET_PROGRAMS, {
		fetchPolicy: 'cache-and-network',
		variables: { input: initialInput },
		notifyOnNetworkStatusChange: true,
	});
	const resolvedProgramsData = getProgramsData ?? previousProgramsData;
	const programs: Program[] = resolvedProgramsData?.getPrograms?.list ?? [];

	const likeProgramHandler = async (user: T, id: string) => {
		try {
			if (!id) return;
			if (!user._id) throw new Error(Message.NOT_AUTHENTICATED);

			await likeTargetProgram({ variables: { input: id } });
			await getProgramsRefetch({ input: initialInput });
			await sweetTopSmallSuccessAlert('success', 800);
		} catch (err: any) {
			console.log('ERROR, likeProgramHandler:', err.message);
			sweetMixinErrorAlert(err.message).then();
		}
	};

	const retryProgramsHandler = async () => {
		try {
			await getProgramsRefetch({ input: initialInput });
		} catch {
			// Apollo keeps the error state visible so Retry remains available.
		}
	};

	const initialLoading =
		getProgramsLoading &&
		getProgramsNetworkStatus === NetworkStatus.loading &&
		!resolvedProgramsData &&
		!getProgramsError;
	const showError = Boolean(getProgramsError) && !programs.length;

	return (
		<Stack component={'section'} className={'home-discover-programs'} aria-labelledby={'home-discover-title'}>
			<Box component={'div'} className={'home-discover-inner'}>
				<Box component={'header'} className={'home-discover-header'}>
					<Box component={'div'} className={'home-discover-heading'}>
						<Typography component={'h2'} id={'home-discover-title'}>
							{t('Home discover.Title')}
						</Typography>
						<Typography component={'p'}>{t('Home discover.Description')}</Typography>
					</Box>
					<Box component={'div'} className={'home-discover-actions'}>
						<Link href={'/program'} passHref className={'home-discover-view-all'}>
							{t('Home discover.View all')}
							<ArrowForwardRoundedIcon aria-hidden={true} />
						</Link>
						{programs.length > 0 && (
							<Box component={'div'} className={'home-discover-navigation'}>
								<IconButton className={'home-discover-prev'} aria-label={t('Previous programs')}>
									<WestRoundedIcon />
								</IconButton>
								<IconButton className={'home-discover-next'} aria-label={t('Next programs')}>
									<EastRoundedIcon />
								</IconButton>
							</Box>
						)}
					</Box>
				</Box>

				<Box component={'div'} className={'home-discover-content'}>
					{initialLoading ? (
						<Box component={'div'} className={'home-discover-state'} role={'status'}>
							<CircularProgress size={24} aria-hidden={true} />
							<Typography>{t('Home discover.Loading')}</Typography>
						</Box>
					) : showError ? (
						<Box component={'div'} className={'home-discover-state'} role={'alert'}>
							<Typography component={'h3'}>{t('Home discover.Error title')}</Typography>
							<Typography>{t('Home discover.Error description')}</Typography>
							<Button onClick={retryProgramsHandler} disabled={getProgramsLoading}>
								{t('Program results.Retry')}
							</Button>
						</Box>
					) : programs.length === 0 ? (
						<Box component={'div'} className={'home-discover-state'} role={'status'}>
							<SearchOffRoundedIcon aria-hidden={true} />
							<Typography component={'h3'}>{t('Home discover.Empty title')}</Typography>
							<Typography>{t('Home discover.Empty description')}</Typography>
							<Link href={'/program'} passHref>
								{t('Home discover.View all')}
							</Link>
						</Box>
					) : (
						<Swiper
							className={'home-discover-swiper'}
							slidesPerView={'auto'}
							spaceBetween={20}
							modules={[Navigation]}
							navigation={{ nextEl: '.home-discover-next', prevEl: '.home-discover-prev' }}
						>
							{programs.map((program: Program) => (
								<SwiperSlide key={program._id} className={'home-discover-slide'}>
									<ProgramCard program={program} likeProgramHandler={likeProgramHandler} variant={'discovery'} />
								</SwiperSlide>
							))}
						</Swiper>
					)}
				</Box>
			</Box>
		</Stack>
	);
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
