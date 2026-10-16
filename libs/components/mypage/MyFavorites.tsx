import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button, IconButton, Pagination } from '@mui/material';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useApolloClient, useMutation, useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import { GET_FAVORITES } from '../../../apollo/user/query';
import { LIKE_TARGET_PROGRAM } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getJwtToken, updateUserInfo } from '../../auth';
import { REACT_APP_API_URL } from '../../config';
import { myBookingsAccess } from '../../my-bookings';
import { Program, Programs } from '../../types/program/program';
import { formatterStr } from '../../utils';
import UserAccountNavigation from './UserAccountNavigation';

const favoritesLimit = 8;

function SavedProgramCard({
	program,
	disabled,
	pending,
	onRemove,
}: {
	program: Program;
	disabled: boolean;
	pending: boolean;
	onRemove: (id: string) => void;
}) {
	const { t } = useTranslation('common');
	const [failedImage, setFailedImage] = useState('');
	const image = program.programImages?.find((value) => value?.trim());
	const imageSrc = image
		? /^https?:\/\//i.test(image)
			? image
			: `${REACT_APP_API_URL}/${image.replace(/^\//, '')}`
		: '';
	return (
		<article className="saved-program-card" data-program-id={program._id}>
			<Link
				passHref
				className="saved-program-content"
				href={{ pathname: '/program/detail', query: { id: program._id } }}
			>
				<div className="saved-program-image">
					{imageSrc && imageSrc !== failedImage ? (
						<img
							src={imageSrc}
							alt=""
							loading="lazy"
							width={400}
							height={260}
							onError={() => setFailedImage(imageSrc)}
						/>
					) : (
						<span className="saved-program-image-fallback" aria-hidden="true">
							<FitnessCenterOutlinedIcon />
						</span>
					)}
				</div>
				<div className="saved-program-body">
					<div className="saved-program-labels">
						<span>{t(`Program discovery card.${program.programCategory}`)}</span>
						<span>{t(`Program discovery card.${program.programType}`)}</span>
					</div>
					<h2 title={program.programName}>{program.programName}</h2>
					<p className="saved-program-location">
						<LocationOnOutlinedIcon />
						<span>{t(program.programLocation)}</span>
					</p>
					<p className="saved-program-duration">
						<ScheduleOutlinedIcon />
						<span>{t('Session duration', { duration: program.programDuration })}</span>
					</p>
					<p className="saved-program-price">
						<strong>₩{formatterStr(program.programPrice)}</strong>
						<span>{t('Per session')}</span>
					</p>
				</div>
			</Link>
			<IconButton
				type="button"
				className="saved-program-heart"
				aria-pressed={true}
				aria-label={t('User favorites.Remove', { name: program.programName })}
				aria-busy={pending}
				disabled={disabled}
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onRemove(program._id);
				}}
			>
				<FavoriteRoundedIcon />
			</IconButton>
		</article>
	);
}

function FavoritesContent({ memberId }: { memberId: string }) {
	const { t } = useTranslation('common');
	const client = useApolloClient();
	const [likeTargetProgram] = useMutation(LIKE_TARGET_PROGRAM);
	const [result, setResult] = useState<Programs | null>(null);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [listError, setListError] = useState(false);
	const [feedback, setFeedback] = useState('');
	const [pending, setPending] = useState<string[]>([]);
	const mounted = useRef(false);
	const request = useRef(0);
	const pageRef = useRef(1);
	const reading = useRef(false);
	const synchronized = useRef(false);
	const locks = useRef(new Set<string>());
	const activeAccount = useCallback(
		() =>
			mounted.current &&
			authReadyVar() &&
			!authErrorVar() &&
			userVar()._id === memberId &&
			userVar().memberType === 'USER' &&
			userVar().memberStatus === 'ACTIVE',
		[memberId],
	);

	/** APOLLO REQUESTS **/
	const refetchFavorites = useCallback(
		async (requestedPage = pageRef.current) => {
			if (!activeAccount()) return false;
			const sequence = ++request.current;
			reading.current = true;
			synchronized.current = false;
			setLoading(true);
			setListError(false);
			try {
				let nextPage = requestedPage;
				while (activeAccount() && sequence === request.current) {
					// Private reads bypass cache and deduplication across account changes.
					const response = await client.query<{ getFavorites: Programs }>({
						query: GET_FAVORITES,
						variables: { input: { page: nextPage, limit: favoritesLimit } },
						fetchPolicy: 'no-cache',
						context: { queryDeduplication: false, handleErrorLocally: true },
					});
					if (!activeAccount() || sequence !== request.current) return false;
					const next = response.data?.getFavorites;
					if (!next || !Array.isArray(next.list)) throw new Error('Missing favorites result');
					const total = next.metaCounter?.[0]?.total ?? 0;
					const lastPage = Math.max(1, Math.ceil(total / favoritesLimit));
					if (nextPage > lastPage) {
						nextPage = lastPage;
						continue;
					}
					pageRef.current = nextPage;
					setPage(nextPage);
					setResult(next);
					synchronized.current = true;
					return true;
				}
			} catch {
				if (activeAccount() && sequence === request.current) setListError(true);
			} finally {
				if (activeAccount() && sequence === request.current) {
					reading.current = false;
					setLoading(false);
				}
			}
			return false;
		},
		[activeAccount, client],
	);

	/** LIFECYCLES **/
	useEffect(() => {
		mounted.current = true;
		const interactionLocks = locks.current;
		void refetchFavorites();
		return () => {
			mounted.current = false;
			request.current += 1;
			interactionLocks.clear();
		};
	}, [refetchFavorites]);

	/** HANDLERS **/
	const removeProgram = async (id: string) => {
		if (
			!activeAccount() ||
			!synchronized.current ||
			reading.current ||
			locks.current.size > 0 ||
			locks.current.has(id) ||
			!result?.list.some((program) => program._id === id)
		)
			return;
		// Acquire before awaiting: mutation loading cannot protect two clicks in one tick.
		locks.current.add(id);
		setPending(Array.from(locks.current));
		setFeedback('');
		let removalFeedback = 'Removed';
		try {
			await likeTargetProgram({
				variables: { input: id },
				fetchPolicy: 'no-cache',
				context: { handleErrorLocally: true },
			});
		} catch (error: any) {
			removalFeedback = error?.networkError || !error?.graphQLErrors?.length ? 'Uncertain' : 'Remove error';
		}
		if (!activeAccount()) return;
		// Reconcile a failed/lost toggle response by reading, never by retrying the write.
		const refreshed = await refetchFavorites();
		if (!activeAccount()) return;
		setFeedback(refreshed ? removalFeedback : removalFeedback === 'Removed' ? 'Sync error' : 'Reconcile error');
		locks.current.delete(id);
		setPending(Array.from(locks.current));
	};
	const retry = async () => {
		if (reading.current || locks.current.size || !activeAccount()) return;
		setFeedback('');
		await refetchFavorites();
	};
	const total = result?.metaCounter?.[0]?.total ?? 0;
	const busy = loading || pending.length > 0;
	return (
		<>
			<p className="user-favorites-count" aria-live="polite">
				{result && t('User favorites.Saved count', { count: total })}
			</p>
			<UserAccountNavigation active="Favorites" />
			<section className="user-favorites-collection" aria-label={t('User favorites.Title')} aria-busy={busy}>
				{feedback && (
					<p className="user-favorites-feedback" role="status">
						{t(`User favorites.${feedback}`)}
					</p>
				)}
				{loading && (
					<p className="user-favorites-loading" role="status">
						{t('User favorites.Loading')}
					</p>
				)}
				{listError && (
					<div className="user-favorites-state is-error" role="alert">
						<p>{t(result ? 'User favorites.Refresh error' : 'User favorites.Error')}</p>
						<Button onClick={() => void retry()} disabled={busy}>
							{t('User favorites.Retry')}
						</Button>
					</div>
				)}
				{result && result.list.length > 0 && (
					<div className="user-favorites-grid">
						{result.list.map((program) => (
							<SavedProgramCard
								key={program._id}
								program={program}
								disabled={busy || listError || !synchronized.current}
								pending={pending.includes(program._id)}
								onRemove={(id) => void removeProgram(id)}
							/>
						))}
					</div>
				)}
				{!loading && !listError && result && total === 0 && (
					<div className="user-favorites-state is-empty">
						<FavoriteRoundedIcon aria-hidden="true" />
						<h2>{t('User favorites.Empty title')}</h2>
						<p>{t('User favorites.Empty copy')}</p>
						<Link passHref className="user-favorites-explore" href="/program">
							{t('User favorites.Explore Programs')}
							<ArrowForwardRoundedIcon />
						</Link>
					</div>
				)}
				{result && total > favoritesLimit && (
					<Pagination
						className="user-favorites-pagination"
						count={Math.ceil(total / favoritesLimit)}
						page={page}
						disabled={busy || listError}
						siblingCount={0}
						boundaryCount={1}
						aria-label={t('User favorites.Pagination')}
						onChange={(_, value) => {
							if (reading.current || locks.current.size) return;
							setFeedback('');
							void refetchFavorites(value);
						}}
						getItemAriaLabel={(type, value, selected) =>
							type === 'page'
								? t(selected ? 'User favorites.Current page' : 'User favorites.Go to page', { page: value })
								: t(`User favorites.${type}`)
						}
					/>
				)}
			</section>
			{result && total > 0 && (
				<aside className="user-favorites-discovery">
					<div>
						<h2>{t('User favorites.Discovery title')}</h2>
						<p>{t('User favorites.Discovery copy')}</p>
					</div>
					<Link passHref className="user-favorites-explore" href="/program">
						{t('User favorites.Explore Programs')}
						<ArrowForwardRoundedIcon />
					</Link>
				</aside>
			)}
		</>
	);
}

const MyFavorites = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const access = myBookingsAccess(authReady && router.isReady, authError, user);
	return (
		<div id="my-favorites-page">
			<header className="user-favorites-heading">
				<p className="user-favorites-eyebrow">{t('User favorites.Eyebrow')}</p>
				<h1>{t('User favorites.Title')}</h1>
				<p>{t('User favorites.Subtitle')}</p>
			</header>
			{access === 'ready' ? (
				<FavoritesContent key={user._id} memberId={user._id} />
			) : (
				<div className="user-favorites-state" role={access === 'error' ? 'alert' : 'status'}>
					<p>{t(`MyBookings.${access}`)}</p>
					{access === 'error' && (
						<Button onClick={() => void updateUserInfo(getJwtToken())}>{t('User favorites.Retry')}</Button>
					)}
					{access === 'guest' && (
						<Link href={{ pathname: '/account/join', query: { referrer: '/mypage?category=myFavorites' } }}>
							{t('Login / Register')}
						</Link>
					)}
					{access === 'forbidden' && <Link href="/mypage">{t('My Page')}</Link>}
				</div>
			)}
		</div>
	);
};

export default MyFavorites;
