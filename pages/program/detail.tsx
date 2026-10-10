import React, { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Stack, Typography } from '@mui/material';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GroupsIcon from '@mui/icons-material/Groups';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import { Swiper, SwiperSlide } from 'swiper/react';
import SwiperCore, { Navigation, Pagination } from 'swiper';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withLayoutFull from '../../libs/components/layout/LayoutFull';
import useDeviceDetect from '../../libs/hooks/useDeviceDetect';
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
	const device = useDeviceDetect();
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
	if (device === 'mobile') return <div>PROGRAM DETAIL MOBILE</div>;
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

	return (
		<div id="program-detail-page">
			<div className="container">
				<Stack className="program-detail-config">
					<Stack className="program-info-config">
						<Stack className="info">
							<Stack className="left-box">
								<Typography className="title-main">{program.programName}</Typography>
								<Stack className="top-box" direction="row" spacing={2}>
									<Typography>{program.programLocation}</Typography>
									<Typography>{program.programType.replace(/_/g, ' ')}</Typography>
								</Stack>
								<Stack className="bottom-box" direction="row" spacing={3}>
									<Stack className="option" direction="row">
										<FitnessCenterIcon />
										<Typography>{program.programCategory.replace(/_/g, ' ')}</Typography>
									</Stack>
									<Stack className="option" direction="row">
										<AccessTimeIcon />
										<Typography>{program.programDuration} min/session</Typography>
									</Stack>
									<Stack className="option" direction="row">
										<GroupsIcon />
										<Typography>{program.programCapacity} participants/session</Typography>
									</Stack>
								</Stack>
							</Stack>
							<Stack className="right-box">
								<Stack direction="row" alignItems="center">
									<Typography>{program.programViews} views</Typography>
									<IconButton
										aria-label="Like program"
										disabled={liking}
										onClick={() => likeProgramHandler(user, program._id)}
									>
										{program.meLiked?.[0]?.myFavorite ? <FavoriteIcon color="primary" /> : <FavoriteBorderIcon />}
									</IconButton>
									<Typography>{program.programLikes}</Typography>
								</Stack>
								<Typography>₩{formatterStr(program.programPrice)} /session</Typography>
							</Stack>
						</Stack>
						<Stack className="images">
							<Stack className="main-image">
								<img src={REACT_APP_API_URL + '/' + slideImage} alt={program.programName} />
							</Stack>
							<Stack className="sub-images">
								{program.programImages.map((image, index) => (
									<Stack key={image} className="sub-img-box" onClick={() => setSlideImage(image)}>
										<img src={REACT_APP_API_URL + '/' + image} alt={'Program image ' + (index + 1)} />
									</Stack>
								))}
							</Stack>
						</Stack>
					</Stack>
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
