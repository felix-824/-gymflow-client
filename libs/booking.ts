import { ProgramType } from './enums/program.enum';
import { AvailableSlot, BookingSelection } from './types/reservation/reservation';
import { ReservationInput } from './types/reservation/reservation.input';

export const bookingWindowDays = 28;
export const bookingTimezone = 'Asia/Seoul';

export const isBookingProgram = (type: ProgramType) => type === ProgramType.PT_1ON1 || type === ProgramType.GROUP_CLASS;

export function seoulToday(now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: bookingTimezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	return `${value('year')}-${value('month')}-${value('day')}`;
}

export function isBookingDate(date: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	const parsed = new Date(date + 'T00:00:00.000Z');
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

// UTC is a date-only calendar carrier, not a conversion of Seoul booking times.
export function addBookingDays(date: string, days: number): string {
	if (!isBookingDate(date)) return '';
	const parsed = new Date(date + 'T00:00:00.000Z');
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}

export const isBrowsableBookingDate = (date: string, today: string) =>
	isBookingDate(date) && date >= today && date <= addBookingDays(today, bookingWindowDays - 1);

export function formatBookingDate(date: string, locale: string, options: Intl.DateTimeFormatOptions): string {
	if (!isBookingDate(date)) return '';
	const language = locale === 'kr' ? 'ko-KR' : locale === 'ru' ? 'ru-RU' : 'en-US';
	return new Intl.DateTimeFormat(language, { ...options, timeZone: bookingTimezone }).format(
		new Date(date + 'T00:00:00+09:00'),
	);
}

export function currentBookingSelection(
	selection: BookingSelection | null,
	programId: string,
	date: string,
	slots: AvailableSlot[],
): selection is BookingSelection {
	return Boolean(
		selection &&
			selection.programId === programId &&
			selection.reservationDate === date &&
			slots.some((slot) => slot.startTime === selection.startTime && slot.endTime === selection.endTime),
	);
}

export function reservationPayload(selection: BookingSelection): ReservationInput {
	return { programId: selection.programId, reservationDate: selection.reservationDate, startTime: selection.startTime };
}

export function bookingErrorKind(error: any): 'unknown' | 'conflict' | 'rejected' {
	if (error?.networkError || !error?.graphQLErrors?.length) return 'unknown';
	return error.graphQLErrors.some(
		(item: any) => item.extensions?.originalError?.statusCode === 409 || item.extensions?.code === 'CONFLICT',
	)
		? 'conflict'
		: 'rejected';
}
