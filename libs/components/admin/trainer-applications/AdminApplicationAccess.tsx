import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { authErrorVar, authReadyVar, userVar } from '../../../../apollo/store';
import { getAuthSessionId } from '../../../auth';
import { adminTrainerApplicationsAccess } from '../../../admin-trainer-applications';

const AdminApplicationAccess = ({ children }: { children: React.ReactNode }) => {
	const { t } = useTranslation('admin-trainer-applications');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const error = useReactiveVar(authErrorVar);
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	const access = adminTrainerApplicationsAccess(mounted && ready && router.isReady, error, user);
	if (access !== 'ready') return <p role={access === 'initializing' ? 'status' : 'alert'}>{t(access)}</p>;
	return <React.Fragment key={`${user._id}:${getAuthSessionId()}`}>{children}</React.Fragment>;
};

export default AdminApplicationAccess;
