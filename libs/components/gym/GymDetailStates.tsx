import React from 'react';
import Link from 'next/link';
import { Skeleton, useMediaQuery } from '@mui/material';
import { useTranslation } from 'next-i18next';

export const GymUnavailable = () => {
	const { t } = useTranslation('gyms');
	return (
		<div className="gym-detail-state">
			<h1>{t('detail.unavailable')}</h1>
			<p>{t('detail.unavailableDescription')}</p>
			<div>
				<Link href="/gym" passHref>
					{t('detail.back')}
				</Link>
				<Link href="/program" passHref>
					{t('detail.browseAllPrograms')}
				</Link>
			</div>
		</div>
	);
};

export const GymDetailSkeleton = () => {
	const { t } = useTranslation('gyms');
	const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	return (
		<div className="gym-detail-skeleton" role="status" aria-label={t('detail.loading')} aria-busy="true">
			<Skeleton variant="rectangular" className="gym-gallery-skeleton" animation={reduceMotion ? false : 'pulse'} />
			<div className="gym-identity-skeleton">
				<Skeleton height={42} width="70%" />
				<Skeleton width="50%" />
				<Skeleton width="35%" height={48} />
			</div>
			<div className="gym-info-skeleton">
				{[0, 1, 2].map((item) => (
					<div key={item}>
						<Skeleton width="45%" height={32} />
						<Skeleton />
						<Skeleton />
						<Skeleton />
					</div>
				))}
			</div>
			{[0, 1].map((item) => (
				<div className="gym-section-skeleton" key={item}>
					<Skeleton width="55%" height={36} />
					<div className="gym-child-grid">
						{[0, 1, 2].map((card) => (
							<Skeleton
								variant="rectangular"
								className="gym-child-skeleton"
								key={card}
								animation={reduceMotion ? false : 'pulse'}
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
};
