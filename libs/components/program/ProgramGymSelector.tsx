import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApolloClient } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { findApprovedProgramGym, readApprovedProgramGyms, ProgramGym } from '../../program-gym';

export type { ProgramGym } from '../../program-gym';

const ProgramGymSelector = ({
	gymId,
	currentGym,
	disabled,
	onChange,
}: {
	gymId?: string | null;
	currentGym: ProgramGym | null;
	disabled: boolean;
	onChange: (gym: ProgramGym | null) => void;
}) => {
	const { t } = useTranslation('gyms');
	const client = useApolloClient();
	const [text, setText] = useState('');
	const [page, setPage] = useState(1);
	const [retry, setRetry] = useState(0);
	const [result, setResult] = useState<{ list: ProgramGym[]; total: number }>({ list: [], total: 0 });
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);
	const [approval, setApproval] = useState<{ id: string; gym: ProgramGym | null; failed?: boolean } | null>(null);
	const selected = currentGym?._id === gymId ? currentGym : null;
	const checked = approval?.id === gymId ? approval : null;
	const approved = Boolean(checked?.gym);
	useEffect(() => {
		let current = true;
		setApproval(null);
		if (gymId)
			void findApprovedProgramGym(client, gymId, () => current)
				.then((gym) => {
					if (current) setApproval({ id: gymId, gym });
				})
				.catch(() => {
					if (current) setApproval({ id: gymId, gym: null, failed: true });
				});
		return () => {
			current = false;
		};
	}, [client, gymId, retry]);
	useEffect(() => {
		let current = true;
		setLoading(true);
		setFailed(false);
		setResult({ list: [], total: 0 });
		const timer = setTimeout(async () => {
			try {
				const gyms = await readApprovedProgramGyms(client, {
					page,
					limit: 20,
					search: text.trim() ? { text: text.trim() } : {},
				});
				if (current) setResult(gyms);
			} catch {
				if (current) setFailed(true);
			} finally {
				if (current) setLoading(false);
			}
		}, 250);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	}, [client, text, page, retry]);
	useEffect(() => {
		const refresh = () => setRetry((value) => value + 1);
		window.addEventListener('focus', refresh);
		return () => window.removeEventListener('focus', refresh);
	}, []);
	const identity = (gym: ProgramGym) => `${gym.gymName} · ${t('locations.' + gym.gymLocation)} · ${gym.gymAddress}`;
	const venue = checked?.gym ?? selected;
	return (
		<div className="editor-gym-venue">
			<div className="editor-field">
				<label htmlFor="program-gym-search">{t('venue.search')}</label>
				<input
					id="program-gym-search"
					type="search"
					maxLength={100}
					value={text}
					disabled={disabled}
					onChange={(event) => {
						setText(event.target.value);
						setPage(1);
					}}
				/>
			</div>
			<div className="editor-field">
				<label htmlFor="program-gym">{t('venue.label')}</label>
				<select
					id="program-gym"
					value={gymId ?? ''}
					disabled={disabled}
					aria-describedby="program-gym-note program-gym-state"
					onChange={(event) => {
						if (!event.target.value) onChange(null);
						else if (!loading && !failed) {
							const gym = result.list.find((item) => item._id === event.target.value);
							if (gym) onChange(gym);
						}
					}}
				>
					<option value="">{t('venue.none')}</option>
					{gymId && (
						<option value={gymId} disabled={!approved}>
							{venue?.gymName ?? t('venue.unavailable')}
						</option>
					)}
					{!loading &&
						!failed &&
						result.list
							.filter((gym) => gym._id !== gymId)
							.map((gym) => (
								<option key={gym._id} value={gym._id}>
									{identity(gym)}
								</option>
							))}
				</select>
			</div>
			{gymId && (
				<div className="editor-gym-current" aria-live="polite">
					<strong>
						{t('venue.current')}: {venue?.gymName ?? t('venue.unavailable')}
					</strong>
					{venue && (
						<span>
							{t('locations.' + venue.gymLocation)} · {venue.gymAddress}
						</span>
					)}
					{!checked ? (
						<span role="status">{t('venue.checking')}</span>
					) : checked.failed ? (
						<span>{t('venue.checkError')}</span>
					) : (
						!approved && <span>{t('venue.accessInactive')}</span>
					)}
				</div>
			)}
			<p id="program-gym-note" className="editor-note">
				{gymId
					? t(approved ? 'venue.derived' : checked && !checked.failed ? 'venue.historical' : 'venue.checkNote')
					: t('venue.optional')}
			</p>
			<div id="program-gym-state" className="editor-gym-results" aria-live="polite" aria-busy={loading}>
				{loading ? (
					<p role="status">{t('venue.loading')}</p>
				) : failed ? (
					<p role="alert">{t('venue.loadError')}</p>
				) : (
					<>
						<p>
							{t(result.total ? 'venue.page' : text.trim() ? 'venue.empty' : 'venue.noApproved', {
								page,
								pages: Math.max(1, Math.ceil(result.total / 20)),
							})}
						</p>
						{result.total > 20 && (
							<div className="editor-gym-pagination">
								<button type="button" disabled={disabled || page <= 1} onClick={() => setPage(page - 1)}>
									{t('pagination.previous')}
								</button>
								<button
									type="button"
									disabled={disabled || page * 20 >= result.total}
									onClick={() => setPage(page + 1)}
								>
									{t('pagination.next')}
								</button>
							</div>
						)}
					</>
				)}
				<div className="editor-gym-actions">
					{(failed || checked?.failed) && (
						<button
							type="button"
							className="editor-back"
							disabled={disabled}
							onClick={() => setRetry((value) => value + 1)}
						>
							{t('retry')}
						</button>
					)}
					<Link href="/mypage?category=gymAccess" className="editor-back">
						{t('venue.manage')}
					</Link>
				</div>
			</div>
		</div>
	);
};

export default ProgramGymSelector;
