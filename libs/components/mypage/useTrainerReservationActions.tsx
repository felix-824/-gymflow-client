import React, { useEffect, useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client';
import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	useMediaQuery,
} from '@mui/material';
import { useTranslation } from 'next-i18next';
import { GET_TRAINER_RESERVATIONS } from '../../../apollo/user/query';
import { UPDATE_TRAINER_RESERVATION } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { cancellationErrorKind } from '../../my-bookings';
import { findTrainerReservation, trainerReservationActions } from '../../trainer-reservations';
import { ReservationStatus } from '../../enums/reservation.enum';
import {
	TrainerReservation,
	TrainerReservations as Reservations,
	TrainerReservationUpdate,
} from '../../types/reservation/trainer-reservation';

interface ReservationQuery {
	getTrainerReservations: Reservations;
}
export interface ReservationAction {
	reservation: TrainerReservation;
	status: ReservationStatus;
}
export const trainerReservationActionLabels: Partial<Record<ReservationStatus, string>> = {
	CONFIRMED: 'Confirm',
	CANCELLED: 'Cancel',
	COMPLETED: 'Complete',
	NO_SHOW: 'No Show',
};
const actionLabels = trainerReservationActionLabels;

export function useTrainerReservationActions(
	memberId: string,
	refresh: () => Promise<unknown>,
	readOnly: { loading: boolean; error?: unknown; handleErrorLocally?: boolean },
) {
	const client = useApolloClient();
	const [selected, setSelected] = useState<ReservationAction | null>(null);
	const [processing, setProcessing] = useState<ReservationAction | null>(null);
	const [uncertain, setUncertain] = useState<ReservationAction | null>(null);
	const [reconciling, setReconciling] = useState(false);
	const [feedback, setFeedback] = useState('');
	const [now, setNow] = useState(Date.now);
	const writeLock = useRef(false);
	const dialogLock = useRef(false);
	const mounted = useRef(true);
	const activeAccount = () =>
		mounted.current &&
		authReadyVar() &&
		!authErrorVar() &&
		userVar()._id === memberId &&
		userVar().memberType === 'TRAINER' &&
		userVar().memberStatus === 'ACTIVE';
	const [updateReservation] = useMutation<
		{ updateTrainerReservation: TrainerReservation },
		{ input: TrainerReservationUpdate }
	>(UPDATE_TRAINER_RESERVATION, { context: { handleErrorLocally: readOnly.handleErrorLocally ?? false } });
	const busy = Boolean(processing || selected || reconciling || uncertain);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		const update = () => {
			setNow(Date.now());
			if (!writeLock.current)
				void refresh().catch(() => {
					if (mounted.current) setFeedback('Refresh error');
				});
		};
		window.addEventListener('focus', update);
		const interval = window.setInterval(update, 60000);
		return () => {
			window.removeEventListener('focus', update);
			window.clearInterval(interval);
		};
	}, [refresh]);
	const reconcile = async (action: ReservationAction) => {
		if (!activeAccount()) return;
		setReconciling(true);
		try {
			const current = await findTrainerReservation(action.reservation._id, async (readPage) => {
				if (!activeAccount()) throw new Error('Account changed');
				const response = await client.query<ReservationQuery>({
					query: GET_TRAINER_RESERVATIONS,
					variables: { input: { page: readPage, limit: 100, search: {} } },
					fetchPolicy: 'no-cache',
					context: { handleErrorLocally: readOnly.handleErrorLocally ?? false },
				});
				return response.data.getTrainerReservations;
			});
			if (!activeAccount()) return;
			if (current) {
				setUncertain(null);
				setFeedback(current.reservationStatus === action.status ? 'Success' : 'Reconciled');
			}
			await refresh();
		} catch {
			if (activeAccount()) setFeedback('Unknown');
		} finally {
			if (activeAccount()) setReconciling(false);
		}
	};
	const submit = async (action: ReservationAction) => {
		if (writeLock.current || uncertain || !activeAccount()) return;
		dialogLock.current = false;
		if (!trainerReservationActions(action.reservation).includes(action.status)) {
			setSelected(null);
			setNow(Date.now());
			setFeedback('Stale');
			await refresh().catch(() => {
				if (activeAccount()) setFeedback('Refresh error');
			});
			return;
		}
		writeLock.current = true;
		setProcessing(action);
		setFeedback('');
		let succeeded = false;
		try {
			const response = await updateReservation({
				variables: { input: { _id: action.reservation._id, reservationStatus: action.status } },
			});
			if (!activeAccount()) return;
			const receipt = response.data?.updateTrainerReservation;
			if (receipt?._id !== action.reservation._id || receipt.reservationStatus !== action.status) {
				setUncertain(action);
				setFeedback('Unknown');
				await reconcile(action);
				return;
			}
			succeeded = true;
			setFeedback('Success');
			await refresh();
		} catch (error) {
			if (!activeAccount()) return;
			if (succeeded) setFeedback('Success refresh error');
			else if (cancellationErrorKind(error) === 'unknown') {
				setUncertain(action);
				setFeedback('Unknown');
				await reconcile(action);
			} else {
				setFeedback(cancellationErrorKind(error) === 'stale' ? 'Stale' : 'Rejected');
				await refresh().catch(() => {
					if (activeAccount()) setFeedback('Refresh error');
				});
			}
		} finally {
			if (activeAccount()) {
				writeLock.current = false;
				setProcessing(null);
				setSelected(null);
				setNow(Date.now());
			}
		}
	};
	const onAction = (reservation: TrainerReservation, target: ReservationStatus) => {
		if (writeLock.current || dialogLock.current || busy || readOnly.loading || readOnly.error || !activeAccount())
			return;
		const action = { reservation, status: target };
		if (target === ReservationStatus.CANCELLED || target === ReservationStatus.NO_SHOW) {
			dialogLock.current = true;
			setSelected(action);
		} else void submit(action);
	};
	const closeDialog = () => {
		if (!writeLock.current) {
			dialogLock.current = false;
			setSelected(null);
		}
	};
	const retry = async () => {
		if (writeLock.current || reconciling) return;
		if (uncertain) await reconcile(uncertain);
		else {
			setFeedback('');
			await refresh().catch(() => {
				if (activeAccount()) setFeedback('Refresh error');
			});
		}
	};
	return {
		selected,
		processing,
		uncertain,
		reconciling,
		feedback,
		now,
		writeLock,
		dialogLock,
		busy,
		onAction,
		closeDialog,
		submit,
		retry,
	};
}
export type TrainerReservationActions = ReturnType<typeof useTrainerReservationActions>;
export function TrainerReservationActionDialog({ actions }: { actions: TrainerReservationActions }) {
	const { t } = useTranslation('common');
	const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const { selected, processing, closeDialog, submit } = actions;
	return (
		<Dialog
			open={selected !== null}
			onClose={closeDialog}
			transitionDuration={reducedMotion ? 0 : undefined}
			maxWidth="xs"
			fullWidth
			aria-labelledby="trainer-reservation-action-title"
			aria-describedby="trainer-reservation-action-description"
		>
			<DialogTitle id="trainer-reservation-action-title">
				{t(
					selected?.status === ReservationStatus.NO_SHOW
						? 'Trainer reservations.No show title'
						: 'MyBookings.Confirm title',
				)}
			</DialogTitle>
			<DialogContent>
				<DialogContentText id="trainer-reservation-action-description">
					{t('Trainer reservations.Confirm description', {
						action: t(`Trainer reservations.${actionLabels[selected?.status ?? ReservationStatus.CANCELLED]}`),
						client:
							selected?.reservation.memberData?.memberFullName?.trim() ||
							selected?.reservation.memberData?.memberNick ||
							t('Trainer reservations.Missing client'),
						date: selected?.reservation.reservationDate,
						time: selected?.reservation.startTime,
					})}
				</DialogContentText>
			</DialogContent>
			<DialogActions>
				<Button onClick={closeDialog} disabled={Boolean(processing)} autoFocus>
					{t('Trainer reservations.Back')}
				</Button>
				<Button variant="contained" onClick={() => selected && void submit(selected)} disabled={Boolean(processing)}>
					{t(
						processing
							? 'Trainer reservations.Processing'
							: `Trainer reservations.${actionLabels[selected?.status ?? ReservationStatus.CANCELLED]}`,
					)}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
export function TrainerReservationActionFeedback({ actions }: { actions: TrainerReservationActions }) {
	const { t } = useTranslation('common');
	const { feedback, processing, reconciling, uncertain, retry } = actions;
	return (
		<>
			{' '}
			{feedback && (
				<div className="trainer-reservations-feedback" role="status">
					<p>{t(`Trainer reservations.${feedback}`)}</p>
					<Button disabled={Boolean(processing || reconciling)} onClick={() => void retry()}>
						{t(uncertain ? 'Trainer reservations.Check status' : 'MyBookings.Retry')}
					</Button>
				</div>
			)}
		</>
	);
}
