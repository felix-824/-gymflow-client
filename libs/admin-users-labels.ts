import en from '../public/locales/en/admin-users.json';
import kr from '../public/locales/kr/admin-users.json';
import ru from '../public/locales/ru/admin-users.json';

export const adminUsersLabels = (locale?: string) => (locale === 'kr' ? kr : locale === 'ru' ? ru : en);
