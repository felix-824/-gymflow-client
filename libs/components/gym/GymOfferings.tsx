import React, { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { Button, Pagination, Skeleton, useMediaQuery } from '@mui/material';
import { useTranslation } from 'next-i18next';
import { GET_PROGRAMS, GET_TRAINERS } from '../../../apollo/user/query';
import ProgramCard from '../program/ProgramCard';
import TrainerCard from '../common/TrainerCard';
import { initialProgramsInquiry, readProgramsInquiry, readTrainersInquiry } from '../../program';
import { Direction } from '../../enums/common.enum';
import { Programs } from '../../types/program/program';
import { PublicMembers } from '../../types/member/member';

const SectionPagination = ({
	page,
	total,
	label,
	onChange,
}: {
	page: number;
	total: number;
	label: string;
	onChange: (page: number) => void;
}) => {
	const { t } = useTranslation('gyms');
	const mobile = useMediaQuery('(max-width:767px)');
	if (total <= 1) return null;
	return (
		<nav className="gym-section-pagination" aria-label={label}>
			{mobile ? (
				<>
					<Button disabled={page <= 1} onClick={() => onChange(page - 1)}>
						{t('pagination.previous')}
					</Button>
					<span>{t('pagination.page', { page, total })}</span>
					<Button disabled={page >= total} onClick={() => onChange(page + 1)}>
						{t('pagination.next')}
					</Button>
				</>
			) : (
				<Pagination
					count={total}
					page={page}
					shape="rounded"
					onChange={(_, next) => onChange(next)}
					getItemAriaLabel={(type, number) =>
						t(
							type === 'page' ? 'pagination.goToPage' : type === 'previous' ? 'pagination.previous' : 'pagination.next',
							{ page: number },
						)
					}
				/>
			)}
		</nav>
	);
};

const OfferingSkeleton = ({ label }: { label: string }) => {
	const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	return (
		<div className="gym-child-grid" role="status" aria-label={label}>
			{[0, 1, 2].map((item) => (
				<Skeleton
					key={item}
					variant="rectangular"
					className="gym-child-skeleton"
					animation={reduceMotion ? false : 'pulse'}
				/>
			))}
		</div>
	);
};

export const GymPrograms = ({ gymId }: { gymId: string }) => {
	const { t } = useTranslation('gyms');
	const [page, setPage] = useState(1);
	const input = useMemo(
		() => readProgramsInquiry({ ...initialProgramsInquiry, limit: 3, page, search: { gymId } }),
		[gymId, page],
	);
	const { data, loading, error, refetch } = useQuery<{ getPrograms: Programs }>(GET_PROGRAMS, {
		variables: { input },
		fetchPolicy: 'network-only',
		notifyOnNetworkStatusChange: true,
	});
	const programs = data?.getPrograms?.list ?? [],
		total = data?.getPrograms?.metaCounter?.[0]?.total ?? 0;
	return (
		<section
			id="gym-programs"
			className="gym-detail-offerings gym-detail-programs"
			tabIndex={-1}
			aria-labelledby="gym-programs-title"
			aria-busy={loading}
		>
			<header>
				<h2 id="gym-programs-title">{t('detail.programs')}</h2>
				<p>{t('detail.programsIntro')}</p>
			</header>
			{loading ? (
				<OfferingSkeleton label={t('detail.programsLoading')} />
			) : error ? (
				<div className="gym-section-state" role="alert">
					<p>{t('detail.programsError')}</p>
					<Button
						onClick={async () => {
							try {
								await refetch({ input });
							} catch {
								/* Local Apollo error state. */
							}
						}}
					>
						{t('retry')}
					</Button>
				</div>
			) : programs.length ? (
				<div className="gym-child-grid">
					{programs.map((program) => (
						<ProgramCard key={program._id} program={program} variant="discovery" />
					))}
				</div>
			) : (
				<div className="gym-section-state">
					<p>{t('detail.programsEmpty')}</p>
					{page > 1 && <Button onClick={() => setPage(1)}>{t('pagination.first')}</Button>}
				</div>
			)}
			{!loading && !error && (
				<SectionPagination
					page={page}
					total={Math.ceil(total / input.limit)}
					label={t('detail.programPagination')}
					onChange={setPage}
				/>
			)}
		</section>
	);
};

export const GymTrainers = ({ gymId }: { gymId: string }) => {
	const { t } = useTranslation('gyms');
	const [page, setPage] = useState(1);
	const input = useMemo(
		() =>
			readTrainersInquiry(
				{ page, limit: 3, sort: 'createdAt', direction: Direction.DESC, search: { gymId } },
				{ page: 1, limit: 3, sort: 'createdAt', direction: Direction.DESC, search: {} },
			),
		[gymId, page],
	);
	const { data, loading, error, refetch } = useQuery<{ getTrainers: PublicMembers }>(GET_TRAINERS, {
		variables: { input },
		fetchPolicy: 'network-only',
		notifyOnNetworkStatusChange: true,
	});
	const trainers = data?.getTrainers?.list ?? [],
		total = data?.getTrainers?.metaCounter?.[0]?.total ?? 0;
	return (
		<section
			id="gym-trainers"
			className="gym-detail-offerings gym-detail-trainers"
			aria-labelledby="gym-trainers-title"
			aria-busy={loading}
		>
			<header>
				<h2 id="gym-trainers-title">{t('detail.trainers')}</h2>
				<p>{t('detail.trainersIntro')}</p>
			</header>
			{loading ? (
				<OfferingSkeleton label={t('detail.trainersLoading')} />
			) : error ? (
				<div className="gym-section-state" role="alert">
					<p>{t('detail.trainersError')}</p>
					<Button
						onClick={async () => {
							try {
								await refetch({ input });
							} catch {
								/* Local Apollo error state. */
							}
						}}
					>
						{t('retry')}
					</Button>
				</div>
			) : trainers.length ? (
				<div className="gym-child-grid">
					{trainers.map((trainer) => (
						<TrainerCard key={trainer._id} trainer={trainer} showStats={false} />
					))}
				</div>
			) : (
				<div className="gym-section-state">
					<p>{t('detail.trainersEmpty')}</p>
					{page > 1 && <Button onClick={() => setPage(1)}>{t('pagination.first')}</Button>}
				</div>
			)}
			{!loading && !error && (
				<SectionPagination
					page={page}
					total={Math.ceil(total / input.limit)}
					label={t('detail.trainerPagination')}
					onChange={setPage}
				/>
			)}
		</section>
	);
};
