import React from 'react';
import { useTranslation } from 'next-i18next';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { GymAmenity, GymLocation } from '../../enums/gym.enum';
import { GymSearch } from '../../types/gym/gym.input';

interface GymFiltersProps {
	search: GymSearch;
	onChange: (search: GymSearch) => void;
}

const GymFilters = ({ search, onChange }: GymFiltersProps) => {
	const { t } = useTranslation('gyms');
	const toggleLocation = (value: GymLocation) => {
		const selected = search.locationList ?? [];
		onChange({
			...search,
			locationList: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
		});
	};
	const toggleAmenity = (value: GymAmenity) => {
		const selected = search.amenities ?? [];
		onChange({
			...search,
			amenities: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
		});
	};
	return (
		<div className="gym-filter-groups">
			<fieldset className="gym-location-filter">
				<legend>{t('filters.location')}</legend>
				<div className="gym-location-options">
					{Object.values(GymLocation).map((location) => (
						<button
							type="button"
							key={location}
							aria-pressed={search.locationList?.includes(location) ?? false}
							onClick={() => toggleLocation(location)}
						>
							{search.locationList?.includes(location) && <CheckRoundedIcon aria-hidden="true" />}
							{t(`locations.${location}`)}
						</button>
					))}
				</div>
			</fieldset>
			<fieldset className="gym-amenity-filter">
				<legend>{t('filters.amenities')}</legend>
				<p className="gym-amenities-hint">{t('filters.amenitiesHint')}</p>
				<div className="gym-amenity-options">
					{Object.values(GymAmenity).map((amenity) => (
						<label key={amenity}>
							<input
								type="checkbox"
								checked={search.amenities?.includes(amenity) ?? false}
								onChange={() => toggleAmenity(amenity)}
							/>
							<span>{t(`amenities.${amenity}`)}</span>
						</label>
					))}
				</div>
			</fieldset>
		</div>
	);
};

export default GymFilters;
