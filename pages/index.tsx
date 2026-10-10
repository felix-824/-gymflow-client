import { NextPage } from 'next';
import useDeviceDetect from '../libs/hooks/useDeviceDetect';
import withLayoutMain from '../libs/components/layout/LayoutHome';
import CommunityBoards from '../libs/components/homepage/CommunityBoards';
import PopularPrograms from '../libs/components/homepage/PopularPrograms';
import TopTrainers from '../libs/components/homepage/TopTrainers';
import Events from '../libs/components/homepage/Events';
import TrendPrograms from '../libs/components/homepage/TrendPrograms';
import TopPrograms from '../libs/components/homepage/TopPrograms';
import { Stack } from '@mui/material';
import Advertisement from '../libs/components/homepage/Advertisement';
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
				<PopularPrograms />
				<Advertisement />
				<TopPrograms />
				<TopTrainers />
			</Stack>
		);
	} else {
		return (
			<Stack className={'home-page'}>
				<TrendPrograms />
				<PopularPrograms />
				<Advertisement />
				<TopPrograms />
				<TopTrainers />
				<Events />
				<CommunityBoards />
			</Stack>
		);
	}
};

export default withLayoutMain(Home);
