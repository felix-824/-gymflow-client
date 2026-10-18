import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { Accordion, AccordionDetails, AccordionSummary, useMediaQuery } from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import { filterHelpTopics, HELP_SHORTCUTS, HelpTopic, readHelpTopics } from '../../libs/help';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const topicIcons: Record<string, typeof ExploreOutlinedIcon> = {
	programs: ExploreOutlinedIcon,
	booking: CalendarMonthOutlinedIcon,
	account: BadgeOutlinedIcon,
	favorites: StarBorderRoundedIcon,
	'trainer-programs': LayersOutlinedIcon,
	schedule: PendingActionsOutlinedIcon,
	community: ForumOutlinedIcon,
	images: ImageOutlinedIcon,
};

const Help: NextPage = () => {
	const { t } = useTranslation('common');
	const mobile = useMediaQuery('(max-width:767px)');
	const searchRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState('');
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['leave-review', 'save-program-changes']));
	const [shortcutTarget, setShortcutTarget] = useState<string | null>(null);
	const topics = useMemo(() => readHelpTopics(t), [t]);
	const filtered = useMemo(() => filterHelpTopics(topics, query), [topics, query]);
	// Keep the reference's independent desktop columns and the mobile reading order.
	const columns = mobile
		? [filtered]
		: [0, 1].map((column) => filtered.filter((topic) => topics.findIndex(({ id }) => id === topic.id) % 2 === column));

	useEffect(() => {
		if (!shortcutTarget) return;
		const control = document.getElementById(`help-question-${shortcutTarget}`);
		control?.focus({ preventScroll: true });
		control?.scrollIntoView({ block: 'start', behavior: 'auto' });
		setShortcutTarget(null);
	}, [shortcutTarget]);

	const clearSearchHandler = () => {
		setQuery('');
		searchRef.current?.focus();
	};

	const shortcutHandler = (questionId: string) => {
		if (!filtered.some((topic) => topic.questions.some(({ id }) => id === questionId))) setQuery('');
		setExpanded((previous) => new Set(previous).add(questionId));
		setShortcutTarget(questionId);
	};

	const topicContent = (topic: HelpTopic) => (
		<section className="help-topic" key={topic.id} aria-labelledby={`help-topic-${topic.id}`}>
			<div className="help-topic-heading">
				<div className="help-topic-title">
					{React.createElement(topicIcons[topic.id], { 'aria-hidden': true })}
					<h3 id={`help-topic-${topic.id}`}>{topic.title}</h3>
				</div>
				<span className="help-audience">{topic.audience}</span>
				<p className="help-topic-description">{topic.description}</p>
			</div>
			{topic.questions.map(({ id, question, answer }) => (
				<Accordion
					key={id}
					className="help-question"
					disableGutters
					elevation={0}
					square
					expanded={expanded.has(id)}
					TransitionProps={{ timeout: 0 }}
					onChange={(_, open) =>
						setExpanded((previous) => {
							const next = new Set(previous);
							if (open) next.add(id);
							else next.delete(id);
							return next;
						})
					}
				>
					<AccordionSummary
						id={`help-question-${id}`}
						aria-controls={`help-answer-${id}`}
						expandIcon={<KeyboardArrowDownRoundedIcon aria-hidden="true" />}
					>
						{question}
					</AccordionSummary>
					<AccordionDetails className="help-answer">
						<p>{answer}</p>
					</AccordionDetails>
				</Accordion>
			))}
		</section>
	);

	return (
		<div id="help-page">
			<Head>
				<title>{t('Help center.Page title')} | GymFlow</title>
			</Head>
			<section className="help-hero" aria-labelledby="help-title">
				<div className="help-hero-inner">
					<p className="help-eyebrow">{t('Help center.Eyebrow')}</p>
					<h1 id="help-title">{t('Help center.Heading')}</h1>
					<p className="help-support">{t('Help center.Support')}</p>
					<form
						className="help-search"
						role="search"
						aria-label={t('Help center.Search label')}
						onSubmit={(event) => event.preventDefault()}
					>
						<SearchRoundedIcon aria-hidden="true" />
						<input
							ref={searchRef}
							id="help-search"
							type="search"
							aria-label={t('Help center.Search label')}
							placeholder={t('Help center.Search placeholder')}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Escape') {
									event.preventDefault();
									clearSearchHandler();
								}
							}}
						/>
						{query ? (
							<button type="button" onClick={clearSearchHandler} aria-label={t('Help center.Clear')}>
								<CloseRoundedIcon />
							</button>
						) : (
							<span className="help-search-hint">{t('Help center.Escape')}</span>
						)}
					</form>
				</div>
			</section>
			<nav className="help-shortcuts" aria-label={t('Help center.Shortcut navigation')}>
				<div className="help-container">
					<span className="help-shortcut-title">{t(mobile ? 'Help center.Quick' : 'Help center.Popular')}</span>
					<div className="help-shortcut-strip">
						{HELP_SHORTCUTS.map(({ key, questionId }) => (
							<button key={key} type="button" onClick={() => shortcutHandler(questionId)}>
								{t(`Help center.Shortcuts.${key}`)}
							</button>
						))}
					</div>
				</div>
			</nav>
			<section className="help-directory help-container" aria-labelledby="help-directory-title">
				<div className="help-directory-heading">
					<div>
						<p className="help-eyebrow">{t('Help center.Directory eyebrow')}</p>
						<h2 id="help-directory-title">{t('Help center.Browse')}</h2>
					</div>
					<p>{t('Help center.Directory support')}</p>
				</div>
				{filtered.length ? (
					<div className="help-columns">
						{columns.map((column, index) => (
							<div className="help-column" key={index}>
								{column.map(topicContent)}
							</div>
						))}
					</div>
				) : (
					<div className="help-empty" role="status">
						<h3>{t('Help center.Empty title')}</h3>
						<p>{t('Help center.Empty support')}</p>
						<button type="button" onClick={clearSearchHandler}>
							{t('Help center.Clear')}
						</button>
					</div>
				)}
			</section>
			<section className="help-closing help-container" aria-labelledby="help-closing-title">
				<HelpOutlineRoundedIcon aria-hidden="true" />
				<h2 id="help-closing-title">{t('Help center.Closing title')}</h2>
				<p>{t('Help center.Closing support')}</p>
				<div className="help-actions">
					<Link href="/program" passHref className="help-primary">
						{t('Help center.Programs')}
						<ArrowForwardRoundedIcon aria-hidden="true" />
					</Link>
					<Link href="/trainer" passHref className="help-secondary">
						{t('Help center.Trainers')}
						<ArrowForwardRoundedIcon aria-hidden="true" />
					</Link>
				</div>
			</section>
		</div>
	);
};

export default withLayoutBasic(Help);
