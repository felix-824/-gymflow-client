import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useApolloClient, useReactiveVar } from '@apollo/client';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { GET_MY_BOARD_ARTICLE } from '../../../apollo/user/query';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { getJwtToken, invalidateSession, updateUserInfo } from '../../auth';
import { articleUpdateError, OwnedArticle, readOwnedArticle } from '../../article';

const TuiEditor = dynamic(() => import('../community/Teditor'), { ssr: false });

const EditArticle = () => {
	const { t } = useTranslation('common');
	const router = useRouter();
	const client = useApolloClient();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const articleId = typeof router.query.articleId === 'string' ? router.query.articleId.toLowerCase() : '';
	const token = getJwtToken();
	const ready = Boolean(
		authReady && router.isReady && !authError && user._id && user.memberStatus === 'ACTIVE' && token,
	);
	const scope = `${ready}:${user._id}:${token}:${articleId}`;
	const currentScope = useRef(scope);
	currentScope.current = scope;
	const request = useRef(0);
	const [loaded, setLoaded] = useState<{
		scope: string;
		state: 'loading' | 'ready' | 'unavailable' | 'error';
		article?: OwnedArticle;
	} | null>(null);

	const queryArticle = useCallback(async () => {
		if (!/^[a-f\d]{24}$/i.test(articleId)) return null;
		const { data } = await client.query({
			query: GET_MY_BOARD_ARTICLE,
			variables: { input: articleId },
			fetchPolicy: 'no-cache',
			context: { queryDeduplication: false, handleErrorLocally: true },
		});
		return readOwnedArticle(data?.getMyBoardArticle, articleId, user._id);
	}, [articleId, client, user._id]);

	const loadArticle = useCallback(async () => {
		const attempt = ++request.current;
		const isCurrent = () =>
			attempt === request.current &&
			currentScope.current === scope &&
			getJwtToken() === token &&
			authReadyVar() &&
			!authErrorVar() &&
			userVar()._id === user._id &&
			userVar().memberStatus === 'ACTIVE';
		setLoaded({ scope, state: 'loading' });
		try {
			const article = await queryArticle();
			if (isCurrent()) setLoaded({ scope, state: article ? 'ready' : 'unavailable', article: article ?? undefined });
		} catch (error) {
			if (!isCurrent()) return;
			const kind = articleUpdateError(error);
			if (kind === 'auth') void invalidateSession();
			else setLoaded({ scope, state: kind === 'unavailable' ? 'unavailable' : 'error' });
		}
	}, [queryArticle, scope, token, user._id]);

	useEffect(() => {
		if (ready) void loadArticle();
		return () => {
			request.current++;
		};
	}, [ready, loadArticle]);

	const state = loaded?.scope === scope ? loaded.state : 'loading';
	return (
		<div id="write-article-page" className="edit-article-page">
			<nav className="write-context" aria-label={t('Edit article.Context')}>
				<Link href="/community" passHref>
					{t('Community')}
				</Link>
				<span aria-hidden="true">/</span>
				<span>{t('Edit article.Edit Article')}</span>
			</nav>
			<div className="write-article-column">
				<Link className="write-back" href="/community" passHref>
					<ArrowBackRoundedIcon aria-hidden="true" />
					{t('Write article.Back to Community')}
				</Link>
				<header className="write-intro">
					<p className="write-eyebrow">{t('Write article.COMMUNITY')}</p>
					<h1>{t('Edit article.Edit your story')}</h1>
					<p>{t('Edit article.Intro')}</p>
				</header>
				{!ready ? (
					<div className="write-auth-state" role={authError ? 'alert' : 'status'}>
						<p>
							{t(
								`Write article.${
									authError ? 'Auth error' : !authReady || !router.isReady ? 'Restoring session' : 'Login required'
								}`,
							)}
						</p>
						{authError ? (
							<button type="button" onClick={() => void updateUserInfo(getJwtToken())}>
								{t('Write article.Retry')}
							</button>
						) : (
							authReady &&
							router.isReady && (
								<Link
									href={{
										pathname: '/account/join',
										query: { referrer: `/mypage?category=editArticle&articleId=${articleId}` },
									}}
								>
									{t('Login')} / {t('Register')}
								</Link>
							)
						)}
					</div>
				) : state === 'ready' && loaded?.article ? (
					<TuiEditor
						key={scope}
						memberId={user._id}
						mode="edit"
						article={loaded.article}
						reloadArticle={queryArticle}
					/>
				) : (
					<div
						className="write-auth-state"
						role={state === 'loading' ? 'status' : 'alert'}
						aria-busy={state === 'loading'}
					>
						<p>
							{t(
								`Edit article.${
									state === 'loading' ? 'Loading' : state === 'unavailable' ? 'Unavailable' : 'Load failed'
								}`,
							)}
						</p>
						{state === 'error' && (
							<button type="button" onClick={() => void loadArticle()}>
								{t('Write article.Retry')}
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default EditArticle;
