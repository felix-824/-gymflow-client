import React, { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { Button, Checkbox, FormControlLabel, MenuItem, Radio, RadioGroup, TextField } from '@mui/material';
import { GET_GYM_BY_ADMIN } from '../../../../apollo/admin/query';
import { CREATE_GYM, UPDATE_GYM_BY_ADMIN } from '../../../../apollo/admin/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../../apollo/store';
import { getAuthSessionId } from '../../../auth';
import { MemberStatus, MemberType } from '../../../enums/member.enum';
import { GymAmenity, GymLocation, GymStatus } from '../../../enums/gym.enum';
import { AdminGym } from '../../../types/gym/gym';
import { GymInput } from '../../../types/gym/gym.input';
import { GymUpdate } from '../../../types/gym/gym.update';
import {
	gymBasicErrors,
	gymEditorDraft,
	GymEditorDraft,
	gymEditorId,
	gymEditorKey,
	gymEditorReceipt,
	gymFormError,
	gymPayload,
	gymStatusLabelKeys,
	gymUpdateError,
	GymUpdateError,
} from '../../../admin-gyms';
import { sweetTopSmallSuccessAlert } from '../../../sweetAlert';
import AdminGymAccess from './AdminGymAccess';
import GymImages from './GymImages';
import GymOpeningHours from './GymOpeningHours';

const GymEditor = ({ gymId, invalidId }: { gymId: string; invalidId: boolean }) => {
	const { t } = useTranslation(['admin-gyms', 'common']);
	const router = useRouter();
	const editing = Boolean(gymId);
	const identity = useRef({ ownerId: userVar()._id, session: getAuthSessionId() });
	const mounted = useRef(true);
	const leaving = useRef(false);
	const epoch = useRef(0);
	const writeLock = useRef(false);
	const readLock = useRef(false);
	const uploadLock = useRef(false);
	const hydrated = useRef(false);
	const confirmedCreate = useRef('');
	const [draft, setDraft] = useState(() => gymEditorDraft());
	const [baseline, setBaseline] = useState(() => gymEditorDraft());
	const [revision, setRevision] = useState<number | null>(null);
	const [loaded, setLoaded] = useState(!editing && !invalidId);
	const [readFailure, setReadFailure] = useState<'invalid' | 'missing' | null>(null);
	const [failure, setFailure] = useState<GymUpdateError | null>(null);
	const [createdId, setCreatedId] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [showValidation, setShowValidation] = useState(false);
	const [touched, setTouched] = useState<Record<string, boolean>>({});
	const active = () =>
		mounted.current &&
		!leaving.current &&
		authReadyVar() &&
		!authErrorVar() &&
		userVar()._id === identity.current.ownerId &&
		getAuthSessionId() === identity.current.session &&
		userVar().memberType === MemberType.ADMIN &&
		userVar().memberStatus === MemberStatus.ACTIVE &&
		gymEditorId(router.query.id) === gymId &&
		(router.query.id !== undefined) === editing;
	useEffect(() => {
		mounted.current = true;
		const leave = () => {
			leaving.current = true;
			epoch.current++;
			if (writeLock.current && !confirmedCreate.current) setFailure('unknown');
		};
		const cancelled = () => {
			leaving.current = false;
		};
		router.events.on('routeChangeStart', leave);
		router.events.on('routeChangeError', cancelled);
		return () => {
			mounted.current = false;
			router.events.off('routeChangeStart', leave);
			router.events.off('routeChangeError', cancelled);
		};
	}, [router.events]);
	const accept = (gym: AdminGym) => {
		const next = gymEditorDraft(gym);
		setDraft(next);
		setBaseline(next);
		setRevision(gym.gymRevision);
		setLoaded(true);
		setReadFailure(null);
	};
	const query = useQuery<{ getGymByAdmin: AdminGym | null }, { gymId: string }>(GET_GYM_BY_ADMIN, {
		variables: { gymId },
		skip: !editing || invalidId,
		fetchPolicy: 'no-cache',
		notifyOnNetworkStatusChange: true,
		context: { handleErrorLocally: true, queryDeduplication: false },
		onCompleted: (data) => {
			if (!active() || hydrated.current) return;
			const gym = data.getGymByAdmin;
			if (!gym) {
				setReadFailure('missing');
				return;
			}
			if (!gymEditorReceipt(gym) || gym._id !== gymId) {
				setReadFailure('invalid');
				return;
			}
			hydrated.current = true;
			accept(gym);
		},
	});
	const [createGym] = useMutation<{ createGym: AdminGym }, { input: GymInput }>(CREATE_GYM, {
		fetchPolicy: 'no-cache',
		context: { handleErrorLocally: true },
	});
	const [updateGym] = useMutation<{ updateGymByAdmin: AdminGym }, { input: GymUpdate }>(UPDATE_GYM_BY_ADMIN, {
		fetchPolicy: 'no-cache',
		context: { handleErrorLocally: true },
	});
	const input = draft as GymInput;
	const invalid = gymFormError(input);
	const basicErrors = gymBasicErrors(input);
	const dirty = gymEditorKey(draft) !== gymEditorKey(baseline);
	const terminal = draft.gymStatus === GymStatus.DELETE;
	const blocked = failure === 'unknown' || failure === 'stale' || failure === 'contention';
	const locked = terminal || submitting || uploading || Boolean(createdId);
	const saveDisabled =
		locked ||
		!loaded ||
		Boolean(invalid) ||
		blocked ||
		(editing && (!dirty || revision === null || revision >= 2147483647));
	const change = (patch: Partial<GymEditorDraft>) => {
		if (!active() || writeLock.current || uploadLock.current || terminal || createdId) return;
		setDraft((current) => ({ ...current, ...patch }));
		if (!blocked && failure !== 'referenced-venue') setFailure(null);
	};
	const retry = async () => {
		if (!active() || hydrated.current || readLock.current || query.loading) return;
		readLock.current = true;
		setReadFailure(null);
		try {
			await query.refetch();
		} catch {
			/* The query renders localized feedback. */
		} finally {
			readLock.current = false;
		}
	};
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (
			!active() ||
			writeLock.current ||
			uploadLock.current ||
			!loaded ||
			terminal ||
			confirmedCreate.current ||
			blocked
		)
			return;
		setShowValidation(true);
		if (invalid || (editing && (!dirty || revision === null || revision >= 2147483647))) return;
		const generation = epoch.current;
		const current = () => active() && epoch.current === generation;
		writeLock.current = true;
		setSubmitting(true);
		setFailure(null);
		try {
			const payload = gymPayload(input);
			let gym: AdminGym | undefined;
			if (editing) {
				const result = await updateGym({
					variables: { input: { ...payload, _id: gymId, expectedRevision: revision!, gymStatus: draft.gymStatus } },
				});
				if (result.errors?.length)
					throw Object.assign(new Error('Gym save rejected'), { graphQLErrors: result.errors });
				gym = result.data?.updateGymByAdmin;
			} else {
				const result = await createGym({ variables: { input: payload } });
				if (result.errors?.length)
					throw Object.assign(new Error('Gym creation rejected'), { graphQLErrors: result.errors });
				gym = result.data?.createGym;
			}
			if (!current()) return;
			if (
				!gymEditorReceipt(gym) ||
				(editing
					? gym._id !== gymId || gym.gymRevision !== revision! + 1 || gym.gymStatus !== draft.gymStatus
					: gym.gymStatus !== GymStatus.PAUSED || gym.gymRevision !== 0)
			)
				throw new Error('Unconfirmed Gym save');
			accept(gym);
			void sweetTopSmallSuccessAlert(t('form.saved')).catch(() => undefined);
			if (!editing) {
				confirmedCreate.current = gym._id;
				setCreatedId(gym._id);
				// The list uses no-cache reads on mount; no mutation replay or cache-only list is used.
				try {
					await router.replace({ pathname: '/_admin/gyms/detail', query: { id: gym._id } });
				} catch {
					/* Keep the confirmed edit link available. */
				}
			}
		} catch (error) {
			if (current()) setFailure(gymUpdateError(error));
		} finally {
			writeLock.current = false;
			if (mounted.current) setSubmitting(false);
		}
	};
	const missing =
		invalidId ||
		readFailure === 'missing' ||
		query.error?.graphQLErrors.some((error) => error.message === 'Gym not found');
	const failureKey =
		failure === 'stale'
			? 'conflict.stale'
			: failure === 'contention'
			? 'conflict.busy'
			: failure === 'unknown'
			? editing
				? 'conflict.unknown'
				: 'conflict.unknownCreate'
			: failure === 'referenced-venue'
			? 'venue.referenced'
			: 'form.saveError';
	const field = (name: 'gymName' | 'gymAddress' | 'gymDesc' | 'gymPhone') => {
		const error = showValidation || touched[name] ? basicErrors[name] : undefined;
		return (
			<TextField
				id={`gym-${name}`}
				name={name}
				label={t(
					`basic.${{ gymName: 'name', gymAddress: 'address', gymDesc: 'description', gymPhone: 'phone' }[name]}`,
				)}
				value={draft[name] ?? ''}
				required={name === 'gymName' || name === 'gymAddress'}
				disabled={locked}
				error={Boolean(error || (failure === 'referenced-venue' && name === 'gymAddress'))}
				type={name === 'gymPhone' ? 'tel' : 'text'}
				multiline={name === 'gymDesc'}
				minRows={name === 'gymDesc' ? 4 : undefined}
				inputProps={{
					maxLength: name === 'gymDesc' ? 2000 : name === 'gymPhone' ? 25 : 100,
					'aria-describedby':
						`${error ? `gym-${name}-helper-text ` : ''}${
							failure === 'referenced-venue' && name === 'gymAddress' ? 'gym-venue-error' : ''
						}`.trim() || undefined,
				}}
				helperText={
					error
						? t(error)
						: name === 'gymDesc'
						? t('basic.descriptionHelper')
						: name === 'gymPhone'
						? t('basic.phoneHelper')
						: undefined
				}
				onBlur={() => setTouched((current) => ({ ...current, [name]: true }))}
				onChange={(event) => change({ [name]: event.target.value })}
			/>
		);
	};
	return (
		<div className="content admin-gym-editor">
			<nav className="gym-editor-back">
				<Link
					href="/_admin/gyms"
					aria-disabled={submitting}
					onClick={(event) => {
						if (writeLock.current) event.preventDefault();
					}}
				>
					{t('form.back')}
				</Link>
			</nav>
			<header className="gym-editor-heading">
				<div>
					<h1>{t(editing ? (terminal ? 'form.viewTitle' : 'form.editTitle') : 'form.createTitle')}</h1>
					<p>{t(editing ? 'form.editIntro' : 'form.createIntro')}</p>
				</div>
				{loaded && (
					<span className={`admin-gym-status is-${baseline.gymStatus.toLowerCase()}`}>
						{t(gymStatusLabelKeys[baseline.gymStatus])}
					</span>
				)}
			</header>
			{!loaded ? (
				<div className="gym-editor-read-state" role={query.loading ? 'status' : 'alert'}>
					<p>{t(query.loading ? 'form.loading' : missing ? 'form.notFound' : 'form.loadError')}</p>
					{!query.loading && !invalidId && (
						<Button type="button" onClick={() => void retry()}>
							{t('list.retry')}
						</Button>
					)}
				</div>
			) : (
				<form noValidate onSubmit={submit} aria-busy={submitting || uploading}>
					{!editing && <p className="gym-editor-notice">{t('lifecycle.createdPaused')}</p>}
					{terminal && (
						<p className="gym-editor-notice" role="status">
							{t('lifecycle.terminal')}
						</p>
					)}
					{failure && failure !== 'referenced-venue' && (
						<p className="gym-editor-error" role="alert" data-recovery={failure}>
							{t(failureKey)}
						</p>
					)}
					{createdId && (
						<p className="gym-editor-notice" role="status">
							<Link href={{ pathname: '/_admin/gyms/detail', query: { id: createdId } }}>{t('form.openCreated')}</Link>
						</p>
					)}
					<fieldset className="admin-gym-control gym-editor-basic" disabled={locked}>
						<legend>{t('basic.title')}</legend>
						<p className="gym-editor-required">{t('form.requiredNote')}</p>
						<div className="gym-editor-fields">
							<div>{field('gymName')}</div>
							<div>
								<TextField
									id="gym-location"
									select
									label={t('basic.location')}
									required
									value={draft.gymLocation}
									disabled={locked}
									error={Boolean(
										((showValidation || touched.gymLocation) && basicErrors.gymLocation) ||
											failure === 'referenced-venue',
									)}
									helperText={
										(showValidation || touched.gymLocation) && basicErrors.gymLocation
											? t(basicErrors.gymLocation!)
											: undefined
									}
									inputProps={{
										'aria-describedby':
											[
												(showValidation || touched.gymLocation) && basicErrors.gymLocation
													? 'gym-location-helper-text'
													: '',
												failure === 'referenced-venue' ? 'gym-venue-error' : '',
											]
												.filter(Boolean)
												.join(' ') || undefined,
									}}
									onBlur={() => setTouched((current) => ({ ...current, gymLocation: true }))}
									onChange={(event) => change({ gymLocation: event.target.value as GymLocation })}
								>
									<MenuItem value="" disabled>
										{t('basic.chooseLocation')}
									</MenuItem>
									{Object.values(GymLocation).map((location) => (
										<MenuItem key={location} value={location}>
											{t(location, { ns: 'common' })}
										</MenuItem>
									))}
								</TextField>
							</div>
							<div className="gym-editor-wide">{field('gymAddress')}</div>
							{failure === 'referenced-venue' && (
								<p
									id="gym-venue-error"
									className="gym-editor-error gym-editor-wide"
									role="alert"
									data-recovery={failure}
								>
									{t('venue.referenced')}
								</p>
							)}
							<div className="gym-editor-description">{field('gymDesc')}</div>
							<div>{field('gymPhone')}</div>
						</div>
					</fieldset>
					<GymImages
						images={draft.gymImages}
						title={editing ? t('photos.editTitle') : undefined}
						scopeKey={`gym:${gymId || 'create'}`}
						showValidation={showValidation}
						disabled={submitting || terminal || Boolean(createdId)}
						onUploadingChange={(value) => {
							uploadLock.current = value;
							setUploading(value);
						}}
						onChange={(gymImages) => {
							if (active() && !writeLock.current) setDraft((current) => ({ ...current, gymImages }));
						}}
					/>
					<fieldset className="admin-gym-control gym-editor-amenities" disabled={locked}>
						<legend>{t(editing ? 'amenities.editTitle' : 'amenities.title')}</legend>
						<div className="gym-editor-amenity-grid">
							{Object.values(GymAmenity).map((amenity) => (
								<FormControlLabel
									key={amenity}
									className={draft.amenities.includes(amenity) ? 'is-selected' : ''}
									label={t(`amenities.${amenity}`)}
									control={
										<Checkbox
											disabled={locked}
											checked={draft.amenities.includes(amenity)}
											onChange={(_, checked) =>
												change({
													amenities: checked
														? [...draft.amenities, amenity]
														: draft.amenities.filter((value) => value !== amenity),
												})
											}
										/>
									}
								/>
							))}
						</div>
					</fieldset>
					<GymOpeningHours
						value={draft.openingHours}
						onChange={(openingHours) => change({ openingHours })}
						disabled={locked}
						showValidation={showValidation}
					/>
					<fieldset className="admin-gym-control gym-editor-publishing" disabled={locked}>
						<legend>{t(editing ? 'lifecycle.editTitle' : 'lifecycle.publishingTitle')}</legend>
						{editing && !terminal ? (
							<RadioGroup
								row
								aria-label={t('lifecycle.title')}
								value={draft.gymStatus}
								onChange={(_, value) => {
									if (value === GymStatus.ACTIVE || value === GymStatus.PAUSED) change({ gymStatus: value });
								}}
							>
								{[GymStatus.ACTIVE, GymStatus.PAUSED].map((status) => (
									<FormControlLabel
										className={draft.gymStatus === status ? 'is-selected' : ''}
										key={status}
										label={t(gymStatusLabelKeys[status])}
										value={status}
										control={<Radio disabled={locked} />}
									/>
								))}
							</RadioGroup>
						) : (
							<p>{t(terminal ? 'lifecycle.terminal' : 'lifecycle.createdPaused')}</p>
						)}
						{editing && <p className="gym-control-note">{t('lifecycle.visibilityNote')}</p>}
					</fieldset>
					{editing && !terminal && (
						<section className="gym-editor-danger">
							<h2>{t('lifecycle.dangerTitle')}</h2>
							<p>{t('lifecycle.deletionNote')}</p>
						</section>
					)}
					{!terminal && (
						<footer className="gym-editor-actions">
							<p role="status">
								{t(
									submitting
										? 'form.saving'
										: uploading
										? 'photos.uploading'
										: invalid
										? 'form.completeRequired'
										: dirty
										? 'form.unsaved'
										: 'form.noChanges',
								)}
							</p>
							<div>
								<Button type="button" disabled={submitting} onClick={() => void router.push('/_admin/gyms')}>
									{t('form.cancel')}
								</Button>
								<Button type="submit" variant="contained" disabled={saveDisabled}>
									{t(submitting ? 'form.saving' : editing ? 'form.save' : 'list.create')}
								</Button>
							</div>
						</footer>
					)}
				</form>
			)}
		</div>
	);
};

const GymDetail = () => {
	const router = useRouter();
	const gymId = gymEditorId(router.query.id);
	const invalidId = router.query.id !== undefined && !gymId;
	return (
		<AdminGymAccess>
			<GymEditor key={invalidId ? 'invalid' : gymId || 'create'} gymId={gymId} invalidId={invalidId} />
		</AdminGymAccess>
	);
};

export default GymDetail;
