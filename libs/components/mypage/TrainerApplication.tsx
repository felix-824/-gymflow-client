import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { Button, CircularProgress } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { useTranslation } from 'next-i18next';
import { GET_MY_TRAINER_APPLICATION } from '../../../apollo/user/query';
import { SUBMIT_TRAINER_APPLICATION } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getAuthSessionId, updateUserInfo } from '../../auth';
import { authErrorMessage } from '../../auth-form';
import { TrainerApplicationStatus } from '../../enums/trainer-application.enum';
import {
	trainerApplicationCategories,
	trainerApplicationErrors,
	trainerApplicationPayload,
	trainerApplicationRoute,
	trainerApplicationAccess,
	trainerApplicationPollInterval,
	trainerWorkspaceRoute,
	TrainerApplicationDraft,
	TrainerApplicationErrors,
} from '../../trainer-application';
import {
	TrainerApplication as Application,
	TrainerApplicationInput,
} from '../../types/trainer-application/trainer-application';
import TrainerApplicationStatusView from './TrainerApplicationStatus';

const profileRoute = '/mypage?category=myProfile';

function ApplicationLifecycle({
	ownerId,
	sessionIdentity,
	fullName,
}: {
	ownerId: string;
	sessionIdentity: string;
	fullName: string;
}) {
	const { t } = useTranslation(['trainer-application', 'common']);
	const mounted = useRef(true);
	const writeLock = useRef(false);
	const readLock = useRef(false);
	const roleLock = useRef(false);
	const reconciledApplication = useRef('');
	const nameInput = useRef<HTMLInputElement>(null);
	const user = useReactiveVar(userVar);
	const [draft, setDraft] = useState<TrainerApplicationDraft>({
		fullName,
		categories: [],
		experienceSummary: '',
		bio: '',
	});
	const [errors, setErrors] = useState<TrainerApplicationErrors>({});
	const [error, setError] = useState('');
	const [application, setApplication] = useState<Application | null>();
	const [previousApplicationId, setPreviousApplicationId] = useState<string>();
	const [invalidRead, setInvalidRead] = useState(false);
	const [roleState, setRoleState] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');
	const [needsRecheck, setNeedsRecheck] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const activeAccount = useCallback(
		() =>
			mounted.current &&
			authReadyVar() &&
			!authErrorVar() &&
			userVar()._id === ownerId &&
			userVar().memberStatus === 'ACTIVE' &&
			['USER', 'TRAINER'].includes(userVar().memberType) &&
			getAuthSessionId() === sessionIdentity,
		[ownerId, sessionIdentity],
	);
	const query = useQuery<{ getMyTrainerApplication: Application | null }>(GET_MY_TRAINER_APPLICATION, {
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: { handleErrorLocally: true, queryDeduplication: false },
		onCompleted: (data) => {
			if (!activeAccount()) return;
			const next = data.getMyTrainerApplication;
			if (
				next !== null &&
				(!next?._id || next.memberId !== ownerId || !Object.values(TrainerApplicationStatus).includes(next.status))
			) {
				setInvalidRead(true);
				return;
			}
			setApplication(next);
			setPreviousApplicationId((previous) =>
				next?.status === TrainerApplicationStatus.REJECTED && next._id === previous ? previous : undefined,
			);
			setInvalidRead(false);
			setNeedsRecheck(false);
		},
	});
	const [submitApplication] = useMutation<
		{ submitTrainerApplication: Application },
		{ input: TrainerApplicationInput }
	>(SUBMIT_TRAINER_APPLICATION, { fetchPolicy: 'no-cache', context: { handleErrorLocally: true } });
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const editingRejected =
		application?.status === TrainerApplicationStatus.REJECTED && application._id === previousApplicationId;
	const checked = !query.loading && !query.error && !invalidRead && (application === null || editingRejected);
	const { refetch, startPolling, stopPolling } = query;
	const queryLoading = useRef(query.loading);
	queryLoading.current = query.loading;
	const retryQuery = useCallback(async () => {
		if (writeLock.current || readLock.current || queryLoading.current || !activeAccount()) return;
		readLock.current = true;
		try {
			await refetch();
		} catch {
			/* The query error renders a read-only retry state. */
		} finally {
			readLock.current = false;
		}
	}, [activeAccount, refetch]);
	useEffect(() => {
		const visible = () => document.visibilityState !== 'hidden';
		const refreshVisible = () => {
			if (visible()) void retryQuery();
		};
		const updatePolling = () => {
			stopPolling();
			if (visible() && application?.status === TrainerApplicationStatus.PENDING)
				startPolling(trainerApplicationPollInterval);
		};
		const visibilityChanged = () => {
			updatePolling();
			refreshVisible();
		};
		updatePolling();
		window.addEventListener('focus', refreshVisible);
		document.addEventListener('visibilitychange', visibilityChanged);
		return () => {
			stopPolling();
			window.removeEventListener('focus', refreshVisible);
			document.removeEventListener('visibilitychange', visibilityChanged);
		};
	}, [application?.status, retryQuery, startPolling, stopPolling]);
	const refreshRole = useCallback(async () => {
		if (!activeAccount() || roleLock.current) return;
		roleLock.current = true;
		setRoleState('checking');
		try {
			await updateUserInfo();
			if (activeAccount()) setRoleState(userVar().memberType === 'TRAINER' ? 'ready' : 'error');
		} catch {
			if (activeAccount()) setRoleState('error');
		} finally {
			roleLock.current = false;
		}
	}, [activeAccount]);
	useEffect(() => {
		if (application?.status !== TrainerApplicationStatus.APPROVED || reconciledApplication.current === application._id)
			return;
		reconciledApplication.current = application._id;
		void refreshRole();
	}, [application?._id, application?.status, refreshRole]);
	useEffect(() => {
		if (editingRejected) nameInput.current?.focus();
	}, [editingRejected]);
	const workspaceGuard = (event: React.MouseEvent<HTMLAnchorElement>) => {
		if (!activeAccount() || userVar().memberType !== 'TRAINER') event.preventDefault();
	};
	const applyAgain = () => {
		if (
			!activeAccount() ||
			userVar().memberType !== 'USER' ||
			application?.status !== TrainerApplicationStatus.REJECTED ||
			query.loading ||
			query.error ||
			invalidRead
		)
			return;
		setDraft(trainerApplicationPayload(application));
		setPreviousApplicationId(application._id);
		setErrors({});
		setError('');
	};
	const submitHandler = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (
			writeLock.current ||
			readLock.current ||
			submitting ||
			!activeAccount() ||
			userVar().memberType !== 'USER' ||
			!checked ||
			needsRecheck
		)
			return;
		const validation = trainerApplicationErrors(draft);
		setErrors(validation);
		setError('');
		if (Object.keys(validation).length) {
			const field = Object.keys(validation)[0];
			event.currentTarget.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
			return;
		}
		writeLock.current = true;
		setSubmitting(true);
		try {
			const result = await submitApplication({
				variables: { input: trainerApplicationPayload(draft, previousApplicationId) },
			});
			if (!activeAccount()) return;
			const application = result.data?.submitTrainerApplication;
			if (
				!application?._id ||
				application.memberId !== ownerId ||
				application.status !== TrainerApplicationStatus.PENDING
			)
				throw new Error(t('Submission error'));
			setApplication(application);
			setPreviousApplicationId(undefined);
		} catch (failure) {
			if (!activeAccount()) return;
			setError(authErrorMessage(failure, t('Connection error'), t('Submission error')));
			// A read must reconcile an uncertain/duplicate write before another explicit submission.
			setNeedsRecheck(true);
		} finally {
			writeLock.current = false;
			if (mounted.current) setSubmitting(false);
		}
	};
	const changeText = (name: 'fullName' | 'experienceSummary' | 'bio', value: string) => {
		setDraft((previous) => ({ ...previous, [name]: value }));
		setErrors((previous) => ({ ...previous, [name]: undefined }));
	};
	const fieldError = (field: keyof TrainerApplicationDraft) =>
		errors[field] && (
			<p className="application-field-error" id={`application-${field}-error`}>
				{t(errors[field]!)}
			</p>
		);
	const textArea = (field: 'experienceSummary' | 'bio', label: string, hint: string, maxLength: number) => (
		<div className="application-field">
			<div className="application-label-row">
				<label htmlFor={`application-${field}`}>{t(label)}</label>
				<span id={`application-${field}-count`}>
					{t('Counter', { count: draft[field].trim().length, limit: maxLength })}
				</span>
			</div>
			<p className="application-field-hint" id={`application-${field}-hint`}>
				{t(hint)}
			</p>
			<textarea
				id={`application-${field}`}
				name={field}
				rows={field === 'bio' ? 7 : 5}
				required
				maxLength={maxLength}
				value={draft[field]}
				disabled={submitting || needsRecheck}
				onChange={(event) => changeText(field, event.target.value)}
				aria-invalid={Boolean(errors[field])}
				aria-describedby={`application-${field}-hint application-${field}-count${
					errors[field] ? ` application-${field}-error` : ''
				}`}
			/>
			{fieldError(field)}
		</div>
	);
	return (
		<div className="trainer-application-grid">
			<section aria-labelledby="trainer-application-title">
				<header className="trainer-application-heading">
					<h1 id="trainer-application-title">
						{t((application && !editingRejected) || user.memberType === 'TRAINER' ? 'Status title' : 'Title')}
					</h1>
					{(!application || editingRejected) && user.memberType === 'USER' && <p>{t('Intro')}</p>}
				</header>
				{(query.error || invalidRead) && application !== undefined && (
					<div className="application-refresh-error" role="alert">
						<p>{authErrorMessage(query.error, t('Connection error'), t('Query error'))}</p>
						<Button onClick={() => void retryQuery()}>{t('Retry')}</Button>
					</div>
				)}
				{application && !editingRejected ? (
					<TrainerApplicationStatusView
						application={application}
						canApplyAgain={user.memberType === 'USER' && !query.loading && !query.error && !invalidRead}
						onApplyAgain={applyAgain}
						roleState={roleState}
						onRefreshRole={() => void refreshRole()}
						canUseWorkspace={roleState === 'ready' && user.memberType === 'TRAINER'}
						onWorkspace={workspaceGuard}
					/>
				) : application === undefined && query.loading ? (
					<p className="application-notice" role="status">
						{t('Loading')}
					</p>
				) : application === undefined ? (
					<div className="application-notice" role="alert">
						<p>{authErrorMessage(query.error, t('Connection error'), t('Query error'))}</p>
						<Button onClick={() => void retryQuery()}>{t('Retry')}</Button>
					</div>
				) : user.memberType === 'TRAINER' ? (
					<div className="application-notice">
						<h2>{t('Existing trainer title')}</h2>
						<p>{t('Existing trainer copy')}</p>
						<div className="application-actions">
							<Link className="application-primary-link" href={trainerWorkspaceRoute} onClick={workspaceGuard}>
								{t('Go to Trainer Workspace')}
							</Link>
							<Link href={profileRoute}>{t('View profile')}</Link>
						</div>
					</div>
				) : (
					<form
						onSubmit={submitHandler}
						noValidate
						aria-busy={submitting}
						aria-describedby={error ? 'application-error' : undefined}
					>
						<div className="application-field">
							<div className="application-label-row">
								<label htmlFor="application-fullName">{t('Full Name')}</label>
								<span id="application-fullName-hint">{t('Name limit')}</span>
							</div>
							<input
								ref={nameInput}
								id="application-fullName"
								name="fullName"
								type="text"
								autoComplete="name"
								required
								minLength={3}
								maxLength={100}
								value={draft.fullName}
								disabled={submitting || needsRecheck}
								onChange={(event) => changeText('fullName', event.target.value)}
								aria-invalid={Boolean(errors.fullName)}
								aria-describedby={`application-fullName-hint${errors.fullName ? ' application-fullName-error' : ''}`}
							/>
							{fieldError('fullName')}
						</div>
						<fieldset
							className="application-field application-specialties"
							disabled={submitting || needsRecheck}
							aria-describedby={`application-categories-hint${
								errors.categories ? ' application-categories-error' : ''
							}`}
						>
							<legend>{t('Training Specialties')}</legend>
							<p className="application-field-hint" id="application-categories-hint">
								{t('Specialties hint')}
							</p>
							<div className="application-category-options">
								{trainerApplicationCategories.map((category) => (
									<Button
										key={category}
										type="button"
										name="categories"
										aria-pressed={draft.categories.includes(category)}
										onClick={() => {
											setDraft((previous) => ({
												...previous,
												categories: previous.categories.includes(category)
													? previous.categories.filter((value) => value !== category)
													: [...previous.categories, category],
											}));
											setErrors((previous) => ({ ...previous, categories: undefined }));
										}}
									>
										{draft.categories.includes(category) && <CheckRoundedIcon aria-hidden="true" />}
										{t(category, { ns: 'common' })}
									</Button>
								))}
							</div>
							{fieldError('categories')}
						</fieldset>
						{textArea('experienceSummary', 'Coaching Experience', 'Experience hint', 1000)}
						{textArea('bio', 'About You & Coaching Philosophy', 'Bio hint', 2000)}
						<p className="application-review-note">{t('Review note')}</p>
						{error && (
							<p className="application-error" id="application-error" role="alert">
								{error}
							</p>
						)}
						{needsRecheck && (
							<Button type="button" onClick={() => void retryQuery()}>
								{t('Check application')}
							</Button>
						)}
						<div className="application-actions">
							<Button
								type="submit"
								variant="contained"
								disabled={submitting || needsRecheck || !checked}
								endIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardRoundedIcon />}
							>
								{t(submitting ? 'Submitting' : 'Submit application')}
							</Button>
							<Link href={profileRoute}>{t('Back to profile')}</Link>
						</div>
					</form>
				)}
			</section>
			<aside className="trainer-application-editorial" aria-labelledby="application-editorial-title">
				<img src="/img/fiber/strength-barbell.webp" width={1067} height={1600} alt={t('Image alt')} />
				<div>
					<h2 id="application-editorial-title">{t('Panel title')}</h2>
					<p>{t('Panel copy')}</p>
					<ul>
						<li>
							<PeopleOutlineRoundedIcon aria-hidden="true" />
							{t('Benefit reach')}
						</li>
						<li>
							<FitnessCenterOutlinedIcon aria-hidden="true" />
							{t('Benefit programs')}
						</li>
						<li>
							<CalendarMonthOutlinedIcon aria-hidden="true" />
							{t('Benefit schedule')}
						</li>
					</ul>
				</div>
			</aside>
		</div>
	);
}

const TrainerApplication = () => {
	const { t } = useTranslation('trainer-application');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const access = trainerApplicationAccess(ready && router.isReady, authError, user);
	const sessionIdentity = getAuthSessionId();
	return (
		<div id="trainer-application-page">
			<nav className="application-breadcrumb" aria-label={t('Breadcrumb')}>
				<Link href={profileRoute}>{t('My profile')}</Link>
				<span aria-hidden="true">/</span>
				<span aria-current="page">{t('Status title')}</span>
			</nav>
			{access === 'ready' ? (
				<ApplicationLifecycle
					key={`${user._id}:${sessionIdentity}`}
					ownerId={user._id}
					sessionIdentity={sessionIdentity}
					fullName={user.memberFullName ?? ''}
				/>
			) : (
				<div className="application-access" role={access === 'error' ? 'alert' : 'status'}>
					<h1>{t('Title')}</h1>
					<p>{t(access)}</p>
					{access === 'error' && <Button onClick={() => void updateUserInfo()}>{t('Retry')}</Button>}
					{access === 'guest' && !user._id && (
						<Link href={{ pathname: '/account/join', query: { referrer: trainerApplicationRoute } }}>
							{t('Sign in')}
						</Link>
					)}
					<Link href={profileRoute}>{t('Back to profile')}</Link>
				</div>
			)}
		</div>
	);
};

export default TrainerApplication;
