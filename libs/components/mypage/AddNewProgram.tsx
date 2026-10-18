import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useMediaQuery } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ProgramCategory, ProgramLocation, ProgramType } from '../../enums/program.enum';
import { ProgramCreateInput, ProgramInput } from '../../types/program/program.input';
import { Programs } from '../../types/program/program';
import { TrainerReservations } from '../../types/reservation/trainer-reservation';
import axios from 'axios';
import { ensureAccessToken, getAuthSessionId, invalidateSession, isAuthenticationError } from '../../auth';
import { authReadyVar, userVar } from '../../../apollo/store';
import { useApolloClient, useMutation, useReactiveVar } from '@apollo/client';
import { CREATE_PROGRAM, UPDATE_PROGRAM } from '../../../apollo/user/mutation';
import { GET_TRAINER_PROGRAMS, GET_TRAINER_RESERVATIONS } from '../../../apollo/user/query';
import { sweetConfirmAlert, sweetMixinSuccessAlert } from '../../sweetAlert';
import {
	findTrainerProgram,
	ProgramCreateEnvelope,
	readProgramCreateEnvelope,
	storeProgramCreateEnvelope,
	clearProgramCreateEnvelope,
	programCreateError,
	isProgramRevision,
	programUpdateError,
	programFormError,
	programPayload,
	ProgramEditConstraints,
	readProgramEditConstraints,
	readTrainerProgramsInquiry,
} from '../../program';
import { getApiGraphqlUrl, IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_TYPES, REACT_APP_API_URL } from '../../config';
import { TrainerWorkspaceHeader, TrainerWorkspaceNavigation } from './TrainerWorkspaceNavigation';

const initialValues: ProgramInput = {
	programName: '',
	programType: ProgramType.PT_1ON1,
	programCategory: ProgramCategory.WEIGHT_LOSS,
	programLocation: ProgramLocation.SEOUL,
	programPrice: 0,
	programDuration: 60,
	programCapacity: 1,
	programAddress: '',
	programDesc: '',
	programImages: [],
};

const AddProgram = () => {
	const { t } = useTranslation('common');
	const compactViewport = useMediaQuery('(max-width:767px)');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const client = useApolloClient();
	const editing = router.query.programId !== undefined;
	const programId = typeof router.query.programId === 'string' ? router.query.programId.toLowerCase() : '';
	const sessionIdentity = getAuthSessionId();
	const scope = `${authReady}:${user.memberType}:${user._id}:${sessionIdentity}:${programId}`;
	const inquiry = readTrainerProgramsInquiry(router.query.input);
	const [insertProgramData, setInsertProgramData] = useState<ProgramInput>({ ...initialValues });
	const [loadedScope, setLoadedScope] = useState('');
	const [loading, setLoading] = useState(false);
	const [formError, setFormError] = useState('');
	const [loadError, setLoadError] = useState('');
	const [uploading, setUploading] = useState(false);
	const [validationAttempt, setValidationAttempt] = useState(0);
	const [editConstraints, setEditConstraints] = useState<{ scope: string; values: ProgramEditConstraints } | null>(
		null,
	);
	const [reservationLoading, setReservationLoading] = useState(false);
	const [reservationError, setReservationError] = useState(false);
	const [loadedCapacity, setLoadedCapacity] = useState(1);
	const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
	const [writeBlocked, setWriteBlocked] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const refreshLock = useRef(false);
	const [createEnvelope, setCreateEnvelope] = useState<ProgramCreateEnvelope | null>(null);
	const createEnvelopeRef = useRef<ProgramCreateEnvelope | null>(null);
	const [createReadyScope, setCreateReadyScope] = useState('');
	const [createStorageError, setCreateStorageError] = useState(false);
	const [createTerminal, setCreateTerminal] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const errorRef = useRef<HTMLParagraphElement>(null);
	const lookupRequest = useRef(0);
	const reservationRequest = useRef(0);
	const currentScope = useRef(scope);
	currentScope.current = scope;
	const submitting = useRef(false);
	const uploadTask = useRef<{ controller: AbortController; scope: string; epoch: number } | null>(null);
	const draftEpoch = useRef(0);
	const [createProgram, { loading: creating }] = useMutation(CREATE_PROGRAM);
	const [updateProgram, { loading: updating }] = useMutation(UPDATE_PROGRAM);

	/** APOLLO REQUESTS **/
	const readReservations = useCallback(async () => {
		const request = ++reservationRequest.current;
		const isCurrent = () =>
			request === reservationRequest.current &&
			currentScope.current === scope &&
			authReadyVar() &&
			userVar().memberType === 'TRAINER' &&
			userVar()._id === user._id &&
			getAuthSessionId() === sessionIdentity;
		setEditConstraints(null);
		setReservationLoading(true);
		setReservationError(false);
		try {
			const values = await readProgramEditConstraints(
				programId,
				async (input) => {
					const { data } = await client.query<{ getTrainerReservations: TrainerReservations }>({
						query: GET_TRAINER_RESERVATIONS,
						variables: { input },
						fetchPolicy: 'no-cache',
						context: { queryDeduplication: false, handleErrorLocally: true },
					});
					return data.getTrainerReservations;
				},
				isCurrent,
			);
			if (isCurrent() && values) setEditConstraints({ scope, values });
		} catch {
			if (isCurrent()) setReservationError(true);
		} finally {
			if (isCurrent()) setReservationLoading(false);
		}
	}, [client, programId, scope, sessionIdentity, user._id]);

	const lookupProgram = useCallback(
		async (conflict = false) => {
			const request = ++lookupRequest.current;
			const isCurrent = () =>
				request === lookupRequest.current &&
				currentScope.current === scope &&
				authReadyVar() &&
				userVar().memberType === 'TRAINER' &&
				userVar()._id === user._id &&
				getAuthSessionId() === sessionIdentity;
			if (!conflict) {
				setLoading(true);
				setLoadedScope('');
				setLoadError('');
			}
			try {
				if (!/^[a-f\d]{24}$/i.test(programId)) {
					setLoadError('Invalid id');
					return;
				}
				const program = await findTrainerProgram(
					programId,
					async (input) => {
						const { data } = await client.query<{ getTrainerPrograms: Programs }>({
							query: GET_TRAINER_PROGRAMS,
							variables: { input },
							fetchPolicy: 'no-cache',
							context: { queryDeduplication: false, handleErrorLocally: true },
						});
						return data.getTrainerPrograms;
					},
					isCurrent,
				);
				if (!isCurrent()) return;
				if (!program) {
					if (conflict) setFormError('Unavailable');
					else setLoadError('Unavailable');
					return;
				}
				if (!isProgramRevision(program.programRevision)) throw new Error('Missing Program revision');
				setInsertProgramData(programPayload(program));
				setLoadedCapacity(program.programCapacity);
				setLoadedRevision(program.programRevision);
				setLoadedScope(scope);
				setFormError('');
				setWriteBlocked(false);
				if (conflict) await readReservations();
			} catch (err) {
				if (isCurrent()) {
					if (conflict) setFormError('Refresh failed');
					else setLoadError('Load error');
				}
			} finally {
				if (isCurrent()) setLoading(false);
			}
		},
		[client, programId, scope, sessionIdentity, user._id, readReservations],
	);
	const refreshProgram = async () => {
		if (refreshLock.current || submitting.current || uploadTask.current) return;
		refreshLock.current = true;
		setRefreshing(true);
		try {
			if (
				!(await sweetConfirmAlert(t('Trainer program form.Refresh confirmation'))) ||
				currentScope.current !== scope || getAuthSessionId() !== sessionIdentity
			)
				return;
			await lookupProgram(true);
		} finally {
			refreshLock.current = false;
			if (currentScope.current === scope) setRefreshing(false);
		}
	};

	const submitCreate = async (payload?: ProgramInput) => {
		if (submitting.current || uploadTask.current || refreshLock.current ||
			currentScope.current !== scope || getAuthSessionId() !== sessionIdentity ||
			!authReadyVar() || userVar().memberType !== 'TRAINER' || userVar()._id !== user._id ||
			createReadyScope !== scope || createStorageError || createTerminal) return;
		let envelope = createEnvelopeRef.current;
		if (envelope?.status === 'confirmed' || (!envelope && !payload)) return;
		submitting.current = true;
		const epoch = draftEpoch.current;
		const isCurrent = () => currentScope.current === scope && draftEpoch.current === epoch &&
			getAuthSessionId() === sessionIdentity && userVar()._id === user._id;
		try {
			if (!envelope) {
				envelope = {
					ownerId: user._id, createRequestId: window.crypto.randomUUID(),
					payload: programPayload(payload!), status: 'unresolved',
				};
				// Persist before dispatch. A storage failure must never dispatch an unrecoverable Create.
				storeProgramCreateEnvelope(envelope);
				createEnvelopeRef.current = envelope;
				setCreateEnvelope(envelope);
			}
			setFormError('');
			const input: ProgramCreateInput = { ...envelope.payload, createRequestId: envelope.createRequestId };
			const response = await createProgram({
				variables: { input },
				context: { handleErrorLocally: true },
			});
			if (!isCurrent()) return;
			const created = response.data?.createProgram;
			if (!/^[a-f\d]{24}$/i.test(created?._id ?? '') || created.memberId !== user._id ||
				!isProgramRevision(created.programRevision)) throw new Error('Create outcome unconfirmed');
			const confirmed: ProgramCreateEnvelope = { ...envelope, status: 'confirmed', programId: created._id };
			// Confirm synchronously before any feedback/navigation; failure cannot unlock a fresh Create.
			createEnvelopeRef.current = confirmed;
			setCreateEnvelope(confirmed);
			try { storeProgramCreateEnvelope(confirmed); } catch { /* The unresolved disk receipt still recovers the same key. */ }
			setFormError('Created');
			await sweetMixinSuccessAlert(t('Trainer program form.Created'));
			if (isCurrent()) await router.push({ pathname: '/mypage', query: { category: 'myPrograms', input: JSON.stringify(inquiry) } });
		} catch (err) {
			if (!isCurrent()) return;
			if (createEnvelopeRef.current?.status === 'confirmed') setFormError('Created');
			else if (createEnvelopeRef.current) {
				const kind = programCreateError(err);
				setCreateTerminal(kind !== 'unknown');
				setFormError(kind === 'payload' ? 'Create payload conflict' : kind === 'unavailable' ? 'Create unavailable' : 'Uncertain create');
			} else {
				setCreateStorageError(true);
				setFormError('Create storage failed');
			}
			setValidationAttempt((attempt) => attempt + 1);
		} finally {
			submitting.current = false;
		}
	};
	const startNewCreate = async () => {
		if (submitting.current || refreshLock.current || uploadTask.current) return;
		refreshLock.current = true;
		setRefreshing(true);
		try {
			if (!(await sweetConfirmAlert(t('Trainer program form.New create confirmation'))) ||
				currentScope.current !== scope || getAuthSessionId() !== sessionIdentity) return;
			clearProgramCreateEnvelope(user._id);
			createEnvelopeRef.current = null;
			setCreateEnvelope(null);
			setCreateStorageError(false);
			setCreateTerminal(false);
			setCreateReadyScope(scope);
			setFormError('');
		} catch {
			if (currentScope.current === scope) setFormError('Create storage failed');
		} finally {
			refreshLock.current = false;
			if (currentScope.current === scope) setRefreshing(false);
		}
	};

	/** LIFECYCLES **/
	useEffect(() => {
		draftEpoch.current++;
		setUploading(false);
		const cancel = () => {
			draftEpoch.current++;
			uploadTask.current?.controller.abort();
			uploadTask.current = null;
		};
		const leave = () => {
			cancel();
			setUploading(false);
		};
		router.events?.on('routeChangeStart', leave);
		return () => {
			router.events?.off('routeChangeStart', leave);
			cancel();
		};
	}, [scope, router.events]);

	useEffect(() => {
		setEditConstraints(null);
		setReservationError(false);
		setReservationLoading(false);
		if (editing && loadedScope === scope) void readReservations();
		return () => {
			reservationRequest.current += 1;
		};
	}, [editing, loadedScope, scope, readReservations]);

	useEffect(() => {
		setLoadedScope('');
		setLoadError('');
		setFormError('');
		setLoadedRevision(null);
		setWriteBlocked(false);
		setRefreshing(false);
		createEnvelopeRef.current = null;
		setCreateEnvelope(null);
		setCreateReadyScope('');
		setCreateStorageError(false);
		setCreateTerminal(false);
		if (!editing) {
			setLoading(false);
			setInsertProgramData({ ...initialValues });
			if (router.isReady && authReady && user.memberType === 'TRAINER') {
				try {
					const envelope = readProgramCreateEnvelope(user._id);
					createEnvelopeRef.current = envelope;
					setCreateEnvelope(envelope);
					if (envelope) {
						setInsertProgramData(envelope.payload);
						setFormError(envelope.status === 'confirmed' ? 'Created' : 'Uncertain create');
					}
					setCreateReadyScope(scope);
				} catch {
					setCreateStorageError(true);
					setFormError('Create storage failed');
				}
			}
		} else if (router.isReady && authReady && user.memberType === 'TRAINER') void lookupProgram();
		return () => {
			lookupRequest.current += 1;
		};
	}, [editing, router.isReady, authReady, user.memberType, user._id, scope, lookupProgram]);

	useEffect(() => {
		if (!validationAttempt) return;
		errorRef.current?.focus({ preventScroll: true });
		errorRef.current?.scrollIntoView({ block: 'center' });
	}, [validationAttempt]);

	/** HANDLERS **/
	const typeHandler = (type: ProgramType) => {
		setInsertProgramData({
			...insertProgramData,
			programType: type,
			programLocation:
				type === ProgramType.ONLINE
					? ProgramLocation.ONLINE
					: insertProgramData.programLocation === ProgramLocation.ONLINE
					? ProgramLocation.SEOUL
					: insertProgramData.programLocation,
			programCapacity: type === ProgramType.PT_1ON1 ? 1 : insertProgramData.programCapacity,
			programAddress: type === ProgramType.ONLINE ? '' : insertProgramData.programAddress,
		});
	};
	const uploadImages = async () => {
		const uploadSession = getAuthSessionId();
		if (uploadTask.current || submitting.current || refreshLock.current || (!editing && createEnvelopeRef.current) || !inputRef.current?.files?.length) return;
		const task = { controller: new AbortController(), scope, epoch: draftEpoch.current };
		uploadTask.current = task;
		const sameDraft = () => currentScope.current === task.scope && draftEpoch.current === task.epoch && getAuthSessionId() === uploadSession;
		const isCurrent = () => uploadTask.current === task && sameDraft();
		setUploading(true);
		setFormError('');
		try {
			const files = Array.from(inputRef.current.files);
			if (files.length + insertProgramData.programImages.length > 5)
				throw new Error('Cannot upload more than 5 images.');
			if (files.some((file) => !IMAGE_UPLOAD_TYPES.includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)))
				throw new Error('Only JPEG, PNG and WebP images are allowed.');
			if (files.some((file) => file.size > IMAGE_UPLOAD_MAX_BYTES)) throw new Error('Image exceeds the 5 MiB limit.');
			const formData = new FormData();
			formData.append(
				'operations',
				JSON.stringify({
					query:
						'mutation ImagesUploader($files: [Upload!]!, $target: String!) { imagesUploader(files: $files, target: $target) }',
					variables: { files: files.map(() => null), target: 'program' },
				}),
			);
			const map: Record<string, string[]> = {};
			files.forEach((_, index) => {
				map[String(index)] = ['variables.files.' + index];
			});
			formData.append('map', JSON.stringify(map));
			files.forEach((file, index) => formData.append(String(index), file));
			const accessToken = await ensureAccessToken(true);
			if (!isCurrent()) return;
			const response = await axios.post(
				getApiGraphqlUrl(),
				formData,
				{
					signal: task.controller.signal,
					headers: { 'apollo-require-preflight': 'true', Authorization: 'Bearer ' + accessToken },
				},
			);
			if (!isCurrent()) return;
			if (response.data.errors?.length) {
				if (isAuthenticationError({ graphQLErrors: response.data.errors })) invalidateSession();
				throw new Error(response.data.errors[0].message);
			}
			const images: string[] = response.data.data?.imagesUploader;
			if (!Array.isArray(images) || images.length !== files.length || images.some(image => typeof image !== 'string' || !image.trim()))
				throw new Error('Image upload failed.');
			setInsertProgramData((previous) => sameDraft() ? ({ ...previous, programImages: [...previous.programImages, ...images] }) : previous);
		} catch (err: any) {
			if (!isCurrent()) return;
			if (isAuthenticationError(err)) invalidateSession();
			setFormError(err.message ?? 'Image upload failed.');
		} finally {
			if (uploadTask.current === task) {
				uploadTask.current = null;
				setUploading(false);
				if (inputRef.current) inputRef.current.value = '';
			}
		}
	};
	const submitHandler = async (event: React.FormEvent) => {
		event.preventDefault();
		if (
			submitting.current || refreshLock.current || uploadTask.current || uploading ||
			(editing && (writeBlocked || !isProgramRevision(loadedRevision) || loadedScope !== scope || editConstraints?.scope !== scope))
		)
			return;
		if (!editing && createEnvelopeRef.current) return;
		const error =
			programFormError(insertProgramData) ||
			(editing &&
			insertProgramData.programType === ProgramType.GROUP_CLASS &&
			insertProgramData.programCapacity < loadedCapacity &&
			insertProgramData.programCapacity < (editConstraints?.values.maxOccupied ?? 0)
				? 'Program capacity cannot be reduced below occupied session seats.'
				: '');
		if (error) {
			setFormError(error);
			setValidationAttempt((attempt) => attempt + 1);
			return;
		}
		if (!editing) {
			await submitCreate(programPayload(insertProgramData));
			return;
		}
		submitting.current = true;
		setFormError('');
		let confirmedUpdate = false;
		try {
			const payload = programPayload(insertProgramData, Boolean(programId));
			if (programId) {
				const response = await updateProgram({
					variables: { input: { ...payload, _id: programId, expectedRevision: loadedRevision } },
					context: { handleErrorLocally: true },
				});
				if (currentScope.current !== scope || getAuthSessionId() !== sessionIdentity) return;
				const updated = response.data?.updateProgram;
				if (
					updated?._id !== programId || !isProgramRevision(updated.programRevision) ||
					updated.programRevision !== loadedRevision! + 1
				)
					throw new Error('Update outcome unconfirmed');
				setLoadedRevision(updated.programRevision);
				confirmedUpdate = true;
			}
			await sweetMixinSuccessAlert(t(`Trainer program form.${editing ? 'Updated' : 'Created'}`));
			await router.push({ pathname: '/mypage', query: { category: 'myPrograms', input: JSON.stringify(inquiry) } });
		} catch (err: any) {
			if (editing) {
				if (currentScope.current !== scope || getAuthSessionId() !== sessionIdentity) return;
				if (confirmedUpdate) setFormError('Updated');
				else {
					const kind = programUpdateError(err);
					if (kind !== 'rejected') setWriteBlocked(true);
					const messages = { stale: 'Conflict', contention: 'Contention', unavailable: 'Unavailable', unknown: 'Uncertain update' };
					setFormError(kind === 'rejected' ? err.message ?? 'Could not save this program.' : messages[kind]);
					setValidationAttempt((attempt) => attempt + 1);
				}
			} else setFormError(err.message ?? 'Could not save this program.');
		} finally {
			submitting.current = false;
		}
	};

	const busy = creating || updating || uploading || refreshing;
	const policyReady = !editing || editConstraints?.scope === scope;
	const sensitiveLocked = editing && (!policyReady || Boolean(editConstraints?.values.hasProtected));
	const capacityMinimum =
		editing && policyReady ? Math.min(loadedCapacity, Math.max(1, editConstraints!.values.maxOccupied)) : 1;
	const createHeld = !editing && Boolean(createEnvelope || createStorageError);
	const saveDisabled = busy || !policyReady || (!editing && (createHeld || createReadyScope !== scope)) || (editing && (writeBlocked || !isProgramRevision(loadedRevision)));
	const loadBlocked = editing && (loading || loadedScope !== scope || Boolean(loadError));
	const saveLabel = t(
		`Trainer program form.${creating || updating ? 'Saving' : editing ? 'Save Changes' : 'Create Program'}`,
	);
	const programsUrl = { pathname: '/mypage', query: { category: 'myPrograms', input: JSON.stringify(inquiry) } };
	const online = insertProgramData.programType === ProgramType.ONLINE;
	const privateSession = insertProgramData.programType === ProgramType.PT_1ON1;
	const messageKeys: Record<string, string> = {
		'Please select a type, category and location.': 'Invalid selection',
		'Program name must contain 3–100 characters.': 'Invalid name',
		'Price must be a non-negative integer; duration and capacity must be positive integers.': 'Invalid numbers',
		'One-on-one programs require capacity 1.': 'Capacity note',
		'Online type and location must be selected together.': 'Invalid online',
		'In-person programs require a physical address.': 'Address required',
		'Address must contain 3–100 characters.': 'Invalid address',
		'Description must contain 5–500 characters, or be empty.': 'Invalid description',
		'Upload at least one program image.': 'Image required',
		'Cannot upload more than 5 images.': 'Image maximum',
		'Only JPEG, PNG and WebP images are allowed.': 'Image format',
		'Image format does not match its filename or MIME type.': 'Image format',
		'Image exceeds the 5 MiB limit.': 'Image size',
		'Animated images are not allowed.': 'Image animation',
		'Image upload is busy. Please try again.': 'Upload failed',
		'Image upload failed.': 'Upload failed',
		'Could not save this program.': 'Save failed',
		'Program type cannot be changed while upcoming reservations exist.': 'Type locked',
		'Program duration cannot be changed while upcoming reservations exist.': 'Duration locked',
		'Program location cannot be changed while upcoming reservations exist.': 'Location locked',
		'Program address cannot be changed while upcoming reservations exist.': 'Address locked',
		'Program capacity cannot be reduced below occupied session seats.': 'Capacity locked',
	};
	const errorMessage = ['Conflict', 'Contention', 'Uncertain update', 'Refresh failed', 'Unavailable', 'Updated', 'Created', 'Uncertain create', 'Create payload conflict', 'Create unavailable', 'Create storage failed'].includes(formError)
		? t('Trainer program form.' + formError)
		: messageKeys[formError] ? t('Trainer program form.' + messageKeys[formError]) : formError;

	const descriptionSection = (
		<section className="editor-section editor-description" aria-labelledby="editor-description-title">
			<div className="editor-section-heading">
				<h2 id="editor-description-title">
					<span className="editor-desktop-copy">{t('Trainer program form.Description')}</span>
					<span className="editor-mobile-copy">{t('Trainer program form.Mobile description')}</span>
				</h2>
				<p>{t('Trainer program form.Description intro')}</p>
			</div>
			<div className="editor-field">
				<label className="editor-sr-only" htmlFor="program-description">
					{t('Trainer program form.Description')}
				</label>
				<textarea
					id="program-description"
					name="programDesc"
					value={insertProgramData.programDesc ?? ''}
					maxLength={500}
					rows={6}
					placeholder={t('Trainer program form.Description placeholder')}
					onChange={(e) => setInsertProgramData({ ...insertProgramData, programDesc: e.target.value })}
				/>
				<p className="editor-description-meta">
					<span>{t('Trainer program form.Optional')}</span>
					<span>{t('Trainer program form.Characters', { count: (insertProgramData.programDesc ?? '').length })}</span>
				</p>
			</div>
		</section>
	);

	if (!authReady) return <p role="status">{t('Trainer programs.Auth loading')}</p>;
	if (user.memberType !== 'TRAINER') return <p role="alert">{t('Trainer programs.Trainer only')}</p>;

	return (
		<div className="trainer-program-editor-workspace">
			<TrainerWorkspaceHeader active="Programs" />
			<div id="add-program-page">
				<header className="editor-page-heading">
					<div>
						<Link passHref href={programsUrl} className="editor-back">
							<ArrowBackRoundedIcon aria-hidden="true" />
							{t('Trainer program form.Back')}
						</Link>
						<h1>{t(`Trainer program form.${editing ? 'Edit Program' : 'Create Program'}`)}</h1>
						<p>{t(`Trainer program form.${editing ? 'Edit intro' : 'Create intro'}`)}</p>
					</div>
					{!loadBlocked && (
						<div className="editor-top-actions">
							<Link passHref href={programsUrl} className="editor-cancel">
								{t('Trainer program form.Cancel')}
							</Link>
							<button type="submit" form="trainer-program-form" className="editor-save" disabled={saveDisabled}>
								<CheckCircleOutlineRoundedIcon aria-hidden="true" />
								{saveLabel}
							</button>
						</div>
					)}
				</header>
				{loadBlocked ? (
					<div className="editor-load-state" role={loadError ? 'alert' : 'status'}>
						<p>{t(`Trainer program form.${loadError || 'Loading'}`)}</p>
						{loadError === 'Load error' && (
							<button
								type="button"
								className="editor-back"
								onClick={() => void lookupProgram()}
							>
								{t('Trainer programs.Retry')}
							</button>
						)}
						{loadError && (
							<Link passHref href={programsUrl} className="editor-back">
								{t('Trainer program form.Back')}
							</Link>
						)}
					</div>
				) : (
					<form id="trainer-program-form" onSubmit={submitHandler} noValidate aria-busy={busy || reservationLoading}>
						<fieldset className="editor-columns" disabled={creating || updating || refreshing}>
							<legend className="editor-sr-only">
								{t(`Trainer program form.${editing ? 'Edit Program' : 'Create Program'}`)}
							</legend>
							<div className="editor-main-column">
								<section className="editor-section editor-basics" aria-labelledby="editor-basics-title">
									<div className="editor-section-heading">
										<h2 id="editor-basics-title">
											<span className="editor-desktop-copy">{t('Trainer program form.Basics')}</span>
											<span className="editor-mobile-copy">{t('Trainer program form.Mobile basics')}</span>
										</h2>
										<p>{t('Trainer program form.Basics intro')}</p>
									</div>
									{editing && (!policyReady || editConstraints?.values.hasProtected) && (
										<p
											id="editor-reservation-note"
											className={reservationError ? 'editor-error' : 'editor-note'}
											role={reservationError ? 'alert' : 'status'}
										>
											{t(
												`Trainer program form.${
													reservationError
														? 'Reservations error'
														: policyReady
														? 'Reservations locked'
														: 'Reservations loading'
												}`,
											)}
											{reservationError && (
												<button type="button" className="editor-back" onClick={() => void readReservations()}>
													{t('Trainer programs.Retry')}
												</button>
											)}
										</p>
									)}
									<div className="editor-field">
										<label htmlFor="program-name">
											{t('Trainer program form.Name')} <span>*</span>
										</label>
										<input
											id="program-name"
											name="programName"
											value={insertProgramData.programName}
											maxLength={100}
											required
											placeholder={t('Trainer program form.Name placeholder')}
											onChange={(e) => setInsertProgramData({ ...insertProgramData, programName: e.target.value })}
										/>
									</div>
									<fieldset
										className="editor-type-field"
										disabled={sensitiveLocked}
										aria-describedby={sensitiveLocked ? 'editor-reservation-note' : undefined}
									>
										<legend>
											{t('Trainer program form.Type')} <span>*</span>
										</legend>
										<div className="editor-type-options">
											{Object.values(ProgramType).map((value, index) => {
												const Icon = [PersonOutlineRoundedIcon, GroupsOutlinedIcon, VideocamOutlinedIcon][index];
												return (
													<label
														key={value}
														className={`editor-type-option${
															insertProgramData.programType === value ? ' is-selected' : ''
														}`}
													>
														<input
															type="radio"
															name="programType"
															value={value}
															checked={insertProgramData.programType === value}
															onChange={() => typeHandler(value)}
														/>
														<Icon aria-hidden="true" />
														<span>{t('Program discovery card.' + value)}</span>
														<small>{t('Trainer program form.' + value)}</small>
													</label>
												);
											})}
										</div>
									</fieldset>
									<div className="editor-field">
										<label htmlFor="program-category">
											{t('Trainer program form.Category')} <span>*</span>
										</label>
										<div className="editor-category-chips" role="group" aria-label={t('Trainer program form.Category')}>
											{Object.values(ProgramCategory).map((value) => (
												<button
													key={value}
													type="button"
													aria-pressed={insertProgramData.programCategory === value}
													onClick={() => setInsertProgramData({ ...insertProgramData, programCategory: value })}
												>
													{t('Program discovery card.' + value)}
												</button>
											))}
										</div>
										<select
											className="editor-mobile-category"
											id="program-category"
											name="programCategory"
											required
											value={insertProgramData.programCategory}
											onChange={(e) =>
												setInsertProgramData({
													...insertProgramData,
													programCategory: e.target.value as ProgramCategory,
												})
											}
										>
											{Object.values(ProgramCategory).map((value) => (
												<option key={value} value={value}>
													{t('Program discovery card.' + value)}
												</option>
											))}
										</select>
									</div>
								</section>
								<section className="editor-section editor-pricing" aria-labelledby="editor-pricing-title">
									<div className="editor-section-heading">
										<h2 id="editor-pricing-title">
											<span className="editor-desktop-copy">{t('Trainer program form.Pricing')}</span>
											<span className="editor-mobile-copy">{t('Trainer program form.Mobile pricing')}</span>
										</h2>
										<p>{t('Trainer program form.Pricing intro')}</p>
									</div>
									<div className="editor-pricing-fields">
										{(['programPrice', 'programDuration', 'programCapacity'] as const).map((key, index) => (
											<div key={key} className={`editor-field editor-${key}`}>
												<label htmlFor={key}>
													{t('Trainer program form.' + ['Price', 'Duration', 'Capacity'][index])} <span>*</span>
												</label>
												<div className="editor-number-control">
													{key === 'programPrice' && <span aria-hidden="true">₩</span>}
													<input
														id={key}
														name={key}
														type="number"
														min={index === 0 ? 0 : key === 'programCapacity' ? capacityMinimum : 1}
														max={2147483647}
														step={1}
														required
														disabled={
															(key === 'programCapacity' && (privateSession || !policyReady)) ||
															(key === 'programDuration' && sensitiveLocked)
														}
														aria-describedby={
															key === 'programCapacity' && privateSession
																? 'editor-capacity-note'
																: key === 'programDuration' && sensitiveLocked
																? 'editor-reservation-note'
																: key === 'programCapacity' && editConstraints?.values.hasProtected
																? 'editor-group-capacity-note'
																: undefined
														}
														value={Number.isNaN(insertProgramData[key]) ? '' : insertProgramData[key]}
														onChange={(e) =>
															setInsertProgramData({
																...insertProgramData,
																[key]: e.target.value === '' ? NaN : Number(e.target.value),
															})
														}
													/>
													<span>
														{t('Trainer program form.' + ['KRW per session', 'Minutes', 'Participants'][index])}
													</span>
												</div>
											</div>
										))}
									</div>
									{privateSession && (
										<p className="editor-note" id="editor-capacity-note">
											<InfoOutlinedIcon aria-hidden="true" />
											{t('Trainer program form.Capacity note')}
										</p>
									)}
									{editing &&
										policyReady &&
										editConstraints?.values.hasProtected &&
										insertProgramData.programType === ProgramType.GROUP_CLASS && (
											<p className="editor-note" id="editor-group-capacity-note">
												{t('Trainer program form.Capacity minimum', { count: editConstraints.values.maxOccupied })}
											</p>
										)}
								</section>
								<section className="editor-section editor-location" aria-labelledby="editor-location-title">
									<div className="editor-section-heading">
										<h2 id="editor-location-title">
											<span className="editor-desktop-copy">{t('Trainer program form.Location')}</span>
											<span className="editor-mobile-copy">{t('Trainer program form.Mobile location')}</span>
										</h2>
										<p>{t('Trainer program form.Location intro')}</p>
									</div>
									<div className="editor-location-fields">
										<div className="editor-field">
											<label htmlFor="program-location">
												{t('Trainer program form.Region')} <span>*</span>
											</label>
											<select
												id="program-location"
												name="programLocation"
												value={insertProgramData.programLocation}
												disabled={online || sensitiveLocked}
												aria-describedby={sensitiveLocked ? 'editor-reservation-note' : undefined}
												onChange={(e) =>
													setInsertProgramData({
														...insertProgramData,
														programLocation: e.target.value as ProgramLocation,
													})
												}
											>
												{Object.values(ProgramLocation)
													.filter((location) => online || location !== ProgramLocation.ONLINE)
													.map((value) => (
														<option key={value} value={value}>
															{t(value)}
														</option>
													))}
											</select>
										</div>
										{!online && (
											<div className="editor-field">
												<label htmlFor="program-address">
													{t('Trainer program form.Address')} <span>*</span>
												</label>
												<input
													id="program-address"
													name="programAddress"
													disabled={sensitiveLocked}
													aria-describedby={sensitiveLocked ? 'editor-reservation-note' : undefined}
													value={insertProgramData.programAddress ?? ''}
													maxLength={100}
													required
													onChange={(e) =>
														setInsertProgramData({ ...insertProgramData, programAddress: e.target.value })
													}
												/>
											</div>
										)}
									</div>
									{online && <p className="editor-note">{t('Trainer program form.Online note')}</p>}
								</section>
								{!compactViewport && descriptionSection}
							</div>
							<aside className="editor-aside-column">
								<section className="editor-section editor-photos" aria-labelledby="editor-photos-title">
									<div className="editor-section-heading">
										<div className="editor-photos-heading">
											<h2 id="editor-photos-title">
												<span className="editor-desktop-copy">{t('Trainer program form.Photos')}</span>
												<span className="editor-mobile-copy">{t('Trainer program form.Mobile photos')}</span>
											</h2>
											<span className="editor-photo-count">
												{t('Trainer program form.Photo count', { count: insertProgramData.programImages.length })}
											</span>
										</div>
										<p>{t('Trainer program form.Photos intro')}</p>
									</div>
									<div className="editor-photo-grid">
										{insertProgramData.programImages.map((image, index) => (
											<div className="editor-photo" key={`${image}:${index}`}>
												<img
													src={REACT_APP_API_URL + '/' + image}
													alt={t('Trainer program form.Image alt', { index: index + 1 })}
													width={80}
													height={80}
												/>
												<div className="editor-photo-caption">
													<span>{t('Trainer program form.Image alt', { index: index + 1 })}</span>
													{index === 0 && <small>{t('Trainer program form.Primary')}</small>}
												</div>
												<button
													type="button"
													className="editor-remove-photo"
													disabled={busy || createHeld}
													aria-label={t('Trainer program form.Remove image', { index: index + 1 })}
													onClick={() =>
														setInsertProgramData(previous => ({
															...previous,
															programImages: previous.programImages.filter(
																(_, position) => position !== index,
															),
														}))
													}
												>
													<DeleteOutlineRoundedIcon aria-hidden="true" />
												</button>
											</div>
										))}
										<button
											type="button"
											className="editor-add-photo"
											disabled={busy || createHeld || insertProgramData.programImages.length >= 5}
											onClick={() => inputRef.current?.click()}
										>
											<AddPhotoAlternateOutlinedIcon aria-hidden="true" />
											<span>
												{t(
													`Trainer program form.${
														uploading
															? 'Uploading'
															: insertProgramData.programImages.length >= 5
															? 'Image maximum'
															: 'Add photos'
													}`,
												)}
											</span>
											<small>JPEG / PNG / WebP</small>
										</button>
									</div>
									<input
										ref={inputRef}
										className="editor-sr-only"
										type="file"
										accept={IMAGE_UPLOAD_ACCEPT}
										multiple
										disabled={busy || createHeld}
										onChange={uploadImages}
										aria-label={t('Trainer program form.Add photos')}
										tabIndex={-1}
									/>
									{uploading && <p role="status">{t('Trainer program form.Uploading')}</p>}
									<p className="editor-note">
										<InfoOutlinedIcon aria-hidden="true" />
										{t('Trainer program form.Primary note')}
									</p>
								</section>
								{compactViewport && descriptionSection}
								<section className="editor-section editor-confirm" aria-labelledby="editor-confirm-title">
									<div className="editor-section-heading">
										<h2 id="editor-confirm-title">{t('Trainer program form.Confirm')}</h2>
										<p>{t('Trainer program form.Confirm intro')}</p>
									</div>
									{errorMessage && (
										<p className="editor-error" role="alert" tabIndex={-1} ref={errorRef}>
											{errorMessage}
										</p>
									)}
									{editing && writeBlocked && (
										<button type="button" className="editor-back" onClick={() => void refreshProgram()} disabled={busy}>
											{t('Trainer program form.Refresh latest')}
										</button>
									)}
									{!editing && createEnvelope?.status === 'unresolved' && !createTerminal && (
										<button type="button" className="editor-back" onClick={() => void submitCreate()} disabled={busy}>
											{t('Trainer program form.Recover create')}
										</button>
									)}
									{createHeld && (
										<button type="button" className="editor-back" onClick={() => void startNewCreate()} disabled={busy}>
											{t('Trainer program form.New create')}
										</button>
									)}
									<button type="submit" className="editor-save" disabled={saveDisabled}>
										<CheckCircleOutlineRoundedIcon aria-hidden="true" />
										{saveLabel}
									</button>
									<Link passHref href={programsUrl} className="editor-cancel">
										{t('Trainer program form.Cancel')}
									</Link>
								</section>
							</aside>
						</fieldset>
					</form>
				)}
			</div>
			<TrainerWorkspaceNavigation active="Programs" mobile />
		</div>
	);
};

export default AddProgram;
