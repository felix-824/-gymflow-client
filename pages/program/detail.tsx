import React, { useEffect, useState } from 'react';
import { Avatar, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GroupsIcon from '@mui/icons-material/Groups';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import withLayoutFull from '../../libs/components/layout/LayoutFull';
import ProgramCard from '../../libs/components/program/ProgramCard';
import { Program } from '../../libs/types/program/program';
import { ProgramType } from '../../libs/enums/program.enum';
import { Direction } from '../../libs/enums/common.enum';
import { GET_PROGRAM, GET_PROGRAMS } from '../../apollo/user/query';
import { LIKE_TARGET_PROGRAM } from '../../apollo/user/mutation';
import { authReadyVar, authErrorVar, userVar } from '../../apollo/store';
import { REACT_APP_API_URL } from '../../libs/config';
import { formatterStr } from '../../libs/utils';
import { sweetMixinErrorAlert } from '../../libs/sweetAlert';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const ProgramDetail: NextPage = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const programId = typeof router.query.id === 'string' ? router.query.id : '';
	const [program, setProgram] = useState<Program | null>(null);
	const [slideImage, setSlideImage] = useState('');
	const [destinationPrograms, setDestinationPrograms] = useState<Program[]>([]);

	/** APOLLO REQUESTS **/
	const [likeTargetProgram, { loading: liking }] = useMutation(LIKE_TARGET_PROGRAM);
	const {
		loading,
		error,
		refetch: getProgramRefetch,
	} = useQuery(GET_PROGRAM, {
		fetchPolicy: 'network-only',
		variables: { input: programId },
		skip: !router.isReady || !/^[a-f\d]{24}$/i.test(programId),
		onCompleted: (data) => {
			setProgram(data.getProgram);
			setSlideImage(data.getProgram?.programImages?.[0] ?? '');
		},
		onError: () => setProgram(null),
	});
	const relatedInput = {
		page: 1,
		limit: 5,
		sort: 'createdAt',
		direction: Direction.DESC,
		search: { categoryList: program ? [program.programCategory] : [] },
	};
	const { refetch: getProgramsRefetch } = useQuery(GET_PROGRAMS, {
		fetchPolicy: 'network-only',
		variables: { input: relatedInput },
		skip: !program,
		onCompleted: (data) =>
			setDestinationPrograms((data.getPrograms?.list ?? []).filter((item: Program) => item._id !== programId)),
	});
	useEffect(() => {
		setProgram(null);
		setSlideImage('');
		setDestinationPrograms([]);
	}, [programId]);

	/** HANDLERS **/
	const likeProgramHandler = async (member: { _id: string }, id: string) => {
		try {
			if (!member._id) throw new Error('Please login first!');
			await likeTargetProgram({ variables: { input: id } });
			if (id === programId) {
				const { data } = await getProgramRefetch();
				setProgram(data.getProgram);
			}
			await getProgramsRefetch();
		} catch (err: any) {
			await sweetMixinErrorAlert(err.message);
		}
	};
	if (!router.isReady || loading) return <ProgramDetailState state="loading" />;
	if (error || !program)
		return (
			<ProgramDetailState
				state={error?.networkError ? 'error' : 'unavailable'}
				onRetry={() => getProgramRefetch()}
			/>
		);

	const isLiked = !!program.meLiked?.[0]?.myFavorite;
	const location = program.programType === ProgramType.ONLINE ? t('ONLINE') : t(program.programLocation);
	const address = program.programType !== ProgramType.ONLINE ? program.programAddress : '';
	const trainerName = program.memberData?.memberFullName?.trim() || program.memberData?.memberNick?.trim();

	return (
		<div id="program-detail-page">
			<Head>
				<link
					rel="stylesheet"
					href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
				/>
			</Head>
			<div className="container">
				<Stack className="program-detail-config">
					<section className="program-detail-hero" aria-labelledby="program-detail-title">
						<nav className="detail-breadcrumb" aria-label={t('Program detail.Breadcrumb')}>
							<Link href="/program">{t('Programs')}</Link>
							<ChevronRightRoundedIcon aria-hidden="true" />
							<span aria-current="page">{program.programName}</span>
						</nav>
						<div className="detail-identity">
							<div className="detail-badges">
								<span className="detail-category">{t(`Program discovery card.${program.programCategory}`)}</span>
								<span className="detail-type">{t(`Program discovery card.${program.programType}`)}</span>
							</div>
							<Typography component="h1" id="program-detail-title">
								{program.programName}
							</Typography>
							<div className="detail-metadata">
								<span>
									<LocationOnOutlinedIcon />
									{[location, address].filter(Boolean).join(' · ')}
								</span>
								<span>
									<AccessTimeIcon />
									{t('Session duration', { duration: program.programDuration })}
								</span>
								<span>
									<GroupsIcon />
									{t('Program detail.Session capacity', { capacity: program.programCapacity })}
								</span>
							</div>
						</div>
						<div className="detail-gallery" role="group" aria-label={t('Program detail.Program images')}>
							<div className="detail-main-image">
								<ProgramDetailImage image={slideImage} alt={program.programName} />
							</div>
							{program.programImages.length > 0 && (
								<div className="detail-thumbnails">
									<div className="detail-thumbnail-list">
										{program.programImages.map((image, index) => (
											<button
												type="button"
												key={image}
												aria-label={t('Program detail.View image', { index: index + 1 })}
												aria-pressed={slideImage === image}
												onClick={() => setSlideImage(image)}
											>
												<ProgramDetailImage image={image} alt="" />
											</button>
										))}
									</div>
								</div>
							)}
						</div>
						<aside className="detail-summary" aria-label={t('Program detail.Program summary')}>
							<div className="detail-rate">
								<span>{t('Program detail.Session rate')}</span>
								<p>
									<strong>₩{formatterStr(program.programPrice)}</strong>
									<span>{t('Per session')}</span>
								</p>
							</div>
							<dl>
								<div>
									<dt>{t('Program type')}</dt>
									<dd>{t(`Program discovery card.${program.programType}`)}</dd>
								</div>
								<div>
									<dt>{t('Program detail.Duration')}</dt>
									<dd>{t('Session duration', { duration: program.programDuration })}</dd>
								</div>
								<div>
									<dt>{t('Program detail.Capacity')}</dt>
									<dd>{program.programCapacity}</dd>
								</div>
								<div>
									<dt>{t('Location')}</dt>
									<dd>{location}</dd>
								</div>
							</dl>
							<div className="detail-stats">
								<span>
									<RemoveRedEyeOutlinedIcon />
									{t('Program views', { views: formatterStr(program.programViews) })}
								</span>
								<span>
									<FavoriteBorderIcon />
									{t('Program likes', { likes: formatterStr(program.programLikes) })}
								</span>
							</div>
							<Button
								className="detail-save"
								aria-label={t(isLiked ? 'Unlike program' : 'Like program', { name: program.programName })}
								aria-pressed={isLiked}
								disabled={liking}
								startIcon={isLiked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
								onClick={() => likeProgramHandler(user, program._id)}
							>
								{t(isLiked ? 'Program detail.Saved' : 'Program detail.Save program')}
							</Button>
							{(program.programType === ProgramType.PT_1ON1 || program.programType === ProgramType.GROUP_CLASS) && (
								<>
									<Button className="detail-book-session" disabled={!authReady || Boolean(authError) || Boolean(user._id && (user.memberType !== 'USER' || user.memberStatus !== 'ACTIVE'))}
										onClick={() => {
											const href = '/program/booking?id=' + program._id;
											void router.push(user._id ? href : { pathname: '/account/join', query: { referrer: href } });
										}}>{t('Booking.Book Session')}</Button>
									{user._id && user.memberType !== 'USER' && <p className="detail-book-note">{t('Booking.USER only')}</p>}
								</>
							)}
						</aside>
					</section>
					<div className="program-detail-content">
						<div className="detail-content-main">
							<section className="detail-content-section" aria-labelledby="detail-about-title">
								<Typography component="h2" id="detail-about-title">
									{t('Program detail.About')}
								</Typography>
								<Typography className="detail-description">
									{program.programDesc?.trim() || t('Program detail.No description')}
								</Typography>
							</section>
							<section className="detail-content-section" aria-labelledby="detail-attributes-title">
								<Typography component="h2" id="detail-attributes-title">
									{t('Program detail.Details')}
								</Typography>
								<dl className="detail-attributes">
									<div>
										<dt>
											<FitnessCenterOutlinedIcon aria-hidden="true" />{t('Program type')}
										</dt>
										<dd>{t(`Program discovery card.${program.programType}`)}</dd>
									</div>
									<div>
										<dt>
											<FitnessCenterOutlinedIcon aria-hidden="true" />{t('Category')}
										</dt>
										<dd>{t(`Program discovery card.${program.programCategory}`)}</dd>
									</div>
									<div>
										<dt>
											<AccessTimeIcon aria-hidden="true" />{t('Program detail.Duration')}
										</dt>
										<dd>{t('Session duration', { duration: program.programDuration })}</dd>
									</div>
									<div>
										<dt>
											<GroupsIcon aria-hidden="true" />{t('Program detail.Capacity')}
										</dt>
										<dd>{program.programCapacity}</dd>
									</div>
									<div className="detail-attribute-location">
										<dt>
											<LocationOnOutlinedIcon aria-hidden="true" />{t('Location')}
										</dt>
										<dd>{location}</dd>
									</div>
								</dl>
							</section>
							{address?.trim() && (
								<section className="detail-content-section" aria-labelledby="detail-address-title">
									<Typography component="h2" id="detail-address-title">
										{t('Program detail.Address')}
									</Typography>
									<Typography className="detail-address">
										<LocationOnOutlinedIcon aria-hidden="true" />{address}
									</Typography>
								</section>
							)}
						</div>
						<section className="detail-content-section detail-trainer" aria-labelledby="detail-trainer-title">
							<Typography component="h2" id="detail-trainer-title">
								{t('Program detail.Trainer')}
							</Typography>
							{program.memberData ? (
								<>
									<div className="detail-trainer-identity">
										<Avatar
											className="detail-trainer-avatar"
											src={
												program.memberData.memberImage
													? `${REACT_APP_API_URL}/${program.memberData.memberImage}`
													: '/img/profile/defaultUser.svg'
											}
											alt={trainerName || t('Program detail.Trainer')}
										>
											<PersonOutlineRoundedIcon aria-hidden="true" />
										</Avatar>
										<div>
											{trainerName && (
												<Typography component="h3">
													<Link href={'/trainer/detail?trainerId=' + program.memberId}>{trainerName}</Link>
												</Typography>
											)}
											{program.memberData.memberPhone && (
												<Typography className="detail-trainer-phone">{program.memberData.memberPhone}</Typography>
											)}
										</div>
									</div>
									{program.memberData.memberDesc?.trim() && (
										<Typography className="detail-description">{program.memberData.memberDesc}</Typography>
									)}
								</>
							) : (
								<Typography className="detail-description">{t('Program detail.Trainer unavailable')}</Typography>
							)}
							<Link passHref className="detail-trainer-link" href={'/trainer/detail?trainerId=' + program.memberId}>
								{t('Program detail.View trainer')}<ArrowForwardRoundedIcon aria-hidden="true" />
							</Link>
						</section>
					</div>
					{destinationPrograms.length > 0 && (
						<section className="detail-related-programs" aria-labelledby="detail-related-title">
							<Typography component="h2" id="detail-related-title">
								{t('Program detail.Similar programs')}
							</Typography>
							<div className="detail-related-grid">
								{destinationPrograms.map((item) => (
									<ProgramCard
										key={item._id}
										program={item}
										variant="related"
										likeProgramHandler={likeProgramHandler}
									/>
								))}
							</div>
						</section>
					)}
				</Stack>
			</div>
		</div>
	);
};

export default withLayoutFull(ProgramDetail);

const ProgramDetailImage = ({ image, alt }: { image: string; alt: string }) => {
	const [failedImage, setFailedImage] = useState('');
	const imageSrc = image ? `${REACT_APP_API_URL}/${image}` : '';

	return imageSrc && failedImage !== imageSrc ? (
		<img src={imageSrc} alt={alt} onError={() => setFailedImage(imageSrc)} />
	) : (
		<span className="detail-image-fallback" role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={!alt}>
			<FitnessCenterOutlinedIcon aria-hidden="true" />
		</span>
	);
};

interface ProgramDetailStateProps {
	state: 'loading' | 'error' | 'unavailable';
	onRetry?: () => Promise<unknown>;
}

const ProgramDetailState = ({ state, onRetry }: ProgramDetailStateProps) => {
	const { t } = useTranslation('common');
	const [retrying, setRetrying] = useState(false);
	const copy = {
		loading: ['Loading title', 'Loading description'],
		error: ['Error title', 'Error description'],
		unavailable: ['Unavailable title', 'Unavailable description'],
	}[state];
	const retryHandler = async () => {
		if (!onRetry || retrying) return;
		setRetrying(true);
		try {
			await onRetry();
		} catch {
			// The existing query owns the error state shown on this page.
		} finally {
			setRetrying(false);
		}
	};

	return (
		<div id="program-detail-page" className="detail-state-page">
			<div className="container">
				<section
					className="detail-state"
					role={state === 'loading' ? 'status' : 'alert'}
					aria-labelledby="detail-state-title"
				>
					<div className="detail-state-icon" aria-hidden="true">
						{state === 'loading' ? (
							<CircularProgress className="detail-state-spinner" />
						) : state === 'error' ? (
							<ErrorOutlineRoundedIcon />
						) : (
							<FitnessCenterOutlinedIcon />
						)}
					</div>
					<Typography component="h1" id="detail-state-title">
						{t(`Program detail.${copy[0]}`)}
					</Typography>
					<Typography>{t(`Program detail.${copy[1]}`)}</Typography>
					<div className="detail-state-actions">
						{state === 'error' && onRetry && (
							<Button onClick={retryHandler} disabled={retrying} aria-busy={retrying}>
								{t('Program detail.Retry')}
							</Button>
						)}
						<Link href="/program">{t('Program detail.Browse programs')}</Link>
					</div>
				</section>
			</div>
		</div>
	);
};
