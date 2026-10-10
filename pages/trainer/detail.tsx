import React, { ChangeEvent, useState } from 'react';
import { NextPage } from 'next';
import { Box, Pagination, Stack, Typography } from '@mui/material';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import useDeviceDetect from '../../libs/hooks/useDeviceDetect';
import ProgramBigCard from '../../libs/components/common/ProgramBigCard';
import { Program } from '../../libs/types/program/program';
import { Member } from '../../libs/types/member/member';
import { ProgramsInquiry } from '../../libs/types/program/program.input';
import { userVar } from '../../apollo/store';
import { GET_MEMBER, GET_PROGRAMS } from '../../apollo/user/query';
import { LIKE_TARGET_PROGRAM } from '../../apollo/user/mutation';
import { REACT_APP_API_URL } from '../../libs/config';
import { sweetMixinErrorAlert } from '../../libs/sweetAlert';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const TrainerDetail: NextPage = () => {
	const device = useDeviceDetect();
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const trainerId = typeof router.query.trainerId === 'string' ? router.query.trainerId : '';
	const [trainer, setTrainer] = useState<Member | null>(null);
	const [trainerPrograms, setTrainerPrograms] = useState<Program[]>([]);
	const [programTotal, setProgramTotal] = useState(0);
	const [page, setPage] = useState(1);
	const searchFilter: ProgramsInquiry = { page, limit: 9, search: { memberId: trainerId } };
	const [likeTargetProgram] = useMutation(LIKE_TARGET_PROGRAM);

	/** APOLLO REQUESTS **/
	const { loading, error } = useQuery(GET_MEMBER, {
		fetchPolicy: 'network-only',
		variables: { input: trainerId },
		skip: !router.isReady || !/^[a-f\d]{24}$/i.test(trainerId),
		onCompleted: (data) => setTrainer(data.getMember),
		onError: () => setTrainer(null),
	});
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
		setTrainer(null);
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
	if (device === 'mobile') return <div>TRAINER DETAIL MOBILE</div>;
	if (!router.isReady || loading) return <p>Loading trainer...</p>;
	if (error || !trainer || trainer.memberType !== 'TRAINER' || trainer.memberStatus !== 'ACTIVE')
		return <p role="alert">This trainer is unavailable.</p>;

	return (
		<Stack className="trainer-detail-page">
			<Stack className="container">
				<Stack className="trainer-info">
					<img
						src={trainer.memberImage ? REACT_APP_API_URL + '/' + trainer.memberImage : '/img/profile/defaultUser.svg'}
						alt="Trainer"
					/>
					<Box
						className="info"
						onClick={() => router.push(trainer._id === user._id ? '/mypage' : '/member?memberId=' + trainer._id)}
					>
						<strong>{trainer.memberFullName || trainer.memberNick}</strong>
						<Typography>{trainer.memberDesc}</Typography>
						<div>
							<img src="/img/icons/call.svg" alt="" />
							<span>{trainer.memberPhone}</span>
						</div>
					</Box>
				</Stack>
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
