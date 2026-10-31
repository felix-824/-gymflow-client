import React from 'react';
import { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@apollo/client';
import { Button } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import GymVenue from '../../libs/components/gym/GymVenue';
import { GymDetailSkeleton, GymUnavailable } from '../../libs/components/gym/GymDetailStates';
import { GET_GYM } from '../../apollo/user/query';
import { Gym } from '../../libs/types/gym/gym';

export const getStaticProps = async ({ locale }: { locale?: string }) => ({
	props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'gyms'])) },
});

const GymRead = ({ gymId }: { gymId: string }) => {
	const { t } = useTranslation('gyms');
	const { data, loading, error, refetch } = useQuery<{ getGym: Gym | null }>(GET_GYM, {
		variables: { gymId },
		fetchPolicy: 'network-only',
		notifyOnNetworkStatusChange: true,
	});
	if (loading) return <GymDetailSkeleton />;
	const missing =
		!error?.networkError &&
		error?.graphQLErrors.some(
			({ message, extensions }) =>
				// The current API flattens public not-found to this exact message.
				message === 'Gym not found' ||
				extensions?.code === 'NOT_FOUND' ||
				extensions?.originalError?.statusCode === 404 ||
				extensions?.statusCode === 404,
		);
	if (error && !missing)
		return (
			<div className="gym-detail-state" role="alert">
				<h1>{t('detail.error')}</h1>
				<Button
					onClick={async () => {
						try {
							await refetch({ gymId });
						} catch {
							/* Apollo presents the localized error. */
						}
					}}
				>
					{t('retry')}
				</Button>
			</div>
		);
	const gym = data?.getGym;
	if (error || !gym || typeof gym._id !== 'string' || gym._id.toLowerCase() !== gymId.toLowerCase())
		return <GymUnavailable />;
	return <GymVenue key={gym._id} gym={gym} />;
};

const GymDetail: NextPage = () => {
	const router = useRouter();
	const { t } = useTranslation('gyms');
	const id = typeof router.query.id === 'string' ? router.query.id : '';
	return (
		<>
			<Head>
				<title>{t('detail.title')} | GymFlow</title>
			</Head>
			<div id="gym-detail-page">
				<div className="gym-detail-container">
					<Link href="/gym" passHref className="gym-detail-back">
						<ArrowBackRoundedIcon aria-hidden="true" />
						{t('detail.back')}
					</Link>
					{!router.isReady ? (
						<GymDetailSkeleton />
					) : /^[a-f\d]{24}$/i.test(id) ? (
						<GymRead key={id.toLowerCase()} gymId={id} />
					) : (
						<GymUnavailable />
					)}
				</div>
			</div>
		</>
	);
};

export default withLayoutBasic(GymDetail);
