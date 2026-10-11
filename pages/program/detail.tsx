import React, { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
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
import { Swiper, SwiperSlide } from 'swiper/react';
import SwiperCore, { Navigation, Pagination } from 'swiper';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import withLayoutFull from '../../libs/components/layout/LayoutFull';
import ProgramBigCard from '../../libs/components/common/ProgramBigCard';
import { Program } from '../../libs/types/program/program';
import { ProgramType } from '../../libs/enums/program.enum';
import { Direction } from '../../libs/enums/common.enum';
import { GET_PROGRAM, GET_PROGRAMS } from '../../apollo/user/query';
import { LIKE_TARGET_PROGRAM } from '../../apollo/user/mutation';
import { userVar } from '../../apollo/store';
import { REACT_APP_API_URL } from '../../libs/config';
import { formatterStr } from '../../libs/utils';
import { sweetMixinErrorAlert } from '../../libs/sweetAlert';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

SwiperCore.use([Navigation, Pagination]);
export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const ProgramDetail: NextPage = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const user = useReactiveVar(userVar);
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
			if (id === programId) await getProgramRefetch();
			await getProgramsRefetch();
		} catch (err: any) {
			await sweetMixinErrorAlert(err.message);
		}
	};
	if (!router.isReady || loading)
		return (
			<Stack alignItems="center" p={8}>
				<CircularProgress />
			</Stack>
		);
	if (error || !program)
		return (
			<Stack alignItems="center" p={8}>
				<Typography role="alert">
					{error?.networkError ? 'Could not load the program. Please retry.' : 'This program is unavailable.'}
				</Typography>
				<Link href="/program">Browse Programs</Link>
			</Stack>
		);

	const isLiked = !!program.meLiked?.[0]?.myFavorite;
	const location = program.programType === ProgramType.ONLINE ? t('ONLINE') : t(program.programLocation);
	const address = program.programType !== ProgramType.ONLINE ? program.programAddress : '';

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
						</aside>
					</section>
					<Stack className="program-desc-config">
						<Stack className="left-config">
							<Stack className="prop-desc-config">
								<Stack className="top">
									<Typography className="title">Program Description</Typography>
									<Typography className="desc">{program.programDesc || 'No description provided.'}</Typography>
								</Stack>
								<Stack className="bottom">
									<Typography className="title">Program Details</Typography>
									<Stack className="info-box">
										<Stack className="left">
											<Box className="info">
												<Typography className="title">Category</Typography>
												<Typography className="data">{program.programCategory.replace(/_/g, ' ')}</Typography>
											</Box>
											<Box className="info">
												<Typography className="title">Duration</Typography>
												<Typography className="data">{program.programDuration} minutes/session</Typography>
											</Box>
											<Box className="info">
												<Typography className="title">Capacity</Typography>
												<Typography className="data">{program.programCapacity} participants/session</Typography>
											</Box>
										</Stack>
										<Stack className="right">
											<Box className="info">
												<Typography className="title">Price</Typography>
												<Typography className="data">₩{formatterStr(program.programPrice)} /session</Typography>
											</Box>
											<Box className="info">
												<Typography className="title">Type</Typography>
												<Typography className="data">{program.programType.replace(/_/g, ' ')}</Typography>
											</Box>
											<Box className="info">
												<Typography className="title">Location</Typography>
												<Typography className="data">{program.programLocation}</Typography>
											</Box>
										</Stack>
									</Stack>
								</Stack>
							</Stack>
							{program.programType !== ProgramType.ONLINE && (
								<Stack className="address-config">
									<Typography className="title">Physical Address</Typography>
									<Typography>{program.programAddress}</Typography>
								</Stack>
							)}
						</Stack>
						<Stack className="right-config">
							<Stack className="info-box">
								<Typography className="main-title">Your Trainer</Typography>
								<Stack className="image-info">
									<img
										className="member-image"
										src={
											program.memberData?.memberImage
												? REACT_APP_API_URL + '/' + program.memberData.memberImage
												: '/img/profile/defaultUser.svg'
										}
										alt="Trainer"
									/>
									<Stack className="name-phone-listings">
										<Link href={'/trainer/detail?trainerId=' + program.memberId}>
											<Typography className="name">
												{program.memberData?.memberFullName || program.memberData?.memberNick}
											</Typography>
										</Link>
										<Typography>{program.memberData?.memberPhone}</Typography>
										<Link href={'/trainer/detail?trainerId=' + program.memberId}>View Programs</Link>
									</Stack>
								</Stack>
							</Stack>
						</Stack>
					</Stack>
					{destinationPrograms.length > 0 && (
						<Stack className="similar-programs-config">
							<Typography className="title">Similar Programs</Typography>
							<Swiper slidesPerView={3} spaceBetween={20} navigation pagination={{ clickable: true }}>
								{destinationPrograms.map((item) => (
									<SwiperSlide key={item._id}>
										<ProgramBigCard program={item} likeProgramHandler={likeProgramHandler} />
									</SwiperSlide>
								))}
							</Swiper>
						</Stack>
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
