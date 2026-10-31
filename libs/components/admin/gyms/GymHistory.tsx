import React from 'react';
import { useTranslation } from 'next-i18next';
import { AdminGym } from '../../../types/gym/gym';
import { GymPhotoPreview } from './GymImages';

// The terminal state of the same detail route; no form or mutation controls mount here.
const GymHistory = ({ gym }: { gym: AdminGym }) => {
	const { t } = useTranslation(['admin-gyms', 'common']);
	const details = [
		['basic.name', gym.gymName],
		['basic.location', t(gym.gymLocation, { ns: 'common' })],
		['basic.address', gym.gymAddress],
		['basic.description', gym.gymDesc],
		['basic.phone', gym.gymPhone],
	];
	return (
		<div className="gym-history">
			<div className="gym-editor-notice" role="status">
				<p>{t('lifecycle.terminal')}</p>
				<p>{t('lifecycle.historyIntro')}</p>
			</div>
			<section className="admin-gym-control" aria-labelledby="gym-history-basic">
				<h2 id="gym-history-basic">{t('basic.title')}</h2>
				<dl className="gym-history-details">
					{details.map(([key, value]) => (
						<div key={key}>
							<dt>{t(key!)}</dt>
							<dd>{value || t('lifecycle.notSupplied')}</dd>
						</div>
					))}
				</dl>
			</section>
			<section className="admin-gym-control" aria-labelledby="gym-history-photos">
				<h2 id="gym-history-photos">{t('photos.editTitle')}</h2>
				<div className="gym-history-photos">
					{gym.gymImages.map((path, index) => (
						<div className="gym-photo-preview" key={path}>
							<GymPhotoPreview path={path} alt={t('photos.alt', { index: index + 1 })} />
						</div>
					))}
				</div>
			</section>
			<section className="admin-gym-control" aria-labelledby="gym-history-amenities">
				<h2 id="gym-history-amenities">{t('amenities.editTitle')}</h2>
				{gym.amenities.length ? (
					<ul>
						{gym.amenities.map((amenity) => (
							<li key={amenity}>{t(`amenities.${amenity}`)}</li>
						))}
					</ul>
				) : (
					<p>{t('lifecycle.noAmenities')}</p>
				)}
			</section>
			<section className="admin-gym-control" aria-labelledby="gym-history-hours">
				<h2 id="gym-history-hours">{t('hours.title')}</h2>
				{gym.openingHours ? (
					<dl className="gym-history-hours">
						{gym.openingHours.map((day) => (
							<div key={day.dayOfWeek}>
								<dt>{t(`hours.weekdays.${day.dayOfWeek}`)}</dt>
								<dd>{day.isClosed ? t('hours.closed') : `${day.openTime} – ${day.closeTime}`}</dd>
							</div>
						))}
					</dl>
				) : (
					<p>{t('hours.unknown')}</p>
				)}
				<p className="gym-control-note">{t('hours.note')}</p>
			</section>
		</div>
	);
};

export default GymHistory;
