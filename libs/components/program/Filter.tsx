import React, { useEffect, useState } from 'react';
import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { ProgramCategory, ProgramLocation, ProgramType } from '../../enums/program.enum';
import { ProgramsInquiry } from '../../types/program/program.input';
import { readProgramsInquiry } from '../../program';
import { useTranslation } from 'next-i18next';

interface FilterType {
	searchFilter: ProgramsInquiry;
	setSearchFilter: (input: ProgramsInquiry) => void;
	initialInput: ProgramsInquiry;
	compact?: boolean;
}

const Filter = ({ searchFilter, setSearchFilter, initialInput, compact = false }: FilterType) => {
	const device = useDeviceDetect();
	const { t } = useTranslation('common');
	const [draft, setDraft] = useState<ProgramsInquiry>(searchFilter);
	const [error, setError] = useState('');
	useEffect(() => {
		setDraft(searchFilter);
		setError('');
	}, [searchFilter]);

	/** HANDLERS **/
	const selectHandler = (key: 'locationList' | 'typeList' | 'categoryList', value: string[]) => {
		setDraft({ ...draft, search: { ...draft.search, [key]: value } });
	};
	const searchHandler = () => {
		const range = draft.search.pricesRange;
		if (
			range &&
			(!Number.isInteger(range.start) ||
				!Number.isInteger(range.end) ||
				range.start < 0 ||
				range.end > 2147483647 ||
				range.start > range.end)
		) {
			setError('Enter a valid price range in KRW.');
			return;
		}
		setError('');
		setSearchFilter(readProgramsInquiry({ ...draft, page: 1 }, initialInput));
	};
	const rangeHandler = (key: 'start' | 'end', value: string) => {
		const range = draft.search.pricesRange ?? { start: 0, end: 2147483647 };
		setDraft({
			...draft,
			search: {
				...draft.search,
				pricesRange: { ...range, [key]: value === '' ? (key === 'start' ? 0 : 2147483647) : Number(value) },
			},
		});
	};
	if (device === 'mobile') return <div>PROGRAM FILTER MOBILE</div>;

	return (
		<Stack
			className={compact ? 'search-box gymflow-search' : 'filter-main'}
			spacing={2}
			sx={compact ? { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 } : { padding: 2 }}
		>
			{!compact && <Typography className="title-main">{t('Find Your Program')}</Typography>}
			<TextField
				size="small"
				label={t('Program name')}
				value={draft.search.text ?? ''}
				onChange={(e) => setDraft({ ...draft, search: { ...draft.search, text: e.target.value } })}
				onKeyDown={(e) => {
					if (e.key === 'Enter') searchHandler();
				}}
				inputProps={{ maxLength: 100 }}
			/>
			{(
				[
					['locationList', 'Location', Object.values(ProgramLocation)],
					['typeList', 'Program type', Object.values(ProgramType)],
					['categoryList', 'Category', Object.values(ProgramCategory)],
				] as const
			).map(([key, label, values]) => (
				<TextField
					key={key}
					select
					size="small"
					label={t(label)}
					value={draft.search[key] ?? []}
					SelectProps={{ multiple: true }}
					sx={{ minWidth: 150 }}
					onChange={(e) =>
						selectHandler(key, typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)
					}
				>
					{values.map((value) => (
						<MenuItem key={value} value={value}>
							{t(value)}
						</MenuItem>
					))}
				</TextField>
			))}
			<TextField
				size="small"
				type="number"
				label={t('Min price (KRW/session)')}
				value={draft.search.pricesRange?.start ?? ''}
				onChange={(e) => rangeHandler('start', e.target.value)}
				inputProps={{ min: 0, max: 2147483647, step: 1 }}
				sx={{ maxWidth: compact ? 165 : undefined }}
			/>
			<TextField
				size="small"
				type="number"
				label={t('Max price (KRW/session)')}
				value={draft.search.pricesRange?.end === 2147483647 ? '' : draft.search.pricesRange?.end ?? ''}
				onChange={(e) => rangeHandler('end', e.target.value)}
				inputProps={{ min: 0, max: 2147483647, step: 1 }}
				sx={{ maxWidth: compact ? 165 : undefined }}
			/>
			<Button variant="contained" onClick={searchHandler}>
				{t('Program Search')}
			</Button>
			<Button
				onClick={() => {
					setDraft(initialInput);
					setSearchFilter({ ...initialInput, page: 1, search: {} });
				}}
			>
				{t('Reset')}
			</Button>
			{error && (
				<Typography color="error" role="alert">
					{error}
				</Typography>
			)}
		</Stack>
	);
};

export default Filter;
