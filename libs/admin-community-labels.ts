import en from '../public/locales/en/admin-community.json';
import kr from '../public/locales/kr/admin-community.json';
import ru from '../public/locales/ru/admin-community.json';
import enCommon from '../public/locales/en/common.json';
import krCommon from '../public/locales/kr/common.json';
import ruCommon from '../public/locales/ru/common.json';
import { adminProgramsLabels } from './admin-programs-labels';

export const adminCommunityLabels = (locale?: string) => {
	const labels = locale === 'kr' ? kr : locale === 'ru' ? ru : en;
	const common = locale === 'kr' ? krCommon : locale === 'ru' ? ruCommon : enCommon;
	return {
		...adminProgramsLabels(locale),
		...labels,
		categories: common['Community discovery'],
		views: common['Community discovery'].Views,
		likes: common['Community discovery'].Likes,
	};
};
