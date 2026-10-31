import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { ImageSquare } from 'phosphor-react';
import { REACT_APP_API_URL } from '../../config';
import { isGymImagePath } from '../../gym';
import { Gym } from '../../types/gym/gym';

export type GymCatalogItem = Pick<
	Gym,
	'_id' | 'gymName' | 'gymLocation' | 'gymAddress' | 'gymDesc' | 'gymImages' | 'amenities' | 'createdAt' | 'updatedAt'
>;

const GymCard = ({ gym }: { gym: GymCatalogItem }) => {
	const { t } = useTranslation('gyms');
	const [failedImage, setFailedImage] = useState('');
	const cover = gym.gymImages?.[0];
	const imageUrl = isGymImagePath(cover) ? `${REACT_APP_API_URL}/${cover}` : '';
	const amenities = gym.amenities ?? [];
	const imageAlt = t('catalog.coverAlt', { name: gym.gymName });
	return (
		<article className="gym-card">
			<Link
				passHref
				href={{ pathname: '/gym/detail', query: { id: gym._id } }}
				className="gym-card-link"
				aria-label={`${t('catalog.viewGym')}: ${gym.gymName}`}
			>
				<div className="gym-card-cover">
					{imageUrl && imageUrl !== failedImage ? (
						// Gym upload paths are served by the existing API image origin.
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={imageUrl}
							alt={imageAlt}
							loading="lazy"
							decoding="async"
							onError={() => setFailedImage(imageUrl)}
						/>
					) : (
						<div className="gym-cover-fallback" role="img" aria-label={imageAlt}>
							<ImageSquare size={40} aria-hidden="true" />
						</div>
					)}
				</div>
				<div className="gym-card-content">
					<div className="gym-card-heading">
						<span className="gym-card-location">{t(`locations.${gym.gymLocation}`)}</span>
						<h2>{gym.gymName}</h2>
						<p className="gym-card-address">{gym.gymAddress}</p>
					</div>
					{gym.gymDesc && <p className="gym-card-description">{gym.gymDesc}</p>}
					<div className="gym-card-footer">
						<div className="gym-card-amenities">
							{amenities.slice(0, 3).map((amenity) => (
								<span key={amenity}>{t(`amenities.${amenity}`)}</span>
							))}
							{amenities.length > 3 && (
								<span
									className="gym-card-more"
									aria-label={t('catalog.moreAmenities', { count: amenities.length - 3 })}
								>
									+{amenities.length - 3}
								</span>
							)}
						</div>
						<span className="gym-card-action">
							{t('catalog.viewGym')}
							<ArrowForwardRoundedIcon aria-hidden="true" />
						</span>
					</div>
				</div>
			</Link>
		</article>
	);
};

export default GymCard;
