import React from 'react';
import Link from 'next/link';
import { Button } from '@mui/material';
import { useTranslation } from 'next-i18next';
import { TrainerApplicationStatus as Status } from '../../enums/trainer-application.enum';
import { TrainerApplication } from '../../types/trainer-application/trainer-application';
import { trainerWorkspaceRoute } from '../../trainer-application';

interface Props {
	application: TrainerApplication;
	canApplyAgain: boolean;
	onApplyAgain: () => void;
	canUseWorkspace: boolean;
	roleState: 'idle' | 'checking' | 'ready' | 'error';
	onRefreshRole: () => void;
	onWorkspace: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

const TrainerApplicationStatus = ({
	application,
	canApplyAgain,
	onApplyAgain,
	canUseWorkspace,
	roleState,
	onRefreshRole,
	onWorkspace,
}: Props) => {
	const { t } = useTranslation(['trainer-application', 'common']);
	const approved = application.status === Status.APPROVED;
	const rejected = application.status === Status.REJECTED;
	return (
		<div className="application-status-view">
			<section className="application-status-overview" aria-labelledby="application-status-heading">
				<p className={`application-status-label is-${application.status.toLowerCase()}`} role="status">
					{t(`Status ${application.status}`)}
				</p>
				<h2 id="application-status-heading">{t(`${application.status} title`)}</h2>
				<p>{t(`${application.status} copy`)}</p>
				{application.status === Status.PENDING && <p className="application-review-note">{t('Review note')}</p>}
				{rejected && (
					<div className="application-review-feedback">
						<h3>{t('Review feedback')}</h3>
						<p>{application.rejectionReason || t('Feedback unavailable')}</p>
					</div>
				)}
				{approved && (
					<div className="application-trainer-access">
						<h3>{t('Trainer Access')}</h3>
						<ul>
							{['Create Programs', 'Manage Schedule', 'Manage Reservations'].map((capability) => (
								<li key={capability}>{t(capability)}</li>
							))}
						</ul>
					</div>
				)}
				{approved && !canUseWorkspace && (
					<div className="application-role-reconciliation" role={roleState === 'error' ? 'alert' : 'status'}>
						<p>{t(roleState === 'error' ? 'Role refresh error' : 'Role refreshing')}</p>
						{roleState === 'error' && <Button onClick={onRefreshRole}>{t('Retry access')}</Button>}
					</div>
				)}
				<div className="application-actions">
					{rejected && (
						<Button type="button" variant="contained" disabled={!canApplyAgain} onClick={onApplyAgain}>
							{t('Apply again')}
						</Button>
					)}
					{approved &&
						(canUseWorkspace ? (
							<Link className="application-primary-link" href={trainerWorkspaceRoute} onClick={onWorkspace}>
								{t('Go to Trainer Workspace')}
							</Link>
						) : (
							<Button type="button" variant="contained" disabled>
								{t('Go to Trainer Workspace')}
							</Button>
						))}
					<Link href="/mypage?category=myProfile">{t(approved ? 'View profile' : 'Back to profile')}</Link>
				</div>
			</section>
			<section
				className="application-submitted-summary"
				aria-label={t(approved ? 'Approved Application' : 'Submitted application')}
			>
				{approved && <h2>{t('Approved Application')}</h2>}
				<dl>
					<div>
						<dt>{t('Full Name')}</dt>
						<dd>{application.fullName}</dd>
					</div>
					<div>
						<dt>{t('Training Specialties')}</dt>
						<dd className="application-submitted-categories">
							{application.categories.map((category) => (
								<span key={category}>{t(category, { ns: 'common' })}</span>
							))}
						</dd>
					</div>
					<div>
						<dt>{t('Coaching Experience')}</dt>
						<dd>{application.experienceSummary}</dd>
					</div>
					<div>
						<dt>{t('About You & Coaching Philosophy')}</dt>
						<dd>{application.bio}</dd>
					</div>
				</dl>
			</section>
		</div>
	);
};

export default TrainerApplicationStatus;
