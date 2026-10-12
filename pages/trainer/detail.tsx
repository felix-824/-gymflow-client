import React, { ChangeEvent, useState } from 'react';
import { NextPage } from 'next';
import { Button, CircularProgress, Pagination, Stack } from '@mui/material';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import ProgramBigCard from '../../libs/components/common/ProgramBigCard';
import { Program } from '../../libs/types/program/program';
import { Member } from '../../libs/types/member/member';
import { ProgramsInquiry } from '../../libs/types/program/program.input';
import { authReadyVar } from '../../apollo/store';
import { GET_MEMBER, GET_PROGRAMS } from '../../apollo/user/query';
import { LIKE_TARGET_PROGRAM } from '../../apollo/user/mutation';
import { REACT_APP_API_URL } from '../../libs/config';
import { sweetMixinErrorAlert } from '../../libs/sweetAlert';
import { formatterStr } from '../../libs/utils';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const TrainerDetail: NextPage = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const authReady = useReactiveVar(authReadyVar);
	const trainerId = typeof router.query.trainerId === 'string' ? router.query.trainerId : '';
	const validTrainerId = /^[a-f\d]{24}$/i.test(trainerId);
	const [failedImage, setFailedImage] = useState('');
	const [trainerPrograms, setTrainerPrograms] = useState<Program[]>([]);
	const [programTotal, setProgramTotal] = useState(0);
	const [page, setPage] = useState(1);
	const searchFilter: ProgramsInquiry = { page, limit: 9, search: { memberId: trainerId } };
	const [likeTargetProgram] = useMutation(LIKE_TARGET_PROGRAM);

	/** APOLLO REQUESTS **/
	const {
		data,
		loading,
		error,
		refetch: getMemberRefetch,
	} = useQuery(GET_MEMBER, {
		fetchPolicy: 'network-only',
		variables: { input: trainerId },
		skip: !router.isReady || !validTrainerId || !authReady,
		notifyOnNetworkStatusChange: true,
	});
	const trainer: Member | null = data?.getMember?._id === trainerId ? data.getMember : null;
	const {
		loading: programsLoading,
		error: programsError,
		refetch: getProgramsRefetch,
	} = useQuery(GET_PROGRAMS, {
		fetchPolicy: 'network-only',
		variables: { input: searchFilter },
		skip:
			!trainer || trainer._id !== trainerId || trainer.memberType !== 'TRAINER' || trainer.memberStatus !== 'ACTIVE',
		onCompleted: (data) => {
			setTrainerPrograms(data.getPrograms?.list ?? []);
			setProgramTotal(data.getPrograms?.metaCounter?.[0]?.total ?? 0);
		},
	});
	React.useEffect(() => {
		setTrainerPrograms([]);
		setProgramTotal(0);
		setPage(1);
	}, [trainerId]);

	/** HANDLERS **/
	const likeProgramHandler = async (member: { _id: string }, id: string) => {
		try {
			if (!member._id) throw new Error('Please login first!');
			await likeTargetProgram({ variables: { input: id } });
			await getProgramsRefetch();
		} catch (err: any) {
			await sweetMixinErrorAlert(err.message);
		}
	};
	const programPaginationChangeHandler = (_: ChangeEvent<unknown>, value: number) => setPage(value);
	const breadcrumb = (
		<nav className="trainer-detail-breadcrumb" aria-label={t('Trainer detail.Back to trainers')}>
			<Link href="/trainer" passHref>
				<ArrowBackRoundedIcon aria-hidden={true} fontSize="small" />
				{t('Trainers')}
			</Link>
		</nav>
	);
	const pending = !router.isReady || (validTrainerId && (!authReady || (loading && !trainer)));
	if (pending || error || !trainer || trainer.memberType !== 'TRAINER' || trainer.memberStatus !== 'ACTIVE') {
		return (
			<Stack className="trainer-detail-page">
				<div className="trainer-detail-container">
					{breadcrumb}
					<section className="trainer-detail-state" role={pending ? 'status' : 'alert'} aria-busy={pending}>
						{pending && <CircularProgress size={28} aria-hidden={true} />}
						<h1>
							{t(pending ? 'Trainer detail.Loading' : error ? 'Trainer detail.Error' : 'Trainer detail.Unavailable')}
						</h1>
						{!pending && error && validTrainerId && (
							<Button onClick={() => void getMemberRefetch().catch(() => undefined)}>
								{t('Trainer discovery.Retry')}
							</Button>
						)}
					</section>
				</div>
			</Stack>
		);
	}
	const name = trainer.memberFullName?.trim() || trainer.memberNick;
	const image = trainer.memberImage ? `${REACT_APP_API_URL}/${trainer.memberImage}` : '';
	const stats = [
		{ label: t('Trainer discovery.Programs'), value: trainer.memberPrograms },
		{ label: t('Trainer discovery.Followers'), value: trainer.memberFollowers ?? 0 },
		{ label: t('Trainer detail.Following'), value: trainer.memberFollowings ?? 0 },
		{ label: t('Trainer detail.Profile views'), value: trainer.memberViews },
	];

	return (
		<Stack className="trainer-detail-page">
			<Stack className="container trainer-detail-container">
				{breadcrumb}
				<section className="trainer-detail-hero" aria-labelledby="trainer-detail-title">
					<img
						className="trainer-detail-image"
						src={image && failedImage !== image ? image : '/img/profile/defaultUser.svg'}
						alt={name}
						width={240}
						height={260}
						onError={() => setFailedImage(image)}
					/>
					<div className="trainer-detail-identity">
						<h1 id="trainer-detail-title">{name}</h1>
						{trainer.memberNick && <p className="trainer-detail-nickname">{trainer.memberNick}</p>}
						{trainer.memberAddress?.trim() && (
							<p className="trainer-detail-address">
								<LocationOnOutlinedIcon aria-hidden={true} />
								{trainer.memberAddress}
							</p>
						)}
						<dl className="trainer-detail-stats">
							{stats.map(({ label, value }) => (
								<div key={label}>
									<dt>{label}</dt>
									<dd>{formatterStr(value)}</dd>
								</div>
							))}
						</dl>
					</div>
				</section>
				<section className="trainer-detail-about" aria-labelledby="trainer-about-title">
					<h2 id="trainer-about-title">{t('Trainer detail.About')}</h2>
					<p>{trainer.memberDesc?.trim() || t('Trainer detail.Empty about')}</p>
				</section>
				<Stack className="trainer-home-list">
					{programsLoading && <p>Loading programs...</p>}
					{programsError && <p role="alert">Could not load programs.</p>}
					<Stack className="card-wrap">
						{trainerPrograms.map((program) => (
							<div className="wrap-main" key={program._id}>
								<ProgramBigCard program={program} likeProgramHandler={likeProgramHandler} />
							</div>
						))}
					</Stack>
					<Stack className="pagination">
						{programTotal > 0 ? (
							<>
								<Pagination
									page={page}
									count={Math.ceil(programTotal / searchFilter.limit)}
									onChange={programPaginationChangeHandler}
									shape="circular"
									color="primary"
								/>
								<span>Total {programTotal} programs available</span>
							</>
						) : (
							!programsLoading && (
								<div className="no-data">
									<p>No programs found!</p>
								</div>
							)
						)}
					</Stack>
				</Stack>
			</Stack>
		</Stack>
	);
};

export default withLayoutBasic(TrainerDetail);
