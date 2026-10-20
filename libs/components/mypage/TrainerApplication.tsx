import React, { FormEvent, useEffect, useRef, useState } from 'react';
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
import { myBookingsAccess } from '../../my-bookings';
import { TrainerApplicationStatus } from '../../enums/trainer-application.enum';
import {
	trainerApplicationCategories,
	trainerApplicationErrors,
	trainerApplicationPayload,
	trainerApplicationRoute,
	TrainerApplicationDraft,
	TrainerApplicationErrors,
} from '../../trainer-application';
import {
	TrainerApplication as Application,
	TrainerApplicationInput,
} from '../../types/trainer-application/trainer-application';

const profileRoute = '/mypage?category=myProfile';

function ApplicationForm({
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
	const [draft, setDraft] = useState<TrainerApplicationDraft>({
		fullName,
		categories: [],
		experienceSummary: '',
		bio: '',
	});
	const [errors, setErrors] = useState<TrainerApplicationErrors>({});
	const [error, setError] = useState('');
	const [submitted, setSubmitted] = useState<Application | null>(null);
	const [needsRecheck, setNeedsRecheck] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const query = useQuery<{ getMyTrainerApplication: Application | null }>(GET_MY_TRAINER_APPLICATION, {
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: { handleErrorLocally: true, queryDeduplication: false },
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
	const activeAccount = () =>
		mounted.current &&
		authReadyVar() &&
		!authErrorVar() &&
		userVar()._id === ownerId &&
		userVar().memberStatus === 'ACTIVE' &&
		userVar().memberType === 'USER' &&
		getAuthSessionId() === sessionIdentity;
	const existing = submitted ?? query.data?.getMyTrainerApplication;
	const checked = !query.loading && !query.error && query.data?.getMyTrainerApplication === null;
	const retryQuery = async () => {
		if (writeLock.current || !activeAccount()) return;
		writeLock.current = true;
		try {
			const result = await query.refetch();
			if (activeAccount() && !result.errors?.length && result.data?.getMyTrainerApplication !== undefined)
				setNeedsRecheck(false);
		} catch {
			/* The query error renders a read-only retry state. */
		} finally {
			writeLock.current = false;
		}
	};
	const submitHandler = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (writeLock.current || submitting || !activeAccount() || !checked || existing || needsRecheck) return;
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
			const result = await submitApplication({ variables: { input: trainerApplicationPayload(draft) } });
			if (!activeAccount()) return;
			const application = result.data?.submitTrainerApplication;
			if (
				!application?._id ||
				application.memberId !== ownerId ||
				application.status !== TrainerApplicationStatus.PENDING
			)
				throw new Error(t('Submission error'));
			setSubmitted(application);
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
					<h1 id="trainer-application-title">{t('Title')}</h1>
					<p>{t('Intro')}</p>
				</header>
				{existing ? (
					<div className="application-notice" role="status">
						<h2>{t(submitted ? 'Submitted title' : 'Existing title')}</h2>
						<p>{t(submitted ? 'Submitted copy' : 'Existing copy')}</p>
						<Link href={profileRoute}>{t('Back to profile')}</Link>
					</div>
				) : query.loading ? (
					<p className="application-notice" role="status">
						{t('Loading')}
					</p>
				) : query.error || !checked ? (
					<div className="application-notice" role="alert">
						<p>{authErrorMessage(query.error, t('Connection error'), t('Query error'))}</p>
						<Button onClick={() => void retryQuery()}>{t('Retry')}</Button>
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
								disabled={submitting || needsRecheck}
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
	const access = myBookingsAccess(ready && router.isReady, authError, user);
	const sessionIdentity = getAuthSessionId();
	return (
		<div id="trainer-application-page">
			<nav className="application-breadcrumb" aria-label={t('Breadcrumb')}>
				<Link href={profileRoute}>{t('My profile')}</Link>
				<span aria-hidden="true">/</span>
				<span aria-current="page">{t('Entry')}</span>
			</nav>
			{access === 'ready' ? (
				<ApplicationForm
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
