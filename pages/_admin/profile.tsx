import React from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withAdminLayout from '../../libs/components/layout/LayoutAdmin';
import MyProfile from '../../libs/components/mypage/MyProfile';

export const getStaticProps = async ({ locale }: { locale: string }) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const AdminProfile = () => <MyProfile adminProfile />;

export default withAdminLayout(AdminProfile);
