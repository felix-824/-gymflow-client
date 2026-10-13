import { TrainerScheduleDayOfWeek } from './enums/trainer-schedule.enum';
import {
	TrainerSchedule,
	TrainerScheduleFormDay,
	TrainerScheduleInput,
} from './types/trainer-schedule/trainer-schedule';

export const trainerScheduleWeekdays: TrainerScheduleDayOfWeek[] = [
	TrainerScheduleDayOfWeek.MON,
	TrainerScheduleDayOfWeek.TUE,
	TrainerScheduleDayOfWeek.WED,
	TrainerScheduleDayOfWeek.THU,
	TrainerScheduleDayOfWeek.FRI,
	TrainerScheduleDayOfWeek.SAT,
	TrainerScheduleDayOfWeek.SUN,
];

export function createScheduleForm(rows: TrainerSchedule[]): TrainerScheduleFormDay[] {
	return trainerScheduleWeekdays.map((dayOfWeek) => {
		const row = rows.find((entry) => entry.dayOfWeek === dayOfWeek);
		return {
			dayOfWeek,
			isAvailable: row?.isAvailable ?? false,
			startTime: row?.startTime ?? '09:00',
			endTime: row?.endTime ?? '18:00',
		};
	});
}

export function isScheduleTime(value: string): boolean {
	return value.length === 5 && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function getScheduleDayError(day: TrainerScheduleFormDay): 'Required times' | 'Time order' | null {
	if (!day.isAvailable) return null;
	if (!isScheduleTime(day.startTime) || !isScheduleTime(day.endTime)) return 'Required times';
	if (day.startTime >= day.endTime) return 'Time order';
	return null;
}

export function toTrainerScheduleInput(days: TrainerScheduleFormDay[]): TrainerScheduleInput {
	return {
		days: trainerScheduleWeekdays.map((dayOfWeek) => {
			const day = days.find((entry) => entry.dayOfWeek === dayOfWeek);
			return {
				dayOfWeek,
				isAvailable: day?.isAvailable ?? false,
				...(day?.isAvailable ? { startTime: day.startTime, endTime: day.endTime } : {}),
			};
		}),
	};
}

export function isScheduleDirty(current: TrainerScheduleFormDay[], baseline: TrainerScheduleFormDay[]): boolean {
	const canonical = (days: TrainerScheduleFormDay[]) =>
		trainerScheduleWeekdays.map((dayOfWeek) => {
			const day = days.find((entry) => entry.dayOfWeek === dayOfWeek);
			return day ? [dayOfWeek, day.isAvailable, day.startTime, day.endTime] : null;
		});
	return JSON.stringify(canonical(current)) !== JSON.stringify(canonical(baseline));
}
