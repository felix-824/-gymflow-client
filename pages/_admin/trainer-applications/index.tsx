import { i18n } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import TrainerApplications from '../../../libs/components/admin/trainer-applications/TrainerApplications';

export const getStaticProps = async ({ locale }: { locale: string }) => {
	if (process.env.NODE_ENV === 'development') await i18n?.reloadResources(locale, ['admin-trainer-applications']);
	return { props: { ...(await serverSideTranslations(locale, ['common', 'admin-trainer-applications'])) } };
};

export default withAdminLayout(TrainerApplications);
