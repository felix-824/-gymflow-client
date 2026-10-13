import { NextPage } from 'next';
import useDeviceDetect from '../libs/hooks/useDeviceDetect';
import withLayoutMain from '../libs/components/layout/LayoutHome';
import CommunityBoards from '../libs/components/homepage/CommunityBoards';
import ExploreCategories from '../libs/components/homepage/ExploreCategories';
import TopTrainers from '../libs/components/homepage/TopTrainers';
import TrendPrograms from '../libs/components/homepage/TrendPrograms';
import FinalCta from '../libs/components/homepage/FinalCta';
import { Stack } from '@mui/material';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const getStaticProps = async ({ locale }: any) => ({
	props: {
		...(await serverSideTranslations(locale, ['common'])),
	},
});

const Home: NextPage = () => {
	const device = useDeviceDetect();

	if (device === 'mobile') {
		return (
			<Stack className={'home-page'}>
				<TrendPrograms />
				<ExploreCategories />
				<TopTrainers />
				<CommunityBoards />
				<FinalCta />
			</Stack>
		);
	} else {
		return (
			<Stack className={'home-page'}>
				<TrendPrograms />
				<ExploreCategories />
				<TopTrainers />
				<CommunityBoards />
				<FinalCta />
			</Stack>
		);
	}
};

export default withLayoutMain(Home);
