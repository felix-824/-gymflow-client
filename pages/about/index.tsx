import React from 'react';
import { NextPage } from 'next';
import { Stack, Box } from '@mui/material';
import Link from 'next/link';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import useDeviceDetect from '../../libs/hooks/useDeviceDetect';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const About: NextPage = () => {
	const device = useDeviceDetect();
	if (device === 'mobile') return <div>ABOUT GYMFLOW MOBILE</div>;
	return (
		<Stack className="about-page">
			<Stack className="container">
				<Stack className="intro">
					<Box component="div" className="left">
						<strong>Find a fitness program that fits your goals.</strong>
						<p>GymFlow connects people with trainers and fitness programs across Korea, including online sessions.</p>
						<p>
							Explore personal training, group classes, yoga, Pilates and more. Compare the price, duration and
							participant capacity for each session.
						</p>
						<Link href="/program">Explore programs →</Link>
					</Box>
					<Box component="div" className="right">
						<p>
							Choose a program by category, location and training format. Save your favorites and discover the trainers
							behind each program.
						</p>
						<p>Trainers can publish programs, edit their details, and pause or resume availability from My Page.</p>
						<Link href="/trainer">Meet trainers →</Link>
					</Box>
				</Stack>
				<Stack className="options">
					<Box component="div" className="left">
						<strong>Your next step starts here.</strong>
					</Box>
					<Box component="div" className="right">
						<strong>Programs with clear details</strong>
						<p>Prices are shown in KRW per session, with session duration and capacity.</p>
						<strong>A community for sharing</strong>
						<p>Read fitness articles, discuss them with comments and follow other members.</p>
						<strong>Support when you need it</strong>
						<p>Visit our FAQ to learn about accounts, programs and trainer tools.</p>
						<Link href="/help">Read the FAQ →</Link>
					</Box>
				</Stack>
			</Stack>
		</Stack>
	);
};
export default withLayoutBasic(About);
