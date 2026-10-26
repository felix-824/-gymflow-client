import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, ClickAwayListener, Drawer, IconButton, MenuItem, Popper, TextField, useMediaQuery } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { ProgramCategory, ProgramLocation } from '../enums/program.enum';
import { initialProgramsInquiry, readProgramsInquiry } from '../program';
import { ProgramsInquiry } from '../types/program/program.input';

interface GlobalProgramSearchProps {
	onDesktopHeightChange?: (height: number) => void;
}

const GlobalProgramSearch = ({ onDesktopHeightChange }: GlobalProgramSearchProps) => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const mobile = useMediaQuery('(max-width:767px)');
	const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const id = useId();
	const panelId = `global-program-search-${id}`;
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<ProgramsInquiry>(initialProgramsInquiry);
	const [openSelect, setOpenSelect] = useState<'locationList' | 'categoryList' | null>(null);
	const [layerElement, setLayerElement] = useState<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open || mobile || !layerElement) {
			onDesktopHeightChange?.(0);
			return;
		}
		const reserveLayerHeight = () => onDesktopHeightChange?.(layerElement.getBoundingClientRect().height);
		reserveLayerHeight();
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reserveLayerHeight);
		observer?.observe(layerElement);
		window.addEventListener('resize', reserveLayerHeight);
		return () => {
			observer?.disconnect();
			window.removeEventListener('resize', reserveLayerHeight);
			onDesktopHeightChange?.(0);
		};
	}, [open, mobile, layerElement, onDesktopHeightChange]);

	useEffect(() => {
		const closeOnNavigation = () => {
			setOpen(false);
			setOpenSelect(null);
		};
		router.events?.on('routeChangeComplete', closeOnNavigation);
		return () => router.events?.off('routeChangeComplete', closeOnNavigation);
	}, [router.events]);

	const closeHandler = (restoreFocus = true) => {
		setOpen(false);
		setOpenSelect(null);
		if (restoreFocus) triggerRef.current?.focus();
	};
	const toggleHandler = () => {
		if (open) {
			closeHandler();
			return;
		}
		if (router.pathname === '/program') {
			const input = readProgramsInquiry(router.query.input);
			setDraft({
				...initialProgramsInquiry,
				search: {
					text: input.search.text,
					locationList: input.search.locationList,
					categoryList: input.search.categoryList,
				},
			});
		}
		setOpen(true);
	};
	const submitHandler = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const input = readProgramsInquiry({ ...draft, page: 1 });
		void router.push({ pathname: '/program', query: { input: JSON.stringify(input) } }).then((navigated) => {
			if (navigated) closeHandler(false);
		}).catch(() => undefined);
	};

	const searchForm = (
		<form
			className="global-program-search-form"
			role="search"
			aria-label={t('Program Search')}
			onSubmit={submitHandler}
			onKeyDown={(event) => {
				if (event.key === 'Escape' && !openSelect) {
					event.stopPropagation();
					closeHandler();
				}
			}}
		>
			<TextField
				className="global-search-name"
				variant="standard"
				label={t('Search')}
				placeholder={t('Program discovery.Search placeholder')}
				type="search"
				autoFocus
				value={draft.search.text ?? ''}
				onChange={(event) => setDraft({ ...draft, search: { ...draft.search, text: event.target.value } })}
				inputProps={{ maxLength: 100 }}
				InputLabelProps={{ shrink: true }}
				InputProps={{ disableUnderline: true }}
			/>
			{([
				['locationList', 'Location', Object.values(ProgramLocation)],
				['categoryList', 'Category', Object.values(ProgramCategory)],
			] as const).map(([key, label, values]) => (
				<TextField
					key={key}
					className="global-search-select"
					select
					variant="standard"
					label={t(label)}
					value={draft.search[key] ?? []}
					InputLabelProps={{ shrink: true }}
					InputProps={{ disableUnderline: true }}
					SelectProps={{
						multiple: true,
						displayEmpty: true,
						open: openSelect === key,
						onOpen: () => setOpenSelect(key),
						onClose: () => setOpenSelect(null),
						renderValue: (selected) => (selected as string[]).length
							? (selected as string[]).map((value) => t(value)).join(', ')
							: t('Home hero.Any'),
						MenuProps: {
							disableScrollLock: true,
							transitionDuration: reducedMotion ? 0 : 120,
							PaperProps: { className: 'global-program-search-menu' },
						},
					}}
					onChange={(event) => {
						const selected = typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value;
						setDraft({ ...draft, search: { ...draft.search, [key]: selected.includes('') ? [] : selected } });
						setOpenSelect(null);
					}}
				>
					<MenuItem value="">{t('Home hero.Any')}</MenuItem>
					{values.map((value) => <MenuItem key={value} value={value}>{t(value)}</MenuItem>)}
				</TextField>
			))}
			<div className="global-search-action">
				<Button type="submit" className="global-search-submit" variant="contained" disableElevation>
					<SearchRoundedIcon aria-hidden={true} />
					{t('Search')}
				</Button>
			</div>
		</form>
	);

	return (
		<ClickAwayListener onClickAway={() => { if (open && !mobile) closeHandler(false); }}>
			<div className="global-program-search">
				<IconButton
					ref={triggerRef}
					className="global-program-search-trigger"
					aria-label={t(open ? 'Program discovery.Close filters' : 'Search')}
					aria-expanded={open}
					aria-controls={open ? panelId : undefined}
					aria-haspopup={mobile ? 'dialog' : undefined}
					onClick={toggleHandler}
				>
					{open ? <CloseRoundedIcon /> : <SearchRoundedIcon />}
				</IconButton>
				{mobile ? (
					<Drawer
						anchor="top"
						open={open}
						onClose={() => closeHandler()}
						hideBackdrop
						transitionDuration={reducedMotion ? 0 : 160}
						PaperProps={{
							id: panelId,
							className: 'global-program-search-sheet',
							role: 'dialog',
							'aria-modal': true,
							'aria-labelledby': `${panelId}-title`,
						}}
					>
						<div className="global-search-sheet-heading">
							<h2 id={`${panelId}-title`}>{t('Search')}</h2>
							<IconButton aria-label={t('Program discovery.Close filters')} onClick={() => closeHandler()}>
								<CloseRoundedIcon />
							</IconButton>
						</div>
						{searchForm}
					</Drawer>
				) : (
					<Popper
						ref={setLayerElement}
						id={panelId}
						className="global-program-search-layer"
						open={open}
						anchorEl={triggerRef.current?.closest('header, .navbar-main') as HTMLElement | null}
						placement="bottom-start"
						modifiers={[{ name: 'flip', enabled: false }]}
					>
						{searchForm}
					</Popper>
				)}
			</div>
		</ClickAwayListener>
	);
};

export default GlobalProgramSearch;
