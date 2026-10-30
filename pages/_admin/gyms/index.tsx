import { i18n } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import Gyms from '../../../libs/components/admin/gyms/Gyms';

export const getStaticProps = async ({ locale }: { locale: string }) => {
	if (process.env.NODE_ENV === 'development') await i18n?.reloadResources(locale, ['admin-gyms']);
	return { props: { ...(await serverSideTranslations(locale, ['common', 'admin-gyms'])) } };
};

export default withAdminLayout(Gyms);
