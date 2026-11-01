import en from '../public/locales/en/admin-programs.json';
import kr from '../public/locales/kr/admin-programs.json';
import ru from '../public/locales/ru/admin-programs.json';

export const adminProgramsLabels = (locale?: string) => (locale === 'kr' ? kr : locale === 'ru' ? ru : en);
