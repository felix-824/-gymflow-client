import { Stack, Box } from '@mui/material';
import Link from 'next/link';
import Image from 'next/image';
import moment from 'moment';
import { useTranslation } from 'next-i18next';

const Footer = ({ variant = 'default' }: { variant?: 'default' | 'programs' | 'home' }) => {
	const { t } = useTranslation('common');
	if (variant === 'home') {
		return (
			<footer className="home-footer">
				<div className="home-footer-inner">
					<div className="home-footer-main">
						<div className="home-footer-brand">
							<Link href="/" passHref className="home-footer-logo" aria-label={t('Program navigation.GymFlow home')}>
								<Image src="/img/logo/gymflow-mark.svg" width={36} height={36} alt="" />
								<span>GymFlow</span>
							</Link>
							<p>{t('Home footer.Description')}</p>
						</div>
						<nav className="home-footer-links" aria-labelledby="home-footer-explore-title">
							<h2 id="home-footer-explore-title">{t('Home footer.Explore')}</h2>
							<Link href="/program" passHref>
								{t('Programs')}
							</Link>
							<Link href="/trainer" passHref>
								{t('Trainers')}
							</Link>
							<Link href="/community?articleCategory=FREE" passHref>
								{t('Community')}
							</Link>
						</nav>
						<nav className="home-footer-links" aria-labelledby="home-footer-support-title">
							<h2 id="home-footer-support-title">{t('Home footer.Support')}</h2>
							<Link href="/mypage" passHref>
								{t('My Page')}
							</Link>
							<Link href="/cs" passHref>
								{t('CS')}
							</Link>
						</nav>
					</div>
					<div className="home-footer-bottom">
						<span>© GymFlow {moment().year()}</span>
					</div>
				</div>
			</footer>
		);
	}
	if (variant === 'programs') {
		return (
			<Stack className={'programs-footer'}>
				<Box component={'div'} className={'programs-footer-inner'}>
					<Box component={'div'} className={'programs-footer-brand'}>
						<Link href={'/'} passHref className={'programs-brand'} aria-label={t('Program navigation.GymFlow home')}>
							<Image src={'/img/logo/gymflow-mark.svg'} width={32} height={32} alt={''} />
							<span>GymFlow</span>
						</Link>
						<p>{t('Find Your Program')}</p>
						<span>{t('Fitness for your goals')}</span>
					</Box>
					{[
						{
							label: 'Programs',
							links: [
								['/program', 'Program Search'],
								['/trainer', 'Trainers'],
							],
						},
						{
							label: 'Community',
							links: [
								['/community', 'Community'],
								['/mypage', 'My Page'],
							],
						},
						{
							label: 'CS',
							links: [
								['/about', 'About GymFlow'],
								['/cs', 'FAQs'],
							],
						},
					].map(({ label, links }) => (
						<Box component={'nav'} key={label} className={'programs-footer-links'} aria-label={t(label)}>
							<strong>{t(label)}</strong>
							{links.map(([href, text]) => (
								<Link key={href} href={href}>
									{t(text)}
								</Link>
							))}
						</Box>
					))}
					<Box component={'div'} className={'programs-footer-bottom'}>
						<span>© GymFlow {moment().year()}</span>
					</Box>
				</Box>
			</Stack>
		);
	}
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
