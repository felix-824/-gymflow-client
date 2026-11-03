import React, { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { Button, Pagination, Skeleton } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import { useTranslation } from 'next-i18next';
import { GET_GYM, GET_GYMS, GET_MY_TRAINER_GYM_ACCESSES } from '../../../apollo/user/query';
import { SUBMIT_TRAINER_GYM_ACCESS } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getAuthSessionId, updateUserInfo } from '../../auth';
import { readGymsInquiry } from '../../gym';
import { trainerReservationsAccess } from '../../trainer-reservations';
import { sweetTopSmallSuccessAlert } from '../../sweetAlert';
import {
	gymAccessErrors,
	gymAccessLimit,
	gymAccessPayload,
	gymAccessRelationships,
	gymAccessRoute,
	GymAccessDraft,
	operationalGymAccess,
	validGymAccessResult,
} from '../../trainer-gym-access';
import { TrainerGymAccessStatus } from '../../enums/trainer-gym-access.enum';
import { Gym, Gyms } from '../../types/gym/gym';
import {
	MyTrainerGymAccesses,
	MyTrainerGymAccessesInquiry,
	TrainerGymAccess as Access,
	TrainerGymAccessInput,
} from '../../types/trainer-gym-access/trainer-gym-access';
import { TrainerWorkspaceHeader, TrainerWorkspaceNavigation } from './TrainerWorkspaceNavigation';

const localContext = { handleErrorLocally: true, queryDeduplication: false };
type AccessQuery = { getMyTrainerGymAccesses: MyTrainerGymAccesses };

function AccessCard({
	access,
	onReapply,
	disabled,
}: {
	access: Access;
	onReapply: (access: Access) => void;
	disabled: boolean;
}) {
	const { t, i18n } = useTranslation('trainer-gym-access');
	const date = (value: string) => {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime())
			? t('Date unavailable')
			: parsed.toLocaleDateString(i18n.language === 'kr' ? 'ko-KR' : i18n.language, {
					timeZone: 'Asia/Seoul',
					year: 'numeric',
					month: 'short',
					day: 'numeric',
			  });
	};
	return (
		<article className="gym-access-card" data-access-id={access._id}>
			<div className="gym-access-card-heading">
				<h3>{access.gymData?.gymName || t('Unavailable gym')}</h3>
				<span className={`gym-access-status status-${access.status.toLowerCase()}`}>
					{t(`Status ${access.status}`)}
				</span>
			</div>
			<p className="gym-access-relationship">{t(`Relationship ${access.relationshipType}`)}</p>
			<p className="gym-access-meaning">{t(`Meaning ${access.status}`)}</p>
			<dl>
				<div>
					<dt>{t('Requested')}</dt>
					<dd>
						<time dateTime={access.createdAt}>{date(access.createdAt)}</time>
					</dd>
				</div>
				{access.reviewedAt && (
					<div>
						<dt>{t('Reviewed')}</dt>
						<dd>
							<time dateTime={access.reviewedAt}>{date(access.reviewedAt)}</time>
						</dd>
					</div>
				)}
				{access.revokedAt && (
					<div>
						<dt>{t('Revoked date')}</dt>
						<dd>
							<time dateTime={access.revokedAt}>{date(access.revokedAt)}</time>
						</dd>
					</div>
				)}
			</dl>
			<details>
				<summary>{t('Request note')}</summary>
				<p className="gym-access-note">{access.requestNote}</p>
			</details>
			{access.status === TrainerGymAccessStatus.REJECTED && access.rejectionReason && (
				<div className="gym-access-reason">
					<strong>{t('Rejection reason')}</strong>
					<p>{access.rejectionReason}</p>
				</div>
			)}
			{access.status === TrainerGymAccessStatus.REVOKED && access.revocationReason && (
				<div className="gym-access-reason">
					<strong>{t('Revocation reason')}</strong>
					<p>{access.revocationReason}</p>
				</div>
			)}
			{!operationalGymAccess(access) && access.gymData && (
				<Button variant="outlined" disabled={disabled} onClick={() => onReapply(access)}>
					{t('Request again')}
				</Button>
			)}
			{!access.gymData && <p className="gym-access-muted">{t('Gym unavailable help')}</p>}
		</article>
	);
}

function RequestForm({
	initial,
	records,
	activeAccount,
	onClose,
	onSuccess,
}: {
	initial: Access | null;
	records: Access[];
	activeAccount: () => boolean;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { t } = useTranslation('trainer-gym-access');
	const { t: gymT } = useTranslation('gyms');
	const [draft, setDraft] = useState<GymAccessDraft>({
		gymId: initial?.gymId || '',
		relationshipType: initial?.relationshipType || '',
		requestNote: '',
	});
	const [text, setText] = useState('');
	const [page, setPage] = useState(1);
	const [errors, setErrors] = useState<ReturnType<typeof gymAccessErrors>>({});
	const [failed, setFailed] = useState(false);
	const [rechecking, setRechecking] = useState(false);
	const lock = useRef(false);
	const firstField = useRef<HTMLInputElement>(null);
	useEffect(() => {
		firstField.current?.focus();
	}, []);
	const gyms = useQuery<{ getGyms: Gyms }>(GET_GYMS, {
		variables: { input: readGymsInquiry({ page, limit: 20, search: { text } }) },
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: localContext,
	});
	const selected = useQuery<{ getGym: Gym }>(GET_GYM, {
		variables: { gymId: draft.gymId },
		skip: !draft.gymId,
		fetchPolicy: 'no-cache',
		context: localContext,
	});
	const pair = useQuery<AccessQuery, { input: MyTrainerGymAccessesInquiry }>(GET_MY_TRAINER_GYM_ACCESSES, {
		variables: { input: { page: 1, limit: 1, search: { gymId: draft.gymId } } },
		skip: !draft.gymId,
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: localContext,
	});
	const [submit, mutation] = useMutation<{ submitTrainerGymAccess: Access }, { input: TrainerGymAccessInput }>(
		SUBMIT_TRAINER_GYM_ACCESS,
		{ fetchPolicy: 'no-cache', context: localContext },
	);
	const latest = pair.data?.getMyTrainerGymAccesses.list[0];
	const duplicate = latest && operationalGymAccess(latest);
	const gym = selected.data?.getGym?._id === draft.gymId ? selected.data.getGym : null;
	const pairReady =
		draft.gymId && !pair.loading && !pair.error && validGymAccessResult(pair.data?.getMyTrainerGymAccesses);
	const ready = pairReady && !selected.loading && !selected.error && gym && !duplicate && !failed && !rechecking;
	const choices = gyms.data?.getGyms.list ?? [];
	const total = gyms.data?.getGyms.metaCounter[0]?.total ?? 0;
	const busy = mutation.loading || lock.current;
	const changeGym = (gymId: string) => {
		setDraft({ ...draft, gymId });
		setFailed(false);
		setErrors({});
	};
	const recheck = async () => {
		if (lock.current || rechecking || !activeAccount()) return;
		setRechecking(true);
		try {
			await Promise.all([pair.refetch(), selected.refetch()]);
			if (activeAccount()) setFailed(false);
		} catch {
			/* Local query states explain recovery; keep the draft. */
		} finally {
			setRechecking(false);
		}
	};
	const submitHandler = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (lock.current || mutation.loading || !activeAccount()) return;
		const validation = gymAccessErrors(draft);
		setErrors(validation);
		if (Object.keys(validation).length) {
			event.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(validation)[0]}"]`)?.focus();
			return;
		}
		if (!ready) return;
		lock.current = true;
		try {
			const result = await submit({ variables: { input: gymAccessPayload(draft, latest) } });
			if (!activeAccount()) return;
			const row = result.data?.submitTrainerGymAccess;
			if (!row?._id || row.gymId !== draft.gymId || row.status !== TrainerGymAccessStatus.PENDING) throw new Error();
			onSuccess();
		} catch {
			if (activeAccount()) setFailed(true);
		} finally {
			lock.current = false;
		}
	};
	return (
		<section className="gym-access-form-panel" aria-labelledby="gym-access-form-title">
			<h2 id="gym-access-form-title">{t(initial ? 'Request again' : 'Request gym access')}</h2>
			<p>{t('Form help')}</p>
			<form onSubmit={submitHandler} noValidate aria-busy={busy}>
				<fieldset disabled={busy}>
					<div className="gym-access-field">
						<label htmlFor="gym-access-search">{t('Search gyms')}</label>
						<input
							ref={firstField}
							id="gym-access-search"
							type="search"
							value={text}
							maxLength={100}
							onChange={(event) => {
								setText(event.target.value);
								setPage(1);
							}}
						/>
					</div>
					<div className="gym-access-field">
						<label htmlFor="gym-access-gym">{t('Gym')}</label>
						<select
							id="gym-access-gym"
							name="gymId"
							value={draft.gymId}
							required
							aria-invalid={Boolean(errors.gymId)}
							aria-describedby="gym-access-gym-help"
							onChange={(event) => changeGym(event.target.value)}
						>
							<option value="">{t('Choose gym')}</option>
							{draft.gymId && !choices.some((item) => item._id === draft.gymId) && (
								<option value={draft.gymId}>{gym?.gymName || initial?.gymData?.gymName || t('Unavailable gym')}</option>
							)}
							{!gyms.loading &&
								!gyms.error &&
								choices.map((item) => {
									const current = records.find((row) => row.gymId === item._id && operationalGymAccess(row));
									return (
										<option key={item._id} value={item._id} disabled={Boolean(current)}>
											{item.gymName} · {gymT(`locations.${item.gymLocation}`)}
											{current ? ` · ${t(`Status ${current.status}`)}` : ''}
										</option>
									);
								})}
						</select>
						<p id="gym-access-gym-help">{errors.gymId ? t(errors.gymId) : t('Active gyms help')}</p>
						{gym && (
							<p className="gym-access-address">
								{gym.gymName} · {gymT(`locations.${gym.gymLocation}`)} · {gym.gymAddress}
							</p>
						)}
					</div>
					<div aria-live="polite">
						{gyms.loading ? (
							<p role="status">{t('Loading gyms')}</p>
						) : gyms.error ? (
							<p role="alert">
								{t('Gym load error')}{' '}
								<Button onClick={() => void gyms.refetch().catch(() => undefined)}>{t('Retry')}</Button>
							</p>
						) : (
							<>
								{!total && <p>{t('No gyms')}</p>}
								{total > 20 && (
									<Pagination
										page={page}
										count={Math.ceil(total / 20)}
										onChange={(_, next) => setPage(next)}
										aria-label={t('Gym pages')}
										size="small"
									/>
								)}
							</>
						)}
						{draft.gymId && (pair.loading || selected.loading) && <p role="status">{t('Checking gym')}</p>}
						{duplicate && <p role="status">{t('Duplicate help', { status: t(`Status ${latest.status}`) })}</p>}
						{draft.gymId && !selected.loading && (selected.error || !gym) && (
							<p role="alert">{t('Gym unavailable help')}</p>
						)}
						{draft.gymId &&
							(pair.error || (!pair.loading && !validGymAccessResult(pair.data?.getMyTrainerGymAccesses))) && (
								<p role="alert">{t('Pair error')}</p>
							)}
						{(failed || (draft.gymId && (pair.error || selected.error))) && (
							<div role="alert">
								<p>{t('Submit error')}</p>
								<Button disabled={rechecking} onClick={() => void recheck()}>
									{t('Reload access')}
								</Button>
							</div>
						)}
					</div>
					<div className="gym-access-field">
						<label htmlFor="gym-access-relationship">{t('Relationship type')}</label>
						<select
							id="gym-access-relationship"
							name="relationshipType"
							required
							value={draft.relationshipType}
							aria-invalid={Boolean(errors.relationshipType)}
							aria-describedby="gym-access-relationship-help"
							onChange={(event) =>
								setDraft({ ...draft, relationshipType: event.target.value as GymAccessDraft['relationshipType'] })
							}
						>
							<option value="">{t('Choose relationship')}</option>
							{gymAccessRelationships.map((value) => (
								<option key={value} value={value}>
									{t(`Relationship ${value}`)}
								</option>
							))}
						</select>
						<p id="gym-access-relationship-help">{t(errors.relationshipType || 'Relationship help')}</p>
					</div>
					<div className="gym-access-field">
						<label htmlFor="gym-access-note">{t('Request note')}</label>
						<textarea
							id="gym-access-note"
							name="requestNote"
							required
							rows={5}
							maxLength={1000}
							value={draft.requestNote}
							aria-invalid={Boolean(errors.requestNote)}
							aria-describedby="gym-access-note-help gym-access-note-count"
							onChange={(event) => setDraft({ ...draft, requestNote: event.target.value })}
						/>
						<div className="gym-access-note-help">
							<p id="gym-access-note-help">{t(errors.requestNote || 'Note help')}</p>
							<span id="gym-access-note-count">{draft.requestNote.length} / 1000</span>
						</div>
					</div>
				</fieldset>
				<div className="gym-access-form-actions">
					<Button type="button" disabled={busy} onClick={onClose}>
						{t('Cancel')}
					</Button>
					<Button variant="contained" type="submit" disabled={busy || Boolean(draft.gymId && !ready)}>
						{t(busy ? 'Submitting' : 'Submit request')}
					</Button>
				</div>
			</form>
		</section>
	);
}

function AccessContent({ ownerId, sessionIdentity }: { ownerId: string; sessionIdentity: string }) {
	const { t } = useTranslation('trainer-gym-access');
	const [page, setPage] = useState(1);
	const [form, setForm] = useState<{ initial: Access | null } | null>(null);
	const [success, setSuccess] = useState(false);
	const mounted = useRef(true);
	const requestButton = useRef<HTMLButtonElement>(null);
	const restoreRequestFocus = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const activeAccount = () =>
		mounted.current &&
		authReadyVar() &&
		!authErrorVar() &&
		userVar()._id === ownerId &&
		userVar().memberType === 'TRAINER' &&
		userVar().memberStatus === 'ACTIVE' &&
		getAuthSessionId() === sessionIdentity;
	const query = useQuery<AccessQuery, { input: MyTrainerGymAccessesInquiry }>(GET_MY_TRAINER_GYM_ACCESSES, {
		variables: { input: { page, limit: gymAccessLimit, search: {} } },
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: localContext,
	});
	const result = query.data?.getMyTrainerGymAccesses;
	useEffect(() => {
		if (!form && !query.loading && restoreRequestFocus.current) {
			restoreRequestFocus.current = false;
			requestButton.current?.focus();
		}
	}, [form, query.loading]);
	const valid = validGymAccessResult(result);
	const list = valid ? result.list : [];
	const total = valid ? result.metaCounter[0].total : 0;
	const closeForm = () => {
		restoreRequestFocus.current = true;
		setForm(null);
	};
	const submitSuccess = () => {
		closeForm();
		setSuccess(true);
		if (page !== 1) setPage(1);
		else void query.refetch().catch(() => undefined);
		void sweetTopSmallSuccessAlert(t('Success')).catch(() => undefined);
	};
	const openForm = (initial: Access | null) => {
		setSuccess(false);
		setForm({ initial });
	};
	const failed = !query.loading && (query.error || !valid);
	return (
		<>
			<div className="gym-access-page-heading">
				<div>
					<h1>{t('Title')}</h1>
					<p>{t('Description')}</p>
				</div>
				<Button
					ref={requestButton}
					variant="contained"
					startIcon={<AddRoundedIcon />}
					disabled={Boolean(form) || query.loading || Boolean(failed)}
					onClick={() => openForm(null)}
				>
					{t('Request gym access')}
				</Button>
			</div>
			{success && (
				<p className="gym-access-success" role="status">
					{t('Success')}
				</p>
			)}
			{form && (
				<RequestForm
					key={form.initial?._id || 'new'}
					initial={form.initial}
					records={list}
					activeAccount={activeAccount}
					onClose={closeForm}
					onSuccess={submitSuccess}
				/>
			)}
			<p className="gym-access-policy">{t('Authorization meaning')}</p>
			{query.loading ? (
				<div className="gym-access-loading" role="status" aria-label={t('Loading')}>
					<Skeleton variant="rounded" height={200} />
					<Skeleton variant="rounded" height={200} />
					<span>{t('Loading')}</span>
				</div>
			) : failed ? (
				<div className="gym-access-state" role="alert">
					<h2>{t('Load error')}</h2>
					<p>{t('Load error help')}</p>
					<Button variant="outlined" onClick={() => void query.refetch().catch(() => undefined)}>
						{t('Retry')}
					</Button>
				</div>
			) : !total ? (
				<div className="gym-access-state">
					<BusinessOutlinedIcon aria-hidden="true" />
					<h2>{t('Empty title')}</h2>
					<p>{t('Empty help')}</p>
					{!form && (
						<Button variant="outlined" onClick={() => openForm(null)}>
							{t('Request gym access')}
						</Button>
					)}
				</div>
			) : (
				<>
					<p className="gym-access-muted">
						{t('Page summary', { page, pages: Math.max(1, Math.ceil(total / gymAccessLimit)), count: total })}
					</p>
					{[true, false].map((current) => {
						const rows = list.filter((row) => operationalGymAccess(row) === current);
						return (
							<section
								className="gym-access-section"
								key={String(current)}
								aria-labelledby={current ? 'gym-access-current' : 'gym-access-history'}
							>
								<h2 id={current ? 'gym-access-current' : 'gym-access-history'}>
									{t(current ? 'Current access' : 'Access history')}
								</h2>
								{rows.length ? (
									<div className="gym-access-grid">
										{rows.map((row) => (
											<AccessCard
												key={row._id}
												access={row}
												onReapply={openForm}
												disabled={
													Boolean(form) ||
													list.some((other) => other.gymId === row.gymId && operationalGymAccess(other))
												}
											/>
										))}
									</div>
								) : (
									<p className="gym-access-muted">{t(current ? 'No current on page' : 'No history on page')}</p>
								)}
							</section>
						);
					})}
					{total > gymAccessLimit && (
						<Pagination
							count={Math.ceil(total / gymAccessLimit)}
							page={page}
							onChange={(_, next) => {
								setPage(next);
							}}
							disabled={Boolean(form)}
							aria-label={t('Access pages')}
						/>
					)}
				</>
			)}
		</>
	);
}

export default function TrainerGymAccess() {
	const { t } = useTranslation('trainer-gym-access');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const error = useReactiveVar(authErrorVar);
	const access = trainerReservationsAccess(ready && router.isReady, error, user);
	const sessionIdentity = getAuthSessionId();
	return (
		<div className="gym-access-workspace">
			{access === 'ready' && <TrainerWorkspaceHeader active="Gym Access" />}
			<div id="gym-access-page">
				{access === 'ready' ? (
					<AccessContent key={`${user._id}:${sessionIdentity}`} ownerId={user._id} sessionIdentity={sessionIdentity} />
				) : (
					<div className="gym-access-state" role={access === 'error' || access === 'forbidden' ? 'alert' : 'status'}>
						<h1>{t('Title')}</h1>
						<p>{t(access)}</p>
						{access === 'error' && <Button onClick={() => void updateUserInfo()}>{t('Retry')}</Button>}
						{access === 'guest' && (
							<Link href={{ pathname: '/account/join', query: { referrer: gymAccessRoute } }}>{t('Sign in')}</Link>
						)}
						<Link href="/mypage?category=myProfile">{t('Back to profile')}</Link>
					</div>
				)}
			</div>
			{access === 'ready' && <TrainerWorkspaceNavigation active="Gym Access" mobile />}
		</div>
	);
}
