import { Stack, Box } from '@mui/material';
import Link from 'next/link';
import moment from 'moment';
import { useTranslation } from 'next-i18next';

const Footer = () => {
	const { t } = useTranslation('common');
	return (
		<Stack className="footer-container">
			<Stack className="main">
				<Stack className="left">
					<Box component="div" className="footer-box">
						<Link href="/">
							<img src="/img/logo/logoWhite.svg" alt="GymFlow" className={'logo gymflow-logo'} />
						</Link>
					</Box>
					<Box component="div" className="footer-box">
						<p>{t('Find Your Program')}</p>
						<span>{t('Fitness for your goals')}</span>
					</Box>
				</Stack>
				<Stack className="right">
					<Box component="div" className="bottom">
						<div>
							<strong>{t('Programs')}</strong>
							<Link href="/program">{t('Program Search')}</Link>
							<Link href="/trainer">{t('Trainers')}</Link>
						</div>
						<div>
							<strong>{t('Community')}</strong>
							<Link href="/community">{t('Community')}</Link>
							<Link href="/mypage">{t('My Page')}</Link>
						</div>
						<div>
							<strong>{t('CS')}</strong>
							<Link href="/about">{t('About GymFlow')}</Link>
							<Link href="/cs">{t('FAQs')}</Link>
						</div>
					</Box>
				</Stack>
			</Stack>
			<Stack className="second">
				<span>© GymFlow {moment().year()}</span>
			</Stack>
		</Stack>
	);
};
export default Footer;
