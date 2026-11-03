import { i18n } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import GymAccessDetail from '../../../libs/components/admin/gym-access/GymAccessDetail';

export const getStaticProps = async ({ locale }: { locale: string }) => {
	if (process.env.NODE_ENV === 'development') await i18n?.reloadResources(locale, ['admin-gym-access']);
	return { props: { ...(await serverSideTranslations(locale, ['common', 'admin-gym-access'])) } };
};
export default withAdminLayout(GymAccessDetail);
