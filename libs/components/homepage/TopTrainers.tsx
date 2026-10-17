import React from 'react';
import Link from 'next/link';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import { NetworkStatus, useQuery } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import TopTrainerCard from './TopTrainerCard';
import { PublicMember } from '../../types/member/member';
import { TrainersInquiry } from '../../types/member/member.input';
import { GET_TRAINERS } from '../../../apollo/user/query';

interface TopTrainersProps {
	initialInput: TrainersInquiry;
}

const TopTrainers = ({ initialInput }: TopTrainersProps) => {
	const { t } = useTranslation('common');
	const {
		loading: getTrainersLoading,
		networkStatus: getTrainersNetworkStatus,
		data: getTrainersData,
		previousData: previousTrainersData,
		error: getTrainersError,
		refetch: getTrainersRefetch,
	} = useQuery(GET_TRAINERS, {
		fetchPolicy: 'cache-and-network',
		variables: { input: initialInput },
		notifyOnNetworkStatusChange: true,
	});
	const resolvedTrainersData = getTrainersData ?? previousTrainersData;
	const trainers: PublicMember[] = resolvedTrainersData?.getTrainers?.list ?? [];
	const visibleTrainers = trainers.slice(0, 4);
	const initialLoading =
		getTrainersLoading &&
		getTrainersNetworkStatus === NetworkStatus.loading &&
		!resolvedTrainersData &&
		!getTrainersError;
	const showError = Boolean(getTrainersError) && !visibleTrainers.length;

	const retryTrainersHandler = async () => {
		try {
			await getTrainersRefetch({ input: initialInput });
		} catch {
			// Apollo keeps the error state visible so Retry remains available.
		}
	};

	return (
		<Stack component={'section'} className={'home-meet-trainers'} aria-labelledby={'home-meet-trainers-title'}>
			<Box component={'div'} className={'home-meet-trainers-inner'}>
				<Box component={'header'} className={'home-meet-trainers-header'}>
					<Box component={'div'} className={'home-meet-trainers-heading'}>
						<Typography component={'h2'} id={'home-meet-trainers-title'}>
							{t('Home trainers.Title')}
						</Typography>
						<Typography component={'p'}>{t('Home trainers.Description')}</Typography>
					</Box>
					<Link href={'/trainer'} passHref className={'home-meet-trainers-view-all'}>
						{t('Home trainers.View all')}
						<ArrowForwardRoundedIcon aria-hidden={true} />
					</Link>
				</Box>

				<Box component={'div'} className={'home-meet-trainers-content'} aria-busy={getTrainersLoading}>
					{initialLoading ? (
						<Box component={'div'} className={'home-meet-trainers-state'} role={'status'}>
							<CircularProgress size={24} aria-hidden={true} />
							<Typography>{t('Trainer discovery.Loading')}</Typography>
						</Box>
					) : showError ? (
						<Box component={'div'} className={'home-meet-trainers-state'} role={'alert'}>
							<Typography component={'h3'}>{t('Trainer discovery.Error title')}</Typography>
							<Typography>{t('Trainer discovery.Error description')}</Typography>
							<Button onClick={retryTrainersHandler} disabled={getTrainersLoading}>
								{t('Trainer discovery.Retry')}
							</Button>
						</Box>
					) : visibleTrainers.length === 0 ? (
						<Box component={'div'} className={'home-meet-trainers-state'} role={'status'}>
							<PeopleAltOutlinedIcon aria-hidden={true} />
							<Typography component={'h3'}>{t('Trainer discovery.Empty title')}</Typography>
							<Typography>{t('Trainer discovery.Empty description')}</Typography>
							<Link href={'/trainer'} passHref>
								{t('Home trainers.View all')}
							</Link>
						</Box>
					) : (
						<Box component={'div'} className={'home-meet-trainers-grid'}>
							{visibleTrainers.map((trainer: PublicMember) => (
								<TopTrainerCard trainer={trainer} key={trainer._id} />
							))}
						</Box>
					)}
				</Box>
			</Box>
		</Stack>
	);
};

TopTrainers.defaultProps = {
	initialInput: {
		page: 1,
		limit: 10,
		sort: 'memberRank',
		direction: 'DESC',
		search: {},
	},
};

export default TopTrainers;
