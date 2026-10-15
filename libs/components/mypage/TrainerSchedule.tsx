import React, { useEffect, useRef, useState } from 'react';
import { TrainerWorkspaceHeader, TrainerWorkspaceNavigation } from './TrainerWorkspaceNavigation';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { GET_MY_TRAINER_SCHEDULE } from '../../../apollo/user/query';
import { SAVE_MY_TRAINER_SCHEDULE } from '../../../apollo/user/mutation';
import { userVar } from '../../../apollo/store';
import {
	createScheduleForm,
	getScheduleDayError,
	isScheduleDirty,
	isScheduleTime,
	toTrainerScheduleInput,
} from '../../trainer-schedule';
import { TrainerScheduleDayOfWeek } from '../../enums/trainer-schedule.enum';
import {
	TrainerSchedule as ScheduleEntry,
	TrainerScheduleFormDay,
	TrainerScheduleInput,
} from '../../types/trainer-schedule/trainer-schedule';

const weekdayLabels: Record<TrainerScheduleDayOfWeek, string> = {
	MON: 'Monday',
	TUE: 'Tuesday',
	WED: 'Wednesday',
	THU: 'Thursday',
	FRI: 'Friday',
	SAT: 'Saturday',
	SUN: 'Sunday',
};

const TrainerSchedule = () => {
	const { t } = useTranslation('common');
	const user = useReactiveVar(userVar);
	const [days, setDays] = useState<TrainerScheduleFormDay[]>(() => createScheduleForm([]));
	const [baseline, setBaseline] = useState<TrainerScheduleFormDay[]>(() => createScheduleForm([]));
	const [initialized, setInitialized] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const [saved, setSaved] = useState(false);
	const initializedRef = useRef(false);
	const savingRef = useRef(false);
	const mountedRef = useRef(true);

	/** APOLLO REQUESTS **/
	const { loading, error, refetch } = useQuery<{ getMyTrainerSchedule: ScheduleEntry[] }>(GET_MY_TRAINER_SCHEDULE, {
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: { queryDeduplication: false },
		onCompleted: (data) => {
			// A same-session profile refresh must never replace a local draft.
			if (initializedRef.current) return;
			const nextDays = createScheduleForm(data.getMyTrainerSchedule);
			initializedRef.current = true;
			setDays(nextDays);
			setBaseline(nextDays);
			setInitialized(true);
		},
	});
	const [saveSchedule, { loading: saving }] = useMutation<
		{ saveMyTrainerSchedule: ScheduleEntry[] },
		{ input: TrainerScheduleInput }
	>(SAVE_MY_TRAINER_SCHEDULE, { fetchPolicy: 'no-cache' });

	/** LIFECYCLES **/
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);
	useEffect(() => {
		if (!saved) return;
		const timer = window.setTimeout(() => setSaved(false), 3500);
		return () => window.clearTimeout(timer);
	}, [saved]);

	const dirty = isScheduleDirty(days, baseline);
	const invalid = days.some((day) => Boolean(getScheduleDayError(day)));
	const canSave = initialized && dirty && !invalid && !saving && !loading;

	/** HANDLERS **/
	const updateDay = (weekday: TrainerScheduleDayOfWeek, values: Partial<TrainerScheduleFormDay>) => {
		if (savingRef.current || !initialized) return;
		setSaved(false);
		setSaveError(false);
		setDays((current) =>
			current.map((day) => {
				if (day.dayOfWeek !== weekday) return day;
				const nextDay = { ...day, ...values };
				if (values.isAvailable) {
					if (!isScheduleTime(nextDay.startTime)) nextDay.startTime = '09:00';
					if (!isScheduleTime(nextDay.endTime)) nextDay.endTime = '18:00';
				}
				return nextDay;
			}),
		);
	};
	const saveHandler = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!canSave || savingRef.current) return;
		savingRef.current = true;
		setSaved(false);
		setSaveError(false);
		try {
			const result = await saveSchedule({ variables: { input: toTrainerScheduleInput(days) } });
			if (!result.data || result.errors?.length) throw new Error('Schedule save did not return a complete result');
			if (!mountedRef.current) return;
			const nextDays = createScheduleForm(result.data.saveMyTrainerSchedule);
			setDays(nextDays);
			setBaseline(nextDays);
			setSaved(true);
		} catch (err) {
			if (mountedRef.current) setSaveError(true);
		} finally {
			savingRef.current = false;
		}
	};
	const retryHandler = async () => {
		try {
			await refetch();
		} catch (err) {
			/* The query's error state provides retry feedback. */
		}
	};

	return (
		<div className="trainer-schedule-workspace">
			<TrainerWorkspaceHeader active="Schedule" />
			<section className="schedule-content" aria-labelledby="schedule-title">
				<form onSubmit={saveHandler} noValidate aria-busy={saving || loading}>
					<div className="schedule-page-header">
						<div className="schedule-heading">
							<p className="schedule-context">
								<span>{t('Trainer schedule.Workspace')}</span>
								<span aria-hidden="true">/</span>
								<span>{t('Trainer schedule.Availability')}</span>
							</p>
							<p className="schedule-timezone">
								<ScheduleOutlinedIcon aria-hidden="true" />
								{t('Trainer schedule.Timezone')}
							</p>
							<h1 id="schedule-title">{t('Trainer schedule.Title')}</h1>
							<p className="schedule-description schedule-desktop-copy">{t('Trainer schedule.Description')}</p>
							<p className="schedule-description schedule-mobile-copy">{t('Trainer schedule.Mobile description')}</p>
						</div>
						<div className="schedule-save-area">
							<span
								className={`schedule-save-status${dirty && !saving ? ' is-dirty' : ''}`}
								role="status"
								aria-live="polite"
							>
								{saving
									? t('Trainer schedule.Saving')
									: saved
									? t('Trainer schedule.Saved')
									: dirty
									? t('Trainer schedule.Unsaved')
									: ''}
							</span>
							<button type="submit" className="schedule-save-button" disabled={!canSave}>
								<CalendarMonthOutlinedIcon aria-hidden="true" />
								{saving ? t('Trainer schedule.Saving') : t('Trainer schedule.Save')}
							</button>
							<p className="schedule-save-helper">{t('Trainer schedule.Save helper')}</p>
						</div>
					</div>
					{saveError && (
						<p className="schedule-request-error" role="alert">
							{t('Trainer schedule.Save error')}
						</p>
					)}
					{!initialized && (
						<div className="schedule-load-state" role={error ? 'alert' : 'status'}>
							<p>{t(`Trainer schedule.${error ? 'Load error' : 'Loading'}`)}</p>
							{error && (
								<button type="button" onClick={retryHandler} disabled={loading}>
									{t('Trainer schedule.Retry')}
								</button>
							)}
						</div>
					)}
					{initialized && (
						<div className="schedule-week">
							<div className="schedule-column-headings" aria-hidden="true">
								<span>{t('Trainer schedule.Day of week')}</span>
								<span>{t('Trainer schedule.Availability')}</span>
								<span>{t('Trainer schedule.Working hours')}</span>
							</div>
							{days.map((day) => {
								const label = t(`Trainer schedule.${weekdayLabels[day.dayOfWeek]}`);
								const dayError = getScheduleDayError(day);
								const errorId = `schedule-${day.dayOfWeek}-error`;
								return (
									<div className={`schedule-day${day.isAvailable ? '' : ' is-off'}`} key={day.dayOfWeek}>
										<h2>
											<span className="schedule-day-initial" aria-hidden="true">
												{Array.from(label)[0]}
											</span>
											{label}
										</h2>
										<button
											type="button"
											className="schedule-availability"
											role="switch"
											aria-checked={day.isAvailable}
											aria-label={t('Trainer schedule.Day availability', { day: label })}
											disabled={saving}
											onClick={() => updateDay(day.dayOfWeek, { isAvailable: !day.isAvailable })}
										>
											<span className="schedule-toggle-available">{t('Trainer schedule.Available')}</span>
											<span className="schedule-toggle-off">{t('Trainer schedule.Off')}</span>
											<span className="schedule-mobile-availability">
												{t(`Trainer schedule.${day.isAvailable ? 'Available' : 'Unavailable'}`)}
											</span>
										</button>
										<div className="schedule-working-hours">
											<div className="schedule-time-pair">
												{(['startTime', 'endTime'] as const).map((field) => (
													<label key={field} className="schedule-time-control">
														<span>{t(`Trainer schedule.${field === 'startTime' ? 'Start' : 'End'}`)}</span>
														<input
															type="time"
															step="60"
															value={day[field]}
															disabled={!day.isAvailable || saving}
															aria-label={t(`Trainer schedule.${field === 'startTime' ? 'Start label' : 'End label'}`, {
																day: label,
															})}
															aria-invalid={Boolean(dayError)}
															aria-describedby={dayError ? errorId : undefined}
															onChange={(event) => updateDay(day.dayOfWeek, { [field]: event.target.value })}
														/>
													</label>
												))}
											</div>
											{dayError && (
												<p id={errorId} className="schedule-day-error" role="alert">
													{t(`Trainer schedule.${dayError}`)}
												</p>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
					<p className="schedule-note">
						<InfoOutlinedIcon aria-hidden="true" />
						{t('Trainer schedule.Note')}
					</p>
				</form>
			</section>
			<TrainerWorkspaceNavigation active="Schedule" mobile />
		</div>
	);
};

export default TrainerSchedule;
