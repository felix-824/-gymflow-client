import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { authErrorVar, authReadyVar, userVar } from '../../../../apollo/store';
import { getAuthSessionId } from '../../../auth';
import { MemberStatus, MemberType } from '../../../enums/member.enum';

const AdminGymAccess = ({ children }: { children: React.ReactNode }) => {
	const { t } = useTranslation('admin-gyms');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const error = useReactiveVar(authErrorVar);
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	if (!mounted || !ready || !router.isReady) return <p role="status">{t('auth.loading')}</p>;
	if (error) return <p role="alert">{t('auth.session')}</p>;
	if (!user._id || user.memberType !== MemberType.ADMIN || user.memberStatus !== MemberStatus.ACTIVE)
		return <p role="alert">{t('auth.forbidden')}</p>;
	return <React.Fragment key={`${user._id}:${getAuthSessionId()}`}>{children}</React.Fragment>;
};

export default AdminGymAccess;
