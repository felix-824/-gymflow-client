import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { NextPage } from 'next';
import { Stack } from '@mui/material';
import useDeviceDetect from '../../libs/hooks/useDeviceDetect';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import MyPrograms from '../../libs/components/mypage/MyPrograms';
import MyFavorites from '../../libs/components/mypage/MyFavorites';
import RecentlyVisited from '../../libs/components/mypage/RecentlyVisited';
import AddProgram from '../../libs/components/mypage/AddNewProgram';
import MyProfile from '../../libs/components/mypage/MyProfile';
import MyArticles from '../../libs/components/mypage/MyArticles';
import { useMutation, useReactiveVar } from '@apollo/client';
import { userVar, authReadyVar, authErrorVar } from '../../apollo/store';
import MyMenu from '../../libs/components/mypage/MyMenu';
import WriteArticle from '../../libs/components/mypage/WriteArticle';
import EditArticle from '../../libs/components/mypage/EditArticle';
import TrainerSchedule from '../../libs/components/mypage/TrainerSchedule';
import MyBookings from '../../libs/components/mypage/MyBookings';
import TrainerReservations from '../../libs/components/mypage/TrainerReservations';
import TrainerDashboard from '../../libs/components/mypage/TrainerDashboard';
import { TrainerWorkspaceHeader, TrainerWorkspaceNavigation } from '../../libs/components/mypage/TrainerWorkspaceNavigation';
import { trainerReservationsAccess } from '../../libs/trainer-reservations';
import { myBookingsAccess } from '../../libs/my-bookings';
import { getJwtToken, updateUserInfo } from '../../libs/auth';
import { Button } from '@mui/material';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import MemberFollowers from '../../libs/components/member/MemberFollowers';
import MemberFollowings from '../../libs/components/member/MemberFollowings';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { Messages } from '../../libs/config';
import { LIKE_TARGET_MEMBER, SUBSCRIBE, UNSUBSCRIBE } from '../../apollo/user/mutation';
import { sweetErrorHandling, sweetMixinErrorAlert, sweetTopSmallSuccessAlert } from '../../libs/sweetAlert';

export const getStaticProps = async ({ locale }: any) => ({
	props: {
		...(await serverSideTranslations(locale, ['common'])),
	},
});

const MyPage: NextPage = () => {
	const { t } = useTranslation('common');
	const device = useDeviceDetect();
	const user = useReactiveVar(userVar);
const authReady = useReactiveVar(authReadyVar);
const authError = useReactiveVar(authErrorVar);
	const router = useRouter();
	const category: any = router.query?.category ?? 'myProfile';

	/** APOLLO REQUESTS **/
	const [subscribe] = useMutation(SUBSCRIBE);
    const [unsubscribe] = useMutation(UNSUBSCRIBE);
    const [likeTargetMember] = useMutation(LIKE_TARGET_MEMBER);

	/** LIFECYCLES **/
	useEffect(() => {
		if (router.isReady && category !== 'writeArticle' && category !== 'editArticle' && category !== 'myProfile' && category !== 'myFavorites' && category !== 'myBookings' && category !== 'trainerReservations' && category !== 'trainerDashboard' && authReady && !authError && !user._id) router.push('/').then();
	}, [user, authReady, authError, router, category]);

	/** HANDLERS **/
	const subscribeHandler = async (id: string, refetch: any, query: any) => {
	try {
	console.log('id: ', id);

	if (!id) throw new Error(Messages.error1);
	if (!user._id) throw new Error(Messages.error2);

	await subscribe({
		variables: {
			input: id,
		},
	});

	await sweetTopSmallSuccessAlert('Subscribed!', 800);
	await refetch({ input: query });
} catch (err: any) {
	sweetErrorHandling(err).then();
}
	};

	const unsubscribeHandler = async (id: string, refetch: any, query: any) => {
		try {
	if (!id) throw new Error(Messages.error1);
	if (!user._id) throw new Error(Messages.error2);

	await unsubscribe({
		variables: {
			input: id,
		},
	});

	await sweetTopSmallSuccessAlert('Unsubscribed!', 800);
	await refetch({ input: query });
 } catch (err: any) {
	sweetErrorHandling(err).then();
 }
};

const likeMemberHandler = async (id: string, refetch: any, query: any) => {
	try {
		if (!id) return;
		if (!user._id) throw new Error(Messages.error2);

		await likeTargetMember({
			variables: {
				input: id,
			},
		});

		await sweetTopSmallSuccessAlert('Success!', 800);
		await refetch({ input: query });
	} catch (err: any) {
		console.log('ERROR, likeMemberHandler:', err.message);
		sweetMixinErrorAlert(err.message).then();
	}
 };

	const redirectToMemberPageHandler = async (memberId: string) => {
		try {
			if (memberId === user?._id) await router.push(`/mypage?memberId=${memberId}`);
			else await router.push(`/member?memberId=${memberId}`);
		} catch (error) {
			await sweetErrorHandling(error);
		}
	};

	if (category === 'writeArticle') return <WriteArticle />;
	if (category === 'editArticle') return <EditArticle />;
	if (category === 'myPrograms') return <MyPrograms />;
	if (category === 'myFavorites') return <MyFavorites />;
	if (category === 'myBookings') return <MyBookings />;
	if (category === 'trainerReservations') return <TrainerReservations />;
	if (category === 'trainerDashboard') return <TrainerDashboard />;
	if (category === 'myProfile' && user.memberType === 'TRAINER') {
		const access = trainerReservationsAccess(authReady && router.isReady, authError, user);
		return <div className="trainer-profile-workspace">
			<TrainerWorkspaceHeader active="Profile" />
			{access === 'ready' ? <MyProfile key={user._id} trainerWorkspace /> : (
				<div className="trainer-profile-access" role={access === 'error' ? 'alert' : 'status'}>
					<p>{t(access === 'initializing' || access === 'error' ? `MyBookings.${access}` : `Trainer reservations.${access}`)}</p>
					{access === 'error' && <Button onClick={() => void updateUserInfo(getJwtToken())}>{t('MyBookings.Retry')}</Button>}
				</div>
			)}
			<TrainerWorkspaceNavigation active="Profile" mobile />
		</div>;
	}
	if (category === 'myProfile' && (user.memberType === 'USER' || !user._id)) {
		const access = myBookingsAccess(authReady && router.isReady, authError, user);
		return access === 'ready' ? (
			<MyProfile key={user._id} userProfile />
		) : (
			<div className="user-profile-access" role={access === 'error' ? 'alert' : 'status'}>
				<h1>{t('User profile.Title')}</h1>
				<p>{t(`MyBookings.${access}`)}</p>
				{access === 'error' && (
					<Button onClick={() => void updateUserInfo(getJwtToken())}>{t('MyBookings.Retry')}</Button>
				)}
				{access === 'guest' && (
					<Link href={{ pathname: '/account/join', query: { referrer: '/mypage?category=myProfile' } }}>
						{t('Login / Register')}
					</Link>
				)}
			</div>
		);
	}

	if (authError) return <p role='alert'>{authError}</p>;
if (!authReady || !user._id) return <p>Loading profile...</p>;
if (category === 'trainerSchedule') {
	return user.memberType === 'TRAINER' ? <TrainerSchedule key={user._id} /> : (
		<div className="schedule-content" role="alert">
			<p>{t('Trainer schedule.Trainer only')}</p>
			<Link passHref href="/mypage">{t('Trainer schedule.Back to my page')}</Link>
		</div>
	);
}
if (user.memberType === 'TRAINER' && category === 'addProgram') return <AddProgram />;
if (device === 'mobile') {
		return <div>MY PAGE{user.memberType === 'TRAINER' && (
			<><p><Link passHref href="/mypage?category=trainerSchedule" style={{ display: 'inline-flex', minHeight: 44, padding: '12px 20px' }}>{t('Trainer schedule.Schedule')}</Link></p>
			<p><Link passHref href="/mypage?category=trainerReservations" style={{ display: 'inline-flex', minHeight: 44, padding: '12px 20px' }}>{t('Trainer schedule.Reservations')}</Link></p></>
		)}{user.memberType === 'USER' && (
			<p><Link passHref href="/mypage?category=myBookings" style={{ display: 'inline-flex', minHeight: 44, padding: '12px 20px' }}>{t('MyBookings.Title')}</Link></p>
		)}</div>;
	} else {
		return (
			<div id="my-page" style={{ position: 'relative' }}>
				<div className="container">
					<Stack className={'my-page'}>
						<Stack className={'back-frame'}>
							<Stack className={'left-config'}>
								<MyMenu />
							</Stack>
							<Stack className="main-config" mb={'76px'}>
								<Stack className={'list-config'}>
									{category === 'addProgram' && <AddProgram />}
									{category === 'recentlyVisited' && <RecentlyVisited />}
									{category === 'myArticles' && <MyArticles />}
									{category === 'myProfile' && <MyProfile />}
									{category === 'followers' && (
										<MemberFollowers
											subscribeHandler={subscribeHandler}
											unsubscribeHandler={unsubscribeHandler}
											likeMemberHandler={likeMemberHandler}
											redirectToMemberPageHandler={redirectToMemberPageHandler}
										/>
									)}
									{category === 'followings' && (
										<MemberFollowings
											subscribeHandler={subscribeHandler}
											unsubscribeHandler={unsubscribeHandler}
											likeMemberHandler={likeMemberHandler}
											redirectToMemberPageHandler={redirectToMemberPageHandler}
										/>
									)}
								</Stack>
							</Stack>
						</Stack>
					</Stack>
				</div>
			</div>
		);
	}
};

export default withLayoutBasic(MyPage);
