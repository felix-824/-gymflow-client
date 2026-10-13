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
import TrainerSchedule from '../../libs/components/mypage/TrainerSchedule';
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
		if (authReady && !authError && !user._id) router.push('/').then();
	}, [user, authReady, authError, router]);

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
if (device === 'mobile') {
		return <div>MY PAGE{user.memberType === 'TRAINER' && (
			<p><Link passHref href="/mypage?category=trainerSchedule" style={{ display: 'inline-flex', minHeight: 44, padding: '12px 20px' }}>{t('Trainer schedule.Schedule')}</Link></p>
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
									{category === 'myPrograms' && <MyPrograms />}
									{category === 'myFavorites' && <MyFavorites />}
									{category === 'recentlyVisited' && <RecentlyVisited />}
									{category === 'myArticles' && <MyArticles />}
									{category === 'writeArticle' && <WriteArticle />}
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
