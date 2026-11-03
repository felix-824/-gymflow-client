import React, { useEffect, useState } from 'react';
import { useReactiveVar } from '@apollo/client';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { Avatar } from '@mui/material';
import { authErrorVar, authReadyVar, userVar } from '../../../../apollo/store';
import { getAuthSessionId } from '../../../auth';
import { adminWorkspaceAccess } from '../../../admin-workspace';
import { REACT_APP_API_URL } from '../../../config';
import { AdminTrainerGymAccessRow } from '../../../types/trainer-gym-access/trainer-gym-access-admin';

export const AccessStatus = ({ status }: { status: AdminTrainerGymAccessRow['status'] }) => {
	const { t } = useTranslation('admin-gym-access');
	return <span className={`access-status is-${status.toLowerCase()}`}>{t(`status.${status}`)}</span>;
};
export const AccessDate = ({ value }: { value?: string | null }) => {
	const { locale } = useRouter();
	if (!value || !Number.isFinite(new Date(value).getTime())) return <span>—</span>;
	return (
		<time dateTime={value}>
			{new Date(value).toLocaleDateString(locale === 'kr' ? 'ko-KR' : locale === 'ru' ? 'ru-RU' : 'en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				timeZone: 'Asia/Seoul',
			})}
		</time>
	);
};
export const TrainerIdentity = ({ trainer }: { trainer: AdminTrainerGymAccessRow['trainerData'] }) => {
	const { t } = useTranslation('admin-gym-access');
	return (
		<div className="access-identity">
			<Avatar
				aria-hidden="true"
				src={trainer?.memberImage ? `${REACT_APP_API_URL}/${trainer.memberImage}` : undefined}
			/>
			<div>
				<strong>{trainer?.memberFullName || trainer?.memberNick || t('Trainer unavailable')}</strong>
				{trainer?.memberFullName && <span>{trainer.memberNick}</span>}
			</div>
		</div>
	);
};

const AdminGymAccess = ({ children }: { children: React.ReactNode }) => {
	const { t } = useTranslation('admin-gym-access');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const error = useReactiveVar(authErrorVar);
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	const access = adminWorkspaceAccess(mounted && ready && router.isReady, error, user);
	if (access !== 'ready')
		return (
			<p role={access === 'loading' ? 'status' : 'alert'}>
				{t(access === 'loading' ? 'Checking access' : 'Access denied')}
			</p>
		);
	return <React.Fragment key={`${user._id}:${getAuthSessionId()}`}>{children}</React.Fragment>;
};
export default AdminGymAccess;
