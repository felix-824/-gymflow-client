import React from 'react';
import Head from 'next/head';
import { useMediaQuery } from '@mui/material';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import LocalParkingOutlinedIcon from '@mui/icons-material/LocalParkingOutlined';
import ShowerOutlinedIcon from '@mui/icons-material/ShowerOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import HotTubOutlinedIcon from '@mui/icons-material/HotTubOutlined';
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import { useTranslation } from 'next-i18next';
import { Gym } from '../../types/gym/gym';
import { GymAmenity } from '../../enums/gym.enum';
import { TrainerScheduleDayOfWeek } from '../../enums/trainer-schedule.enum';
import GymGallery from './GymGallery';
import { GymPrograms, GymTrainers } from './GymOfferings';

const amenityIcons = {
	[GymAmenity.PARKING]: LocalParkingOutlinedIcon,
	[GymAmenity.SHOWER]: ShowerOutlinedIcon,
	[GymAmenity.LOCKER]: LockOutlinedIcon,
	[GymAmenity.SAUNA]: HotTubOutlinedIcon,
	[GymAmenity.WIFI]: WifiOutlinedIcon,
	[GymAmenity.TOWEL]: CheckroomOutlinedIcon,
};

const GymVenue = ({ gym }: { gym: Gym }) => {
	const { t } = useTranslation('gyms');
	const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const days = Object.values(TrainerScheduleDayOfWeek).map((day) =>
		gym.openingHours?.find((hours) => hours.dayOfWeek === day),
	);
	const completeHours = gym.openingHours?.length === 7 && days.every(Boolean);
	return (
		<>
			<Head>
				<title>{gym.gymName} | GymFlow</title>
			</Head>
			<GymGallery images={gym.gymImages} name={gym.gymName} />
			<header className="gym-detail-identity">
				<div>
					<h1>{gym.gymName}</h1>
					<p className="gym-detail-location">{t(`locations.${gym.gymLocation}`)}</p>
					<p>{gym.gymAddress}</p>
				</div>
				<a
					className="gym-browse-programs"
					href="#gym-programs"
					onClick={(event) => {
						const section = document.getElementById('gym-programs');
						if (section) {
							event.preventDefault();
							section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
							section.focus({ preventScroll: true });
						}
					}}
				>
					{t('detail.browsePrograms')}
					<ArrowDownwardRoundedIcon aria-hidden="true" />
				</a>
			</header>
			<div className="gym-detail-information">
				<div className="gym-detail-overview">
					{gym.gymDesc?.trim() && (
						<section className="gym-detail-about" aria-labelledby="gym-about-title">
							<h2 id="gym-about-title">{t('detail.about')}</h2>
							<p>{gym.gymDesc}</p>
						</section>
					)}
					{gym.amenities.length > 0 && (
						<section className="gym-detail-amenities" aria-labelledby="gym-amenities-title">
							<h2 id="gym-amenities-title">{t('filters.amenities')}</h2>
							<ul>
								{gym.amenities.map((amenity) => {
									const Icon = amenityIcons[amenity];
									return (
										<li key={amenity}>
											{Icon && <Icon aria-hidden="true" />}
											<span>{t(`amenities.${amenity}`)}</span>
										</li>
									);
								})}
							</ul>
						</section>
					)}
				</div>
				<aside className="gym-detail-practical">
					<section className="gym-detail-hours" aria-labelledby="gym-hours-title">
						<h2 id="gym-hours-title">{t('detail.openingHours')}</h2>
						<p className="gym-detail-timezone">{t('detail.timezone')}</p>
						{completeHours ? (
							<dl>
								{days.map(
									(day) =>
										day && (
											<div key={day.dayOfWeek}>
												<dt>{t(`weekdays.${day.dayOfWeek}`)}</dt>
												<dd>
													{day.isClosed ? (
														t('detail.closed')
													) : (
														<>
															<time dateTime={day.openTime ?? ''}>{day.openTime}</time>
															<span aria-hidden="true"> – </span>
															<time dateTime={day.closeTime ?? ''}>{day.closeTime}</time>
														</>
													)}
												</dd>
											</div>
										),
								)}
							</dl>
						) : (
							<p>{t('detail.hoursNotProvided')}</p>
						)}
					</section>
					{gym.gymPhone?.trim() && (
						<section className="gym-detail-contact" aria-labelledby="gym-contact-title">
							<h2 id="gym-contact-title">{t('detail.contact')}</h2>
							<p>{gym.gymPhone}</p>
							<a href={`tel:${gym.gymPhone.replace(/[^\d+]/g, '')}`}>
								<PhoneOutlinedIcon aria-hidden="true" />
								{t('detail.call')}
							</a>
						</section>
					)}
				</aside>
			</div>
			<GymPrograms gymId={gym._id} />
			<GymTrainers gymId={gym._id} />
		</>
	);
};

export default GymVenue;
