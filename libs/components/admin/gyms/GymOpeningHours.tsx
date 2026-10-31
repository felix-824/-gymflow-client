import React, { useId, useState } from 'react';
import { FormControlLabel, Switch, TextField } from '@mui/material';
import { useTranslation } from 'next-i18next';
import { TrainerScheduleDayOfWeek } from '../../../enums/trainer-schedule.enum';
import { GymOpeningHoursDayInput } from '../../../types/gym/gym.input';
import { createGymOpeningHoursForm, gymOpeningHoursDayError, gymOpeningHoursError } from '../../../admin-gyms';

export interface GymOpeningHoursProps {
	// This is a form draft. Call normalizeGymOpeningHours before constructing a save payload;
	// incomplete enabled drafts deliberately fail that validation.
	value: GymOpeningHoursDayInput[] | null;
	onChange: (value: GymOpeningHoursDayInput[] | null) => void;
	disabled?: boolean;
	showValidation?: boolean;
}

const GymOpeningHours = ({ value, onChange, disabled = false, showValidation = false }: GymOpeningHoursProps) => {
	const { t } = useTranslation('admin-gyms');
	const id = useId();
	const [touched, setTouched] = useState<Partial<Record<TrainerScheduleDayOfWeek, boolean>>>({});
	const noteId = `${id}-note`;
	const days = createGymOpeningHoursForm(value);
	const updateDay = (dayOfWeek: TrainerScheduleDayOfWeek, patch: Partial<GymOpeningHoursDayInput>) => {
		if (disabled || !value) return;
		onChange(
			days.map((day) => {
				const next = day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day;
				return next.isClosed ? { ...next, openTime: null, closeTime: null } : next;
			}),
		);
	};
	const structureError = value && gymOpeningHoursError(value) === 'hours.sevenDays';
	return (
		<fieldset className="admin-gym-control gym-hours" disabled={disabled} aria-describedby={noteId}>
			<legend>{t('hours.title')}</legend>
			<div className="gym-hours-heading">
				<FormControlLabel
					label={t('hours.supplied')}
					control={
						<Switch
							checked={value !== null}
							disabled={disabled}
							inputProps={{ role: 'switch' }}
							onChange={(_, checked) => {
								if (disabled) return;
								setTouched({});
								onChange(checked ? createGymOpeningHoursForm(null) : null);
							}}
						/>
					}
				/>
				<p>{t(value === null ? 'hours.unknown' : 'hours.draftHelp')}</p>
			</div>
			{value !== null && (
				<div className="gym-hours-week">
					{days.map((day) => {
						const { dayOfWeek } = day;
						const label = t(`hours.weekdays.${dayOfWeek}`);
						const error = showValidation || touched[dayOfWeek] ? gymOpeningHoursDayError(day) : null;
						const errorId = `${id}-${dayOfWeek}-error`;
						const describedBy = error ? `${noteId} ${errorId}` : noteId;
						return (
							<div className={`gym-hours-day${day.isClosed ? ' is-closed' : ''}`} key={dayOfWeek}>
								<h3>{label}</h3>
								<FormControlLabel
									className="gym-hours-state"
									label={t(day.isClosed ? 'hours.closed' : 'hours.open')}
									control={
										<Switch
											checked={!day.isClosed}
											disabled={disabled}
											inputProps={{ role: 'switch', 'aria-label': `${label}: ${t('hours.open')}` }}
											onChange={(_, isOpen) =>
												updateDay(dayOfWeek, {
													isClosed: !isOpen,
													openTime: isOpen ? '' : null,
													closeTime: isOpen ? '' : null,
												})
											}
										/>
									}
								/>
								<div className="gym-hours-times">
									{(['openTime', 'closeTime'] as const).map((field) => (
										<TextField
											key={field}
											type="time"
											size="small"
											id={`${id}-${dayOfWeek}-${field}`}
											label={t(`hours.${field}`)}
											value={day[field] ?? ''}
											disabled={disabled || day.isClosed}
											error={Boolean(error)}
											InputLabelProps={{ shrink: true }}
											inputProps={{
												step: 60,
												min: '00:00',
												max: '23:59',
												'aria-label': t(field === 'openTime' ? 'hours.openLabel' : 'hours.closeLabel', { day: label }),
												'aria-invalid': Boolean(error),
												'aria-describedby': describedBy,
											}}
											onBlur={() => setTouched((current) => ({ ...current, [dayOfWeek]: true }))}
											onChange={(event) => updateDay(dayOfWeek, { [field]: event.target.value })}
										/>
									))}
								</div>
								{error && (
									<p id={errorId} role="alert" className="gym-control-error gym-hours-day-error">
										{t(error)}
									</p>
								)}
							</div>
						);
					})}
				</div>
			)}
			{showValidation && structureError && (
				<p className="gym-control-error" role="alert">
					{t('hours.sevenDays')}
				</p>
			)}
			<p className="gym-control-note" id={noteId}>
				{t('hours.note')}
			</p>
		</fieldset>
	);
};

export default GymOpeningHours;
