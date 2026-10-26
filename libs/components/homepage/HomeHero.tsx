import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

const HomeHero = () => {
	const { t } = useTranslation('common');

	return (
		<section className="home-hero" aria-labelledby="home-hero-title">
			<div className="home-hero-photo" aria-hidden={true}>
				<Image src="/img/fiber/strength-barbell.webp" alt="" fill priority sizes="(max-width: 767px) 100vw, 66vw" />
			</div>
			<div className="home-hero-inner">
				<div className="home-hero-copy">
					<h1 id="home-hero-title">{t('Home hero.Title')}</h1>
					<p>{t('Home hero.Description')}</p>
					<div className="home-hero-actions">
						<Link href="/program" passHref className="home-hero-primary">
							{t('Home hero.Explore Programs')}
							<ArrowForwardRoundedIcon aria-hidden={true} />
						</Link>
						<Link href="/trainer" passHref className="home-hero-secondary">
							{t('Home hero.Find Trainers')}
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
};

export default HomeHero;
