import React from 'react';
import Link from 'next/link';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useTranslation } from 'next-i18next';

const FinalCta = () => {
	const { t } = useTranslation('common');

	return (
		<section className="home-final-cta" aria-labelledby="home-final-cta-title">
			<div className="home-final-cta-inner">
				<header className="home-final-cta-heading">
					<p className="home-final-cta-eyebrow">{t('Home final CTA.Eyebrow')}</p>
					<h2 id="home-final-cta-title">{t('Home final CTA.Title')}</h2>
				</header>
				<div className="home-final-cta-discovery">
					<p className="home-final-cta-description">{t('Home final CTA.Description')}</p>
					<div className="home-final-cta-actions">
						<Link href="/program" passHref className="home-final-cta-primary">
							{t('Home hero.Explore Programs')}
							<ArrowForwardRoundedIcon aria-hidden={true} />
						</Link>
						<Link href="/trainer" passHref className="home-final-cta-secondary">
							{t('Home hero.Find Trainers')}
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
};

export default FinalCta;
