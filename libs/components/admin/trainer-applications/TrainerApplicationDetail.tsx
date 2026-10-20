import React, { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import {
	Avatar,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	FormLabel,
	TextField,
} from '@mui/material';
import { GET_TRAINER_APPLICATION_BY_ADMIN } from '../../../../apollo/admin/query';
import { REVIEW_TRAINER_APPLICATION } from '../../../../apollo/admin/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../../apollo/store';
import { getAuthSessionId } from '../../../auth';
import { TrainerApplicationStatus as Status } from '../../../enums/trainer-application.enum';
import {
	TrainerApplicationReview,
	TrainerApplicationReviewDetail,
} from '../../../types/trainer-application/trainer-application-admin';
import {
	adminTrainerApplicationsAccess,
	adminTrainerApplicationsRoute,
	trainerApplicantInitials,
	trainerApplicationId,
	trainerReviewConflict,
	trainerReviewFeedbackValid,
	trainerReviewPayload,
} from '../../../admin-trainer-applications';
import AdminApplicationAccess from './AdminApplicationAccess';

const ApplicationDetail = ({ applicationId }: { applicationId: string }) => {
	const { t } = useTranslation(['admin-trainer-applications', 'common']);
	const identity = useRef({ ownerId: userVar()._id, session: getAuthSessionId() });
	const mounted = useRef(true);
	const writeLock = useRef(false);
	const readLock = useRef(false);
	const feedbackInput = useRef<HTMLInputElement>(null);
	const [application, setApplication] = useState<TrainerApplicationReviewDetail>();
	const [invalidRead, setInvalidRead] = useState(false);
	const [dialog, setDialog] = useState<TrainerApplicationReview['decision'] | null>(null);
	const [feedback, setFeedback] = useState('');
	const [feedbackError, setFeedbackError] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [recovery, setRecovery] = useState<'Conflict' | 'Uncertain' | null>(null);
	const active = () =>
		mounted.current &&
		adminTrainerApplicationsAccess(authReadyVar(), authErrorVar(), userVar()) === 'ready' &&
		userVar()._id === identity.current.ownerId &&
		getAuthSessionId() === identity.current.session;
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const query = useQuery<{ getTrainerApplicationByAdmin: TrainerApplicationReviewDetail }>(
		GET_TRAINER_APPLICATION_BY_ADMIN,
		{
			variables: { applicationId },
			fetchPolicy: 'no-cache',
			notifyOnNetworkStatusChange: true,
			context: { handleErrorLocally: true, queryDeduplication: false },
			onCompleted: (data) => {
				if (!active()) return;
				const next = data.getTrainerApplicationByAdmin;
				if (next?._id !== applicationId || !Object.values(Status).includes(next.status)) {
					setInvalidRead(true);
					return;
				}
				setApplication(next);
				setInvalidRead(false);
				setRecovery(null);
				if (next.status !== Status.PENDING) setDialog(null);
			},
		},
	);
	const [review] = useMutation<
		{ reviewTrainerApplication: TrainerApplicationReviewDetail },
		{ input: TrainerApplicationReview }
	>(REVIEW_TRAINER_APPLICATION, {
		context: { handleErrorLocally: true },
	});
	const refresh = async () => {
		if (!active() || writeLock.current || readLock.current || query.loading) return;
		readLock.current = true;
		try {
			await query.refetch();
		} catch {
			/* Render the safe query error and retain the recovery requirement. */
		} finally {
			readLock.current = false;
		}
	};
	const canReview =
		application?.status === Status.PENDING &&
		!query.loading &&
		!query.error &&
		!invalidRead &&
		!recovery &&
		!submitting;
	const openDialog = (decision: TrainerApplicationReview['decision']) => {
		if (!active() || !canReview || writeLock.current || readLock.current) return;
		setFeedbackError(false);
		setDialog(decision);
	};
	const confirm = async (event: FormEvent) => {
		event.preventDefault();
		if (!active() || !canReview || !dialog || writeLock.current || readLock.current) return;
		if (dialog === Status.REJECTED && !trainerReviewFeedbackValid(feedback)) {
			setFeedbackError(true);
			feedbackInput.current?.focus();
			return;
		}
		writeLock.current = true;
		setSubmitting(true);
		try {
			const result = await review({ variables: { input: trainerReviewPayload(applicationId, dialog, feedback) } });
			if (!active()) return;
			const next = result.data?.reviewTrainerApplication;
			if (next?._id !== applicationId || next.status !== dialog) throw new Error('Unconfirmed review');
			setApplication(next);
			setFeedback('');
			setDialog(null);
		} catch (error) {
			if (!active()) return;
			setRecovery(trainerReviewConflict(error) ? 'Conflict' : 'Uncertain');
			setDialog(null);
		} finally {
			writeLock.current = false;
			if (active()) setSubmitting(false);
		}
	};
	return (
		<div className="content admin-trainer-applications">
			<nav className="admin-application-back">
				<Link href={adminTrainerApplicationsRoute}>{t('Back to Applications')}</Link>
			</nav>
			<header className="admin-application-heading">
				<h1>{t('Detail title')}</h1>
			</header>
			{recovery && (
				<div className="admin-application-recovery" role="alert">
					<p>{t(recovery)}</p>
					<Button disabled={query.loading} onClick={() => void refresh()}>
						{t('Refresh')}
					</Button>
				</div>
			)}
			{(query.error || invalidRead) && (
				<div role="alert">
					<p>{t('Load error')}</p>
					{!recovery && (
						<Button disabled={query.loading} onClick={() => void refresh()}>
							{t('Retry')}
						</Button>
					)}
				</div>
			)}
			{!application ? (
				query.loading ? (
					<p role="status">{t('Loading')}</p>
				) : null
			) : (
				<article className="admin-application-detail">
					<header className="admin-application-applicant">
						<Avatar aria-hidden="true">{trainerApplicantInitials(application.fullName)}</Avatar>
						<div>
							<h2>{application.fullName}</h2>
							<span className={`admin-application-status is-${application.status.toLowerCase()}`}>
								{t(`Status ${application.status}`)}
							</span>
						</div>
					</header>
					<dl>
						<div>
							<dt>{t('Training Specialties')}</dt>
							<dd className="admin-application-specialties">
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
						{application.status === Status.REJECTED && application.rejectionReason && (
							<div>
								<dt>{t('Review feedback')}</dt>
								<dd>{application.rejectionReason}</dd>
							</div>
						)}
					</dl>
					{application.status === Status.PENDING && (
						<section className="admin-application-decision">
							<p>{t('Decision note')}</p>
							<div>
								<Button variant="outlined" disabled={!canReview} onClick={() => openDialog(Status.REJECTED)}>
									{t('Reject Application')}
								</Button>
								<Button variant="contained" disabled={!canReview} onClick={() => openDialog(Status.APPROVED)}>
									{t('Approve Trainer')}
								</Button>
							</div>
						</section>
					)}
				</article>
			)}
			<Dialog
				open={Boolean(dialog)}
				onClose={() => {
					if (!writeLock.current) setDialog(null);
				}}
				fullWidth
				maxWidth="sm"
				aria-labelledby="admin-review-title"
				aria-describedby="admin-review-copy"
				PaperProps={{ className: 'admin-application-dialog' }}
			>
				<form onSubmit={confirm} noValidate>
					<DialogTitle id="admin-review-title">
						{t(dialog === Status.REJECTED ? 'Reject title' : 'Approve title')}
					</DialogTitle>
					<DialogContent>
						<DialogContentText id="admin-review-copy">
							{t(dialog === Status.REJECTED ? 'Reject copy' : 'Approve copy')}
						</DialogContentText>
						{dialog === Status.REJECTED && (
							<div className="admin-review-field">
								<FormLabel htmlFor="admin-review-feedback" required error={feedbackError} disabled={submitting}>
									{t('Review feedback')}
								</FormLabel>
								<TextField
									id="admin-review-feedback"
									inputRef={feedbackInput}
									autoFocus
									required
									fullWidth
									multiline
									minRows={4}
									InputProps={{ notched: false }}
									value={feedback}
									disabled={submitting}
									error={feedbackError}
									onChange={(event) => {
										setFeedback(event.target.value);
										setFeedbackError(false);
									}}
									inputProps={{
										maxLength: 1000,
										'aria-describedby': 'admin-review-feedback-helper-text admin-review-counter',
									}}
									helperText={t(feedbackError ? 'Feedback error' : 'Feedback helper')}
								/>
								<p id="admin-review-counter" className="admin-review-counter">
									{t('Counter', { count: feedback.trim().length, limit: 1000 })}
								</p>
							</div>
						)}
					</DialogContent>
					<DialogActions>
						<Button
							type="button"
							autoFocus={dialog === Status.APPROVED}
							disabled={submitting}
							onClick={() => setDialog(null)}
						>
							{t('Cancel')}
						</Button>
						<Button type="submit" variant="contained" disabled={submitting || !canReview}>
							{t(submitting ? 'Reviewing' : dialog === Status.REJECTED ? 'Reject Application' : 'Approve Trainer')}
						</Button>
					</DialogActions>
				</form>
			</Dialog>
		</div>
	);
};

const TrainerApplicationDetail = () => {
	const router = useRouter();
	const { t } = useTranslation('admin-trainer-applications');
	const applicationId = trainerApplicationId(router.query.applicationId);
	return (
		<AdminApplicationAccess>
			{applicationId ? (
				<ApplicationDetail key={applicationId} applicationId={applicationId} />
			) : (
				<div className="admin-trainer-applications">
					<Link href={adminTrainerApplicationsRoute}>{t('Back to Applications')}</Link>
					<p role="alert">{t('Not found')}</p>
				</div>
			)}
		</AdminApplicationAccess>
	);
};

export default TrainerApplicationDetail;
