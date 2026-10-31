import React, { useEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { GET_GYMS } from '../../../apollo/user/query';
import { readGymsInquiry } from '../../gym';
import { Program } from '../../types/program/program';

export type ProgramGym = NonNullable<Program['gymData']>;

const ProgramGymSelector = ({ gymId, currentGym, disabled, onChange }: {
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
	const selected = currentGym?._id === gymId ? currentGym : null;
	useEffect(() => {
		let current = true;
		setLoading(true);
		setFailed(false);
		setResult({ list: [], total: 0 });
		const timer = setTimeout(async () => {
			try {
				const { data } = await client.query({
					query: GET_GYMS,
					variables: { input: readGymsInquiry({ page, limit: 20, search: { text } }) },
					fetchPolicy: 'no-cache',
					context: { queryDeduplication: false, handleErrorLocally: true },
				});
				const gyms = data?.getGyms;
				if (!Array.isArray(gyms?.list) || !Number.isSafeInteger(gyms.metaCounter?.[0]?.total)) throw new Error();
				if (current) setResult({ list: gyms.list, total: gyms.metaCounter[0].total });
			} catch {
				if (current) setFailed(true);
			} finally {
				if (current) setLoading(false);
			}
		}, 250);
		return () => { current = false; clearTimeout(timer); };
	}, [client, text, page, retry]);
	return (
		<div className="editor-gym-venue">
			<div className="editor-field">
				<label htmlFor="program-gym-search">{t('venue.search')}</label>
				<input id="program-gym-search" type="search" maxLength={100} value={text} disabled={disabled}
					onChange={(event) => { setText(event.target.value); setPage(1); }} />
			</div>
			<div className="editor-field">
				<label htmlFor="program-gym">{t('venue.label')}</label>
				<select id="program-gym" value={gymId ?? ''} disabled={disabled} aria-describedby="program-gym-note"
					onChange={(event) => {
						if (!event.target.value) onChange(null);
						else {
							const gym = result.list.find((item) => item._id === event.target.value);
							if (gym) onChange(gym);
						}
					}}>
					<option value="">{t('venue.none')}</option>
					{gymId && <option value={gymId} disabled={!selected}>{selected?.gymName ?? t('venue.unavailable')}</option>}
					{!loading && !failed && result.list.filter((gym) => gym._id !== gymId).map((gym) => (
						<option key={gym._id} value={gym._id}>{gym.gymName} · {t('locations.' + gym.gymLocation)}</option>
					))}
				</select>
			</div>
			<p id="program-gym-note" className="editor-note">
				{gymId ? t(selected ? 'venue.derived' : 'venue.historical') : t('venue.optional')}
			</p>
			<div className="editor-gym-results" aria-live="polite">
				{loading ? <p role="status">{t('catalog.loading')}</p> : failed ? <p role="alert">
					{t('venue.loadError')} <button type="button" className="editor-back" disabled={disabled} onClick={() => setRetry((value) => value + 1)}>{t('retry')}</button>
				</p> : <>
					<p>{t(result.total ? 'venue.page' : 'venue.empty', { page, pages: Math.max(1, Math.ceil(result.total / 20)) })}</p>
					{result.total > 20 && <div className="editor-gym-pagination">
						<button type="button" disabled={disabled || page <= 1} onClick={() => setPage(page - 1)}>{t('pagination.previous')}</button>
						<button type="button" disabled={disabled || page * 20 >= result.total} onClick={() => setPage(page + 1)}>{t('pagination.next')}</button>
					</div>}
				</>}
			</div>
		</div>
	);
};

export default ProgramGymSelector;
