import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useReactiveVar } from '@apollo/client';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getAuthSessionId, updateUserInfo } from '../../auth';

const TuiEditor = dynamic(() => import('../community/Teditor'), { ssr: false });

const WriteArticle = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const ready = authReady && router.isReady && !authError && user._id && user.memberStatus === 'ACTIVE';
	return (
		<div id="write-article-page">
			<nav className="write-context" aria-label={t('Write article.Context')}>
				<Link href="/community">{t('Community')}</Link>
				<span aria-hidden="true">/</span>
				<span>{t('Write article.Write Article')}</span>
			</nav>
			<div className="write-article-column">
				<Link className="write-back" href="/community">
					<ArrowBackRoundedIcon aria-hidden="true" />
					{t('Write article.Back to Community')}
				</Link>
				<header className="write-intro">
					<p className="write-eyebrow">{t('Write article.COMMUNITY')}</p>
					<h1>{t('Write article.Share your story')}</h1>
					<p>{t('Write article.Intro')}</p>
				</header>
				{ready ? (
					<TuiEditor key={`${user._id}:${getAuthSessionId()}`} memberId={user._id} />
				) : (
					<div className="write-auth-state" role={authError ? 'alert' : 'status'}>
						<p>
							{t(
								`Write article.${
									authError ? 'Auth error' : !authReady || !router.isReady ? 'Restoring session' : 'Login required'
								}`,
							)}
						</p>
						{authError ? (
							<button type="button" onClick={() => void updateUserInfo()}>
								{t('Write article.Retry')}
							</button>
						) : (
							authReady &&
							router.isReady && (
								<Link href={{ pathname: '/account/join', query: { referrer: '/mypage?category=writeArticle' } }}>
									{t('Login')} / {t('Register')}
								</Link>
							)
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default WriteArticle;
