import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Pagination,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useApolloClient, useMutation, useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { GET_TRAINER_PROGRAMS } from '../../../apollo/user/query';
import { UPDATE_PROGRAM } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getAuthSessionId } from '../../auth';
import { REACT_APP_API_URL } from '../../config';
import { ProgramStatus } from '../../enums/program.enum';
import { readTrainerProgramsInquiry } from '../../program';
import { trainerReservationsAccess } from '../../trainer-reservations';
import { TrainerProgramsInquiry } from '../../types/program/program.input';
import { Program, Programs } from '../../types/program/program';
import { formatterStr } from '../../utils';
import { TrainerWorkspaceHeader, TrainerWorkspaceNavigation } from './TrainerWorkspaceNavigation';

const createUrl = '/mypage?category=addProgram';

function ManagementProgramImage({ program }: { program: Program }) {
	const [failed, setFailed] = useState('');
	const image = program.programImages?.find((path) => path?.trim());
	const src = image ? (/^https?:\/\//i.test(image) ? image : `${REACT_APP_API_URL}/${image.replace(/^\//, '')}`) : '';
	return (
		<div className="trainer-program-image">
			{src && src !== failed ? (
				<img src={src} alt="" loading="lazy" width={176} height={144} onError={() => setFailed(src)} />
			) : (
				<span className="trainer-program-image-fallback" aria-hidden="true">
					<FitnessCenterOutlinedIcon />
				</span>
			)}
		</div>
	);
}

function ProgramsContent({ memberId, sessionIdentity }: { memberId: string; sessionIdentity: string }) {
	const { t } = useTranslation('common');
	const router = useRouter();
	const client = useApolloClient();
	const [updateProgram] = useMutation(UPDATE_PROGRAM);
	const input = useMemo(() => {
		const parsed = readTrainerProgramsInquiry(router.query.input);
		return { ...parsed, search: { programStatus: parsed.search.programStatus ?? ProgramStatus.ACTIVE } };
	}, [router.query.input]);
	const inputKey = JSON.stringify(input);
	const [result, setResult] = useState<{ data: Programs; key: string } | null>(null);
	const [loading, setLoading] = useState(true);
	const [readError, setReadError] = useState(false);
	const [feedback, setFeedback] = useState('');
	const [confirmation, setConfirmation] = useState<{ program: Program; status: ProgramStatus } | null>(null);
	const [pending, setPending] = useState('');
	const mounted = useRef(false);
	const request = useRef(0);
	const currentInput = useRef<TrainerProgramsInquiry>(input);
	const routeInput = useRef('');
	const reading = useRef(false);
	const synchronized = useRef(false);
	const actionLock = useRef(false);
	const submitting = useRef(false);
	const activeAccount = useCallback(
		() =>
			mounted.current &&
			authReadyVar() &&
			!authErrorVar() &&
			userVar()._id === memberId &&
			userVar().memberType === 'TRAINER' &&
			userVar().memberStatus === 'ACTIVE' &&
			getAuthSessionId() === sessionIdentity,
		[memberId, sessionIdentity],
	);

	/** APOLLO REQUESTS **/
	const refetchPrograms = useCallback(
		async (requested = currentInput.current) => {
			if (!activeAccount()) return false;
			const sequence = ++request.current;
			reading.current = true;
			synchronized.current = false;
			setLoading(true);
			setReadError(false);
			try {
				let nextInput = requested;
				while (activeAccount() && sequence === request.current) {
					const response = await client.query<{ getTrainerPrograms: Programs }>({
						query: GET_TRAINER_PROGRAMS,
						variables: { input: nextInput },
						fetchPolicy: 'no-cache',
						context: { queryDeduplication: false, handleErrorLocally: true },
					});
					if (!activeAccount() || sequence !== request.current) return false;
					const next = response.data?.getTrainerPrograms;
					if (!next || !Array.isArray(next.list)) throw new Error('Missing programs result');
					const lastPage = Math.max(1, Math.ceil((next.metaCounter?.[0]?.total ?? 0) / nextInput.limit));
					if (nextInput.page > lastPage) {
						// Decrease strictly; do not publish an empty out-of-range page.
						nextInput = { ...nextInput, page: lastPage };
						continue;
					}
					const nextKey = JSON.stringify(nextInput);
					if (nextKey !== JSON.stringify(requested)) {
						// Avoid a second request when the corrected URL reaches the route effect.
						routeInput.current = nextKey;
						const navigated = await router.replace(
							{ pathname: '/mypage', query: { category: 'myPrograms', input: nextKey } },
							undefined,
							{ shallow: true, scroll: false },
						);
						if (!navigated) throw new Error('Page correction cancelled');
						if (!activeAccount() || sequence !== request.current) return false;
					}
					currentInput.current = nextInput;
					setResult({ data: next, key: nextKey });
					synchronized.current = true;
					return true;
				}
			} catch {
				if (activeAccount() && sequence === request.current) setReadError(true);
			} finally {
				if (activeAccount() && sequence === request.current) {
					reading.current = false;
					setLoading(false);
				}
			}
			return false;
		},
		[activeAccount, client, router],
	);

	/** LIFECYCLES **/
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			request.current += 1;
			routeInput.current = '';
		};
	}, []);
	useEffect(() => {
		if (routeInput.current === inputKey) return;
		routeInput.current = inputKey;
		currentInput.current = JSON.parse(inputKey);
		setResult(null);
		setFeedback('');
		setConfirmation(null);
		// URL changes invalidate any old confirmation before it can submit.
		if (!submitting.current) actionLock.current = false;
		void refetchPrograms(currentInput.current);
	}, [inputKey, refetchPrograms]);

	/** HANDLERS **/
	const navigate = async (next: TrainerProgramsInquiry) => {
		if (!activeAccount() || reading.current || actionLock.current || JSON.stringify(next) === inputKey) return;
		reading.current = true;
		synchronized.current = false;
		setLoading(true);
		try {
			const navigated = await router.push(
				{ pathname: '/mypage', query: { category: 'myPrograms', input: JSON.stringify(next) } },
				undefined,
				{ shallow: true, scroll: false },
			);
			if (!navigated) throw new Error('Navigation cancelled');
		} catch {
			if (activeAccount()) {
				reading.current = false;
				setLoading(false);
				setReadError(true);
			}
		}
	};
	const ask = (program: Program, status: ProgramStatus) => {
		if (!activeAccount() || !synchronized.current || reading.current || actionLock.current || result?.key !== inputKey)
			return;
		actionLock.current = true;
		setConfirmation({ program, status });
	};
	const cancel = () => {
		if (submitting.current) return;
		actionLock.current = false;
		setConfirmation(null);
	};
	const confirm = async () => {
		if (
			!activeAccount() ||
			!confirmation ||
			!actionLock.current ||
			submitting.current ||
			!synchronized.current ||
			reading.current
		)
			return;
		submitting.current = true;
		setPending(confirmation.program._id);
		setFeedback('');
		let outcome = 'Saved';
		try {
			await updateProgram({
				variables: { input: { _id: confirmation.program._id, programStatus: confirmation.status } },
				fetchPolicy: 'no-cache',
				context: { handleErrorLocally: true },
			});
		} catch (error: any) {
			outcome = error?.networkError || !error?.graphQLErrors?.length ? 'Uncertain' : 'Mutation error';
		}
		if (!activeAccount()) return;
		// Read after every attempt. Never repeat an uncertain write.
		const refreshed = await refetchPrograms();
		if (!activeAccount()) return;
		setFeedback(outcome === 'Saved' && !refreshed ? 'Sync error' : outcome);
		submitting.current = false;
		actionLock.current = false;
		setPending('');
		setConfirmation(null);
	};
	const retry = async () => {
		if (reading.current || actionLock.current || !activeAccount()) return;
		if (await refetchPrograms()) setFeedback('');
	};
	const visible = result?.key === inputKey ? result.data : null;
	const total = visible?.metaCounter?.[0]?.total ?? 0;
	const busy = loading || Boolean(pending) || Boolean(confirmation);
	const actionDisabled = busy || readError || !visible;
	const action =
		confirmation?.status === ProgramStatus.DELETE
			? 'Delete'
			: confirmation?.status === ProgramStatus.PAUSED
			? 'Pause'
			: 'Resume';
	return (
		<>
			<TrainerWorkspaceHeader active="Programs" />
			<div id="trainer-programs-page">
				<header className="trainer-programs-heading">
					<div>
						<p className="trainer-programs-eyebrow">{t('Trainer schedule.Workspace')}</p>
						<h1>{t('Trainer programs.Title')}</h1>
						<p>{t('Trainer programs.Subtitle')}</p>
					</div>
					<Link passHref href={createUrl} className="trainer-programs-create">
						<AddRoundedIcon aria-hidden="true" />
						{t('Trainer programs.Create')}
					</Link>
				</header>
				<div className="trainer-programs-toolbar">
					<nav className="trainer-programs-tabs" aria-label={t('Trainer programs.Status navigation')}>
						{[ProgramStatus.ACTIVE, ProgramStatus.PAUSED].map((status) => (
							<button
								key={status}
								type="button"
								aria-pressed={input.search.programStatus === status}
								disabled={busy}
								onClick={() =>
									input.search.programStatus !== status &&
									void navigate({ ...input, page: 1, search: { programStatus: status } })
								}
							>
								{t(`Trainer programs.${status}`)}
							</button>
						))}
					</nav>
					<p className="trainer-programs-count" aria-live="polite">
						{visible && t('Trainer programs.Count', { count: total })}
					</p>
				</div>
				<section className="trainer-programs-collection" aria-label={t('Trainer programs.Title')} aria-busy={busy}>
					{feedback && (
						<p className="trainer-programs-feedback" role="status">
							{t(`Trainer programs.${feedback}`)}
						</p>
					)}
					{loading && (
						<p className="trainer-programs-loading" role="status">
							{t(visible ? 'Trainer programs.Refreshing' : 'Trainer programs.Loading')}
						</p>
					)}
					{readError && (
						<div className="trainer-programs-state is-error" role="alert">
							<p>{t(visible ? 'Trainer programs.Refresh error' : 'Trainer programs.Read error')}</p>
							<Button disabled={busy} onClick={() => void retry()}>
								{t('Trainer programs.Retry')}
							</Button>
						</div>
					)}
					{visible && visible.list.length > 0 && (
						<div className="trainer-programs-list">
							{visible.list.map((program) => (
								<article
									className="trainer-program-row"
									key={program._id}
									data-program-id={program._id}
									aria-busy={pending === program._id}
								>
									<ManagementProgramImage program={program} />
									<div className="trainer-program-info">
										<div className="trainer-program-labels">
											<span className={`trainer-program-status is-${program.programStatus.toLowerCase()}`}>
												{t(`Trainer programs.${program.programStatus}`)}
											</span>
											<span>{t(`Program discovery card.${program.programType}`)}</span>
											<span>{t(program.programLocation)}</span>
										</div>
										<h2>{program.programName}</h2>
										<div className="trainer-program-metadata">
											<span>{t('Trainer programs.Duration', { duration: program.programDuration })}</span>
											<span>{t('Trainer programs.Capacity', { capacity: program.programCapacity })}</span>
											<span>{t(`Program discovery card.${program.programCategory}`)}</span>
										</div>
										<p className="trainer-program-price">
											<strong>₩{formatterStr(program.programPrice)}</strong>
											<span>{t('Trainer programs.Per session')}</span>
										</p>
									</div>
									<div className="trainer-program-actions">
										<button
											type="button"
											disabled={actionDisabled}
											aria-label={t('Trainer programs.Edit label', { name: program.programName })}
											onClick={() => {
												if (!activeAccount() || reading.current || actionLock.current || !synchronized.current) return;
												void router.push({
													pathname: '/mypage',
													query: {
														category: 'addProgram',
														programId: program._id,
														input: JSON.stringify(currentInput.current),
													},
												});
											}}
										>
											{t('Trainer programs.Edit')}
										</button>
										<button
											type="button"
											disabled={actionDisabled}
											className={program.programStatus === ProgramStatus.PAUSED ? 'is-resume' : ''}
											aria-label={t(
												`Trainer programs.${program.programStatus === ProgramStatus.ACTIVE ? 'Pause' : 'Resume'} label`,
												{ name: program.programName },
											)}
											onClick={() =>
												ask(
													program,
													program.programStatus === ProgramStatus.ACTIVE ? ProgramStatus.PAUSED : ProgramStatus.ACTIVE,
												)
											}
										>
											{t(`Trainer programs.${program.programStatus === ProgramStatus.ACTIVE ? 'Pause' : 'Resume'}`)}
										</button>
										<button
											type="button"
											disabled={actionDisabled}
											className="trainer-program-delete"
											aria-label={t('Trainer programs.Delete label', { name: program.programName })}
											onClick={() => ask(program, ProgramStatus.DELETE)}
										>
											<DeleteOutlineRoundedIcon aria-hidden="true" />
											<span>{t('Trainer programs.Delete')}</span>
										</button>
									</div>
								</article>
							))}
						</div>
					)}
					{!loading && !readError && visible && visible.list.length === 0 && (
						<div className="trainer-programs-state is-empty">
							<FitnessCenterOutlinedIcon aria-hidden="true" />
							<h2>
								{t(
									input.search.programStatus === ProgramStatus.PAUSED
										? 'Trainer programs.Paused empty'
										: 'Trainer programs.Empty title',
								)}
							</h2>
							<p>
								{t(
									input.search.programStatus === ProgramStatus.PAUSED
										? 'Trainer programs.Paused description'
										: 'Trainer programs.Empty description',
								)}
							</p>
							{input.search.programStatus === ProgramStatus.ACTIVE && (
								<Link passHref href={createUrl} className="trainer-programs-create">
									<AddRoundedIcon aria-hidden="true" />
									{t('Trainer programs.Create')}
								</Link>
							)}
						</div>
					)}
					{visible && total > input.limit && (
						<Pagination
							className="trainer-programs-pagination"
							page={input.page}
							count={Math.ceil(total / input.limit)}
							disabled={busy || readError}
							onChange={(_, page) => void navigate({ ...input, page })}
							aria-label={t('Trainer programs.Pagination')}
							getItemAriaLabel={(type, page) =>
								t(type === 'page' ? 'Trainer programs.Page' : `Trainer programs.${type}`, { page })
							}
						/>
					)}
				</section>
			</div>
			<TrainerWorkspaceNavigation active="Programs" mobile />
			<Dialog
				open={Boolean(confirmation)}
				onClose={cancel}
				aria-labelledby="trainer-program-confirm-title"
				aria-describedby="trainer-program-confirm-description"
				PaperProps={{ className: 'trainer-program-confirmation' }}
			>
				<DialogTitle id="trainer-program-confirm-title">{t(`Trainer programs.${action} title`)}</DialogTitle>
				<DialogContent>
					<DialogContentText id="trainer-program-confirm-description">
						{t(`Trainer programs.${action} description`)}
					</DialogContentText>
					<p className="trainer-program-confirm-name">{confirmation?.program.programName}</p>
				</DialogContent>
				<DialogActions>
					<Button disabled={Boolean(pending)} onClick={cancel}>
						{t('Trainer programs.Cancel')}
					</Button>
					<Button
						disabled={Boolean(pending)}
						className={action === 'Delete' ? 'is-destructive' : ''}
						onClick={() => void confirm()}
					>
						{t(pending ? 'Trainer programs.Saving' : `Trainer programs.Confirm ${action}`)}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}

const MyPrograms = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const access = trainerReservationsAccess(authReady && router.isReady, authError, user);
	return (
		<div className="trainer-programs-workspace">
			{access === 'ready' ? (
				<ProgramsContent key={`${user._id}:${getAuthSessionId()}`} memberId={user._id} sessionIdentity={getAuthSessionId()} />
			) : (
				<div
					id="trainer-programs-page"
					className="trainer-programs-state"
					role={access === 'initializing' ? 'status' : 'alert'}
				>
					<p>
						{t(
							access === 'initializing'
								? 'Trainer programs.Auth loading'
								: access === 'error'
								? 'Trainer programs.Auth error'
								: 'Trainer programs.Trainer only',
						)}
					</p>
					{access !== 'initializing' && (
						<Link passHref href="/mypage">
							{t('Trainer schedule.Back to my page')}
						</Link>
					)}
				</div>
			)}
		</div>
	);
};

export default MyPrograms;
