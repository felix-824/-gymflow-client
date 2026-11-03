import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useApolloClient, useMutation } from '@apollo/client';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material';
import { GET_TRAINER_GYM_ACCESS_BY_ADMIN } from '../../../../apollo/admin/query';
import { REVIEW_TRAINER_GYM_ACCESS, REVOKE_TRAINER_GYM_ACCESS } from '../../../../apollo/admin/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../../apollo/store';
import { getAuthSessionId } from '../../../auth';
import { adminWorkspaceAccess } from '../../../admin-workspace';
import {
	adminGymAccessRoute,
	gymAccessActionAllowed,
	gymAccessId,
	gymAccessModerationError,
	gymAccessReasonValid,
	gymAccessReviewPayload,
	gymAccessRevokePayload,
	readAdminGymAccessInquiry,
	validAdminGymAccess,
} from '../../../admin-gym-access';
import { TrainerGymAccessStatus as Status } from '../../../enums/trainer-gym-access.enum';
import {
	AdminTrainerGymAccess,
	AdminTrainerGymAccessReview,
	AdminTrainerGymAccessRevoke,
	GymAccessDecision,
} from '../../../types/trainer-gym-access/trainer-gym-access-admin';
import { sweetTopSmallSuccessAlert } from '../../../sweetAlert';
import AdminGymAccess, { AccessDate, AccessStatus, TrainerIdentity } from './AdminGymAccess';

const AccessDetail = ({ accessId }: { accessId: string }) => {
	const { t } = useTranslation('admin-gym-access');
	const router = useRouter();
	const client = useApolloClient();
	const identity = useRef({ id: userVar()._id, session: getAuthSessionId() });
	const mounted = useRef(true);
	const leaving = useRef(false);
	const sequence = useRef(0);
	const writing = useRef(false);
	const reasonInput = useRef<HTMLInputElement>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const focusResult = useRef(false);
	const opener = useRef<HTMLElement | null>(null);
	const [record, setRecord] = useState<AdminTrainerGymAccess | null>(null);
	const [reading, setReading] = useState(true);
	const [readError, setReadError] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [dialog, setDialog] = useState<GymAccessDecision | null>(null);
	const [reason, setReason] = useState('');
	const [reasonError, setReasonError] = useState(false);
	const [recovery, setRecovery] = useState<ReturnType<typeof gymAccessModerationError> | 'Sync error' | null>(null);
	const [feedback, setFeedback] = useState('');
	const active = useCallback(
		() =>
			mounted.current &&
			!leaving.current &&
			adminWorkspaceAccess(authReadyVar(), authErrorVar(), userVar()) === 'ready' &&
			userVar()._id === identity.current.id &&
			getAuthSessionId() === identity.current.session,
		[],
	);
	const load = useCallback(async () => {
		if (!active()) return null;
		const request = ++sequence.current;
		setReading(true);
		setReadError('');
		try {
			const { data } = await client.query<{ getTrainerGymAccessByAdmin: AdminTrainerGymAccess }>({
				query: GET_TRAINER_GYM_ACCESS_BY_ADMIN,
				variables: { accessId },
				fetchPolicy: 'no-cache',
				context: { handleErrorLocally: true, queryDeduplication: false },
			});
			if (!active() || request !== sequence.current) return null;
			const next = data?.getTrainerGymAccessByAdmin;
			if (!validAdminGymAccess(next, accessId)) throw new Error('Incomplete access response');
			setRecord(next);
			return next;
		} catch {
			if (active() && request === sequence.current) setReadError('Load error');
			return null;
		} finally {
			if (active() && request === sequence.current) setReading(false);
		}
	}, [active, client, accessId]);
	useEffect(() => {
		mounted.current = true;
		const leave = () => {
			leaving.current = true;
			sequence.current++;
		};
		const cancel = () => {
			leaving.current = false;
		};
		router.events.on('routeChangeStart', leave);
		router.events.on('routeChangeError', cancel);
		void load();
		return () => {
			mounted.current = false;
			router.events.off('routeChangeStart', leave);
			router.events.off('routeChangeError', cancel);
		};
	}, [load, router.events]);
	const [review] = useMutation<
		{ reviewTrainerGymAccess: AdminTrainerGymAccess },
		{ input: AdminTrainerGymAccessReview }
	>(REVIEW_TRAINER_GYM_ACCESS, { fetchPolicy: 'no-cache', context: { handleErrorLocally: true } });
	const [revoke] = useMutation<
		{ revokeTrainerGymAccess: AdminTrainerGymAccess },
		{ input: AdminTrainerGymAccessRevoke }
	>(REVOKE_TRAINER_GYM_ACCESS, { fetchPolicy: 'no-cache', context: { handleErrorLocally: true } });
	const blocked = reading || Boolean(readError) || submitting || Boolean(recovery);
	const reload = async () => {
		if (writing.current || reading || !active()) return;
		const next = await load();
		if (!active() || !next) return;
		setRecovery(null);
		if (dialog && !gymAccessActionAllowed(next.status, dialog)) {
			focusResult.current = true;
			setDialog(null);
		}
	};
	const open = (decision: GymAccessDecision) => {
		if (!active() || !record || blocked || writing.current || !gymAccessActionAllowed(record.status, decision)) return;
		if (dialog !== decision) setReason('');
		opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setReasonError(false);
		setFeedback('');
		setDialog(decision);
	};
	const confirm = async (event: FormEvent) => {
		event.preventDefault();
		if (!active() || !record || !dialog || blocked || writing.current || !gymAccessActionAllowed(record.status, dialog))
			return;
		if (dialog !== Status.APPROVED && !gymAccessReasonValid(reason)) {
			setReasonError(true);
			reasonInput.current?.focus();
			return;
		}
		writing.current = true;
		setSubmitting(true);
		setFeedback('');
		const decision = dialog;
		try {
			const response =
				decision === Status.REVOKED
					? await revoke({ variables: { input: gymAccessRevokePayload(accessId, reason) } })
					: await review({ variables: { input: gymAccessReviewPayload(accessId, decision, reason) } });
			if (!active()) return;
			const next =
				'revokeTrainerGymAccess' in (response.data ?? {})
					? (response.data as { revokeTrainerGymAccess: AdminTrainerGymAccess }).revokeTrainerGymAccess
					: (response.data as { reviewTrainerGymAccess: AdminTrainerGymAccess } | undefined)?.reviewTrainerGymAccess;
			if (!validAdminGymAccess(next, accessId) || next.status !== decision) throw new Error('Unconfirmed decision');
			setRecord(next);
			focusResult.current = true;
			setDialog(null);
			setReason('');
			setFeedback('Saved');
			try {
				await sweetTopSmallSuccessAlert(t('Saved'));
			} catch {
				/* Feedback never changes a confirmed write. */
			}
			const latest = await load();
			if (active() && !latest) setRecovery('Sync error');
		} catch (error) {
			if (!active()) return;
			setRecovery(gymAccessModerationError(error));
			// Resolve lost receipts and concurrent decisions through reads. Never replay a write.
			const latest = await load();
			if (!active() || !latest) return;
			if (!gymAccessActionAllowed(latest.status, decision)) {
				focusResult.current = true;
				setDialog(null);
				if (latest.status === decision) {
					setFeedback('Reconciled');
					setRecovery(null);
				}
			}
		} finally {
			writing.current = false;
			if (active()) setSubmitting(false);
		}
	};
	const recoveryView = recovery ? (
		<div className="access-recovery" role="alert">
			<p>{t(recovery)}</p>
			<Button disabled={submitting || reading} onClick={() => void reload()}>
				{t('Reload latest')}
			</Button>
		</div>
	) : null;
	const trainer = record?.trainerData;
	const gym = record?.gymData;
	const action = dialog === Status.REVOKED ? 'Revoke' : dialog === Status.REJECTED ? 'Reject' : 'Approve';
	return (
		<div className="content admin-gym-access access-detail">
			<nav className="access-back">
				<Link
					href={{
						pathname: adminGymAccessRoute,
						query: { input: JSON.stringify(readAdminGymAccessInquiry(router.query.input)) },
					}}
				>
					{t('Back')}
				</Link>
			</nav>
			<header className="access-heading">
				<h1 ref={heading} tabIndex={-1}>
					{t('Detail title')}
				</h1>
				<p>{t('Intro')}</p>
			</header>
			{feedback && (
				<p className="access-feedback" role="status">
					{t(feedback)}
				</p>
			)}
			{!dialog && recoveryView}
			{readError && (
				<div role="alert">
					<p>{t(readError)}</p>
					{!recovery && (
						<Button disabled={reading} onClick={() => void reload()}>
							{t('Retry')}
						</Button>
					)}
				</div>
			)}
			{reading && <p role="status">{t('Loading')}</p>}
			{record && (
				<article className="access-detail-surface" aria-busy={reading}>
					<div className="access-detail-status">
						<h2>{t('Request')}</h2>
						<AccessStatus status={record.status} />
					</div>
					<div className="access-summaries">
						<section>
							<h3>{t('Trainer')}</h3>
							<TrainerIdentity trainer={trainer ?? null} />
							{trainer && (
								<p>
									{t('role.' + trainer.memberType)} · {t('account.' + trainer.memberStatus)}
								</p>
							)}
						</section>
						<section>
							<h3>{t('Gym')}</h3>
							<strong>{gym?.gymName || t('Gym unavailable')}</strong>
							{gym && (
								<>
									<p>
										{t('locations.' + gym.gymLocation)} · {t('gymStatus.' + gym.gymStatus)}
									</p>
									<p>{gym.gymAddress}</p>
								</>
							)}
						</section>
					</div>
					<dl className="access-detail-fields">
						<div>
							<dt>{t('Relationship')}</dt>
							<dd>{t('relationship.' + record.relationshipType)}</dd>
						</div>
						<div>
							<dt>{t('Request note')}</dt>
							<dd>{record.requestNote}</dd>
						</div>
						<div>
							<dt>{t('Requested')}</dt>
							<dd>
								<AccessDate value={record.createdAt} />
							</dd>
						</div>
						{record.reviewedAt && (
							<div>
								<dt>{t('Reviewed')}</dt>
								<dd>
									<AccessDate value={record.reviewedAt} />
								</dd>
							</div>
						)}
						{record.rejectionReason && (
							<div>
								<dt>{t('Rejection reason')}</dt>
								<dd>{record.rejectionReason}</dd>
							</div>
						)}
						{record.revokedAt && (
							<div>
								<dt>{t('Revoked date')}</dt>
								<dd>
									<AccessDate value={record.revokedAt} />
								</dd>
							</div>
						)}
						{record.revocationReason && (
							<div>
								<dt>{t('Revocation reason')}</dt>
								<dd>{record.revocationReason}</dd>
							</div>
						)}
					</dl>
					{record.status === Status.PENDING || record.status === Status.APPROVED ? (
						<section className="access-decisions" aria-label={t('Actions')}>
							<p>{t(record.status === Status.PENDING ? 'Decision note' : 'Revoke copy')}</p>
							<div>
								{record.status === Status.PENDING ? (
									<>
										<Button variant="outlined" disabled={blocked} onClick={() => open(Status.REJECTED)}>
											{t('Reject')}
										</Button>
										<Button variant="contained" disabled={blocked} onClick={() => open(Status.APPROVED)}>
											{t('Approve')}
										</Button>
									</>
								) : (
									<Button variant="outlined" disabled={blocked} onClick={() => open(Status.REVOKED)}>
										{t('Revoke')}
									</Button>
								)}
							</div>
						</section>
					) : (
						<p className="access-terminal">{t('Terminal note')}</p>
					)}
				</article>
			)}
			<Dialog
				open={Boolean(dialog)}
				onClose={() => {
					if (!writing.current && !reading) setDialog(null);
				}}
				fullWidth
				maxWidth="sm"
				aria-labelledby="access-decision-title"
				aria-describedby="access-decision-copy"
				PaperProps={{ className: 'admin-access-dialog' }}
				TransitionProps={{
					onExited: () => {
						if (active()) {
							if (focusResult.current) heading.current?.focus();
							else if (opener.current?.isConnected) opener.current.focus();
						}
						focusResult.current = false;
					},
				}}
			>
				<form onSubmit={confirm} noValidate>
					<DialogTitle id="access-decision-title">{t(action + ' title')}</DialogTitle>
					<DialogContent>
						<DialogContentText id="access-decision-copy">{t(action + ' copy')}</DialogContentText>
						<p className="access-confirm-identity">
							{trainer?.memberFullName || trainer?.memberNick || t('Trainer unavailable')} ·{' '}
							{gym?.gymName || t('Gym unavailable')}
						</p>
						{dialog !== Status.APPROVED && (
							<>
								<TextField
									id="access-decision-reason"
									label={t(dialog === Status.REVOKED ? 'Revocation reason' : 'Rejection reason')}
									inputRef={reasonInput}
									autoFocus
									required
									fullWidth
									multiline
									minRows={4}
									maxRows={8}
									value={reason}
									disabled={submitting}
									error={reasonError}
									onChange={(event) => {
										setReason(event.target.value);
										setReasonError(false);
									}}
									inputProps={{
										maxLength: 1000,
										'aria-describedby': 'access-decision-reason-helper-text access-reason-count',
									}}
									helperText={t(reasonError ? 'Reason error' : 'Reason hint')}
								/>
								<p id="access-reason-count" className="access-reason-count">
									{t('Counter', { count: reason.length, limit: 1000 })}
								</p>
							</>
						)}
						{recoveryView}
					</DialogContent>
					<DialogActions>
						<Button
							type="button"
							autoFocus={dialog === Status.APPROVED}
							disabled={submitting || reading}
							onClick={() => setDialog(null)}
						>
							{t('Cancel')}
						</Button>
						<Button type="submit" variant="contained" disabled={blocked}>
							{t(submitting ? 'Saving' : action)}
						</Button>
					</DialogActions>
				</form>
			</Dialog>
		</div>
	);
};
const GymAccessDetail = () => {
	const router = useRouter();
	const { t } = useTranslation('admin-gym-access');
	const id = gymAccessId(router.query.id);
	return (
		<AdminGymAccess>
			{id ? (
				<AccessDetail key={id} accessId={id} />
			) : (
				<div className="content admin-gym-access">
					<Link href={adminGymAccessRoute}>{t('Back')}</Link>
					<p role="alert">{t('Not found')}</p>
				</div>
			)}
		</AdminGymAccess>
	);
};
export default GymAccessDetail;
