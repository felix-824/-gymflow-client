import React, { useEffect, useState } from 'react';
import {
	Box,
	Button,
	Checkbox,
	FormControlLabel,
	IconButton,
	MenuItem,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { ProgramCategory, ProgramLocation, ProgramType } from '../../enums/program.enum';
import { ProgramsInquiry } from '../../types/program/program.input';
import { readProgramsInquiry } from '../../program';
import { useTranslation } from 'next-i18next';
import { motion, useReducedMotion } from 'framer-motion';

const MotionStack = motion.create(Stack);
const MotionButton = motion.create(Button);

interface FilterType {
	searchFilter: ProgramsInquiry;
	setSearchFilter: (input: ProgramsInquiry) => void;
	initialInput: ProgramsInquiry;
	compact?: boolean;
}

const Filter = ({ searchFilter, setSearchFilter, initialInput, compact = false }: FilterType) => {
	const device = useDeviceDetect();
	const { t } = useTranslation('common');
	const shouldReduceMotion = useReducedMotion();
	const SearchStack = compact ? MotionStack : Stack;
	const SearchButton = compact ? MotionButton : Button;
	const [motionReady, setMotionReady] = useState(false);
	const [draft, setDraft] = useState<ProgramsInquiry>(searchFilter);
	const [error, setError] = useState('');
	const [openSelect, setOpenSelect] = useState<'locationList' | 'typeList' | 'categoryList' | null>(null);
	useEffect(() => {
		setMotionReady(true);
	}, []);

	useEffect(() => {
		setDraft(searchFilter);
		setError('');
	}, [searchFilter]);

	/** HANDLERS **/
	const selectHandler = (key: 'locationList' | 'typeList' | 'categoryList', value: string[]) => {
		setDraft({ ...draft, search: { ...draft.search, [key]: value } });
		if (compact) setOpenSelect(null);
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
		<SearchStack
			className={compact ? 'search-box gymflow-search' : 'filter-main'}
			spacing={compact ? 0 : 2}
			sx={compact ? undefined : { padding: 2 }}
			{...(compact
				? {
						initial: false as const,
						animate: motionReady && shouldReduceMotion === false ? { opacity: [0, 1] } : { opacity: 1 },
						transition: { duration: shouldReduceMotion ? 0 : 0.4, ease: 'easeOut' as const },
					}
				: {})}
		>
			{!compact && <Typography className="title-main">{t('Find Your Program')}</Typography>}
			{!compact && (
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
			)}
			{(
				[
					['locationList', 'Location', Object.values(ProgramLocation)],
					['typeList', 'Program type', Object.values(ProgramType)],
					['categoryList', 'Category', Object.values(ProgramCategory)],
				] as const
			).map(([key, label, values]) => (
				<TextField
					key={key}
					className={compact ? 'search-select' : undefined}
					select
					size="small"
					label={compact ? undefined : t(label)}
					value={draft.search[key] ?? []}
					SelectProps={
						compact
							? {
									multiple: true,
									open: openSelect === key,
									onOpen: () => setOpenSelect(key),
									onClose: () => setOpenSelect(null),
									displayEmpty: true,
									renderValue: (selected) =>
										(selected as string[]).length ? (selected as string[]).map((value) => t(value)).join(', ') : t(label),
									MenuProps: {
										disableScrollLock: true,
										transitionDuration: shouldReduceMotion ? 0 : { enter: 140, exit: 100 },
										PaperProps: { className: 'gymflow-search-menu' },
									},
								}
							: { multiple: true }
					}
					inputProps={compact ? { 'aria-label': t(label) } : undefined}
					sx={compact ? undefined : { minWidth: 150 }}
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
			{!compact && (
				<>
					<TextField
						size="small"
						type="number"
						label={t('Min price (KRW/session)')}
						value={draft.search.pricesRange?.start ?? ''}
						onChange={(e) => rangeHandler('start', e.target.value)}
						inputProps={{ min: 0, max: 2147483647, step: 1 }}
					/>
					<TextField
						size="small"
						type="number"
						label={t('Max price (KRW/session)')}
						value={draft.search.pricesRange?.end === 2147483647 ? '' : draft.search.pricesRange?.end ?? ''}
						onChange={(e) => rangeHandler('end', e.target.value)}
						inputProps={{ min: 0, max: 2147483647, step: 1 }}
					/>
				</>
			)}
			<SearchButton
				className={compact ? 'search-button' : undefined}
				variant="contained"
				onClick={searchHandler}
				{...(compact && shouldReduceMotion === false
					? {
							whileHover: { y: -1 },
							whileTap: { scale: 0.98 },
							transition: { type: 'spring' as const, stiffness: 350, damping: 28 },
						}
					: {})}
			>
				{t(compact ? 'Search' : 'Program Search')}
			</SearchButton>
			{!compact && (
				<Button
					onClick={() => {
						setDraft(initialInput);
						setSearchFilter({ ...initialInput, page: 1, search: {} });
					}}
				>
					{t('Reset')}
				</Button>
			)}
			{error && (
				<Typography color="error" role="alert">
					{error}
				</Typography>
			)}
		</SearchStack>
	);
};

export default Filter;

interface DiscoveryFilterType {
	draft: ProgramsInquiry;
	setDraft: React.Dispatch<React.SetStateAction<ProgramsInquiry>>;
	onApply: () => void;
	onReset: () => void;
	error: string;
	idPrefix: string;
	onClose?: () => void;
}

export const DiscoveryFilter = ({
	draft,
	setDraft,
	onApply,
	onReset,
	error,
	idPrefix,
	onClose,
}: DiscoveryFilterType) => {
	const { t } = useTranslation('common');
	const rangeHandler = (key: 'start' | 'end', value: string) => {
		setDraft((current) => ({
			...current,
			search: {
				...current.search,
				pricesRange: {
					...(current.search.pricesRange ?? { start: 0, end: 2147483647 }),
					[key]: value === '' ? (key === 'start' ? 0 : 2147483647) : Number(value),
				},
			},
		}));
	};

	return (
		<form
			className={'discovery-filter-form'}
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				onApply();
			}}
		>
			<Box component={'div'} className={'discovery-filter-header'}>
				<Typography component={'h2'} id={`${idPrefix}-title`}>
					{t('Program discovery.Filters')}
				</Typography>
				{onClose && (
					<IconButton type={'button'} onClick={onClose} aria-label={t('Program discovery.Close filters')} autoFocus>
						<CloseRoundedIcon />
					</IconButton>
				)}
			</Box>
			<Box component={'div'} className={'discovery-filter-content'}>
				{(
					[
						['locationList', 'Location', Object.values(ProgramLocation)],
						['typeList', 'Program type', Object.values(ProgramType)],
						['categoryList', 'Category', Object.values(ProgramCategory)],
					] as const
				).map(([key, label, values]) => (
					<Box component={'fieldset'} className={'discovery-filter-group'} key={key}>
						<Typography component={'legend'}>{t(label)}</Typography>
						{values.map((value) => (
							<FormControlLabel
								key={value}
								label={t(key === 'locationList' ? value : `Program discovery card.${value}`)}
								control={
									<Checkbox
										size={'small'}
										checked={(draft.search[key] as string[] | undefined)?.includes(value) ?? false}
										onChange={(_, checked) => {
											setDraft((current) => {
												const selected = (current.search[key] ?? []) as string[];
												return {
													...current,
													search: {
														...current.search,
														[key]: checked ? [...selected, value] : selected.filter((item) => item !== value),
													},
												};
											});
										}}
									/>
								}
							/>
						))}
					</Box>
				))}
				<Box component={'fieldset'} className={'discovery-filter-group discovery-price-fields'}>
					<Typography component={'legend'}>{t('Program discovery.Price')}</Typography>
					<TextField
						id={`${idPrefix}-min-price`}
						size={'small'}
						type={'number'}
						label={t('Min price (KRW/session)')}
						value={draft.search.pricesRange?.start ?? ''}
						onChange={(event) => rangeHandler('start', event.target.value)}
						error={Boolean(error)}
						inputProps={{
							min: 0,
							max: 2147483647,
							step: 1,
							'aria-describedby': error ? `${idPrefix}-error` : undefined,
						}}
					/>
					<TextField
						id={`${idPrefix}-max-price`}
						size={'small'}
						type={'number'}
						label={t('Max price (KRW/session)')}
						value={draft.search.pricesRange?.end === 2147483647 ? '' : draft.search.pricesRange?.end ?? ''}
						onChange={(event) => rangeHandler('end', event.target.value)}
						error={Boolean(error)}
						inputProps={{
							min: 0,
							max: 2147483647,
							step: 1,
							'aria-describedby': error ? `${idPrefix}-error` : undefined,
						}}
					/>
					{error && (
						<Typography id={`${idPrefix}-error`} color={'error'} role={'alert'}>
							{error}
						</Typography>
					)}
				</Box>
			</Box>
			<Box component={'div'} className={'discovery-filter-actions'}>
				<Button type={'button'} onClick={onReset}>
					{t('Reset')}
				</Button>
				<Button type={'submit'} variant={'contained'} disableElevation>
					{t('Program discovery.Apply filters')}
				</Button>
			</Box>
		</form>
	);
};
