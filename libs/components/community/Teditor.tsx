import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useMutation } from '@apollo/client';
import { Editor } from '@toast-ui/react-editor';
import axios from 'axios';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { CREATE_BOARD_ARTICLE, UPDATE_BOARD_ARTICLE } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { BoardArticleCategory } from '../../enums/board-article.enum';
import { ensureAccessToken, getAuthSessionId, invalidateSession, isAuthenticationError } from '../../auth';
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_TYPES, REACT_APP_API_URL } from '../../config';
import {
	articleCharacterCount,
	articleUpdateError,
	isArticleContent,
	isArticleTitle,
	OwnedArticle,
	readOwnedArticle,
} from '../../article';
import { articleHtmlPlugin, sanitizeArticleHtml } from '../../article-html';
import { sweetConfirmAlert, sweetTopSmallSuccessAlert } from '../../sweetAlert';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/i18n/ko-kr';
import '@toast-ui/editor/dist/i18n/ru-ru';

const categories = [
	[BoardArticleCategory.FREE, 'Free'],
	[BoardArticleCategory.TIP, 'Tip'],
	[BoardArticleCategory.SUCCESS_STORY, 'Success Story'],
	[BoardArticleCategory.NEWS, 'News'],
] as const;
type FieldErrors = { title?: string; story?: string; cover?: string };
type EditorProps = { memberId: string } & (
	| { mode?: 'create' }
	| { mode: 'edit'; article: OwnedArticle; reloadArticle: () => Promise<OwnedArticle | null> }
);

const TuiEditor = (props: EditorProps) => {
	const { memberId } = props;
	const editing = props.mode === 'edit';
	const article = useRef<OwnedArticle | null>(
		editing ? readOwnedArticle(props.article, props.article?._id, memberId) : null,
	);
	const initial = useRef({
		title: article.current?.articleTitle ?? '',
		cover: article.current?.articleImage ?? '',
		story: '',
	});
	const reloadLock = useRef(false);
	const cancelLock = useRef(false);
	const { t, i18n } = useTranslation('common');
	const router = useRouter();
	const editorRef = useRef<Editor>(null);
	const titleRef = useRef<HTMLTextAreaElement>(null);
	const coverRef = useRef<HTMLInputElement>(null);
	const storyRef = useRef<HTMLDivElement>(null);
	const feedbackRef = useRef<HTMLDivElement>(null);
	const mounted = useRef(false);
	const epoch = useRef(0);
	const away = useRef(false);
	const submitLock = useRef(false);
	const pendingPublication = useRef(false);
	const confirmed = useRef(false);
	const uploadTask = useRef<{ controller: AbortController; epoch: number; kind: 'cover' | 'inline' } | null>(null);
	const sessionIdentity = useRef(getAuthSessionId()).current;
	const [category, setCategory] = useState(article.current?.articleCategory ?? BoardArticleCategory.FREE);
	const [title, setTitle] = useState(initial.current.title);
	const [story, setStory] = useState('');
	const [cover, setCover] = useState(initial.current.cover);
	const [uploading, setUploading] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [uncertain, setUncertain] = useState(false);
	const [errors, setErrors] = useState<FieldErrors>({});
	const [feedback, setFeedback] = useState('');
	const [conflict, setConflict] = useState(false);
	const [unavailable, setUnavailable] = useState(editing && !article.current);
	const unavailableRef = useRef(unavailable);
	unavailableRef.current = unavailable;
	const [reloading, setReloading] = useState(false);
	const [createBoardArticle] = useMutation(CREATE_BOARD_ARTICLE);
	const [updateBoardArticle] = useMutation(UPDATE_BOARD_ARTICLE);
	const sameAccount = () =>
		mounted.current &&
		authReadyVar() &&
		!authErrorVar() &&
		userVar()._id === memberId &&
		userVar().memberStatus === 'ACTIVE' &&
		getAuthSessionId() === sessionIdentity &&
		Boolean(sessionIdentity);
	const currentAccount = () => !away.current && sameAccount();
	const currentRequest = (requestEpoch: number) => currentAccount() && requestEpoch === epoch.current;

	useLayoutEffect(() => {
		mounted.current = true;
		const editor = editorRef.current?.getInstance();
		if (article.current && editor) {
			// setHTML parses immediately: sanitize before entering the native editor.
			editor.setHTML(sanitizeArticleHtml(article.current.articleContent), false);
			initial.current.story = editor.getHTML();
			setStory(initial.current.story);
		}
		const leave = () => {
			away.current = true;
			epoch.current++;
			uploadTask.current?.controller.abort();
			uploadTask.current = null;
			if (confirmed.current) return;
			if (editing) {
				reloadLock.current = false;
				setReloading(false);
			}
			setUploading(false);
			if (pendingPublication.current) {
				setPublishing(false);
				setUncertain(true);
				setFeedback('Unconfirmed');
			}
		};
		const resume = () => {
			away.current = false;
		};
		router.events.on('routeChangeStart', leave);
		router.events.on('routeChangeComplete', resume);
		router.events.on('routeChangeError', resume);
		const input = storyRef.current?.querySelector<HTMLElement>('.toastui-editor-ww-container [contenteditable="true"]');
		input?.setAttribute('role', 'textbox');
		input?.setAttribute('aria-multiline', 'true');
		input?.setAttribute('aria-labelledby', 'write-story-label');
		input?.setAttribute('aria-describedby', 'write-story-help write-story-error');
		return () => {
			mounted.current = false;
			epoch.current++;
			uploadTask.current?.controller.abort();
			// The Toast UI React wrapper does not dispose its instance on unmount.
			editor?.destroy();
			router.events.off('routeChangeStart', leave);
			router.events.off('routeChangeComplete', resume);
			router.events.off('routeChangeError', resume);
		};
	}, [router.events, editing]);
	useEffect(() => {
		storyRef.current?.querySelector('[role="textbox"]')?.setAttribute('aria-invalid', String(Boolean(errors.story)));
	}, [errors.story]);
	useEffect(() => {
		if (editing && feedback && !confirmed.current) {
			feedbackRef.current?.focus();
			feedbackRef.current?.scrollIntoView({ block: 'center' });
		}
	}, [editing, feedback]);

	const readStory = () => editorRef.current?.getInstance().getHTML() ?? story;
	const articleHref = article.current
		? `/community/detail?articleCategory=${article.current.articleCategory}&id=${article.current._id}`
		: '/community';
	const cancel = async () => {
		if (!currentAccount() || submitLock.current || reloadLock.current || cancelLock.current) return;
		cancelLock.current = true;
		const requestEpoch = epoch.current;
		try {
			const dirty =
				title !== initial.current.title ||
				cover !== initial.current.cover ||
				readStory() !== initial.current.story ||
				Boolean(uploadTask.current);
			if (dirty && !(await sweetConfirmAlert(t('Edit article.Discard changes')))) return;
			if (currentRequest(requestEpoch) && !submitLock.current && !reloadLock.current) await router.push(articleHref);
		} catch {
			if (currentRequest(requestEpoch)) setFeedback('Navigation failed');
		} finally {
			cancelLock.current = false;
		}
	};
	const reloadArticle = async () => {
		if (props.mode !== 'edit' || !currentAccount() || submitLock.current || reloadLock.current || uploadTask.current)
			return;
		reloadLock.current = true;
		const requestEpoch = epoch.current;
		try {
			if (!(await sweetConfirmAlert(t('Edit article.Reload confirmation'))) || !currentRequest(requestEpoch)) return;
			setReloading(true);
			const latest = await props.reloadArticle();
			if (!currentRequest(requestEpoch)) return;
			if (!latest) {
				setUnavailable(true);
				setFeedback('Unavailable');
				return;
			}
			const owned = readOwnedArticle(latest, article.current?._id ?? '', memberId);
			if (!owned) throw new Error('Invalid owner article');
			const editor = editorRef.current?.getInstance();
			if (!editor) return;
			editor.setHTML(sanitizeArticleHtml(owned.articleContent), false);
			const html = editor.getHTML();
			article.current = owned;
			initial.current = { title: owned.articleTitle, cover: owned.articleImage ?? '', story: html };
			setCategory(owned.articleCategory);
			setTitle(initial.current.title);
			setCover(initial.current.cover);
			setStory(html);
			setErrors({});
			setConflict(false);
			setUncertain(false);
			setFeedback('');
		} catch (error) {
			if (!currentRequest(requestEpoch)) return;
			const kind = articleUpdateError(error);
			if (kind === 'auth') void invalidateSession();
			else if (kind === 'unavailable') {
				setUnavailable(true);
				setFeedback('Unavailable');
			} else setFeedback('Reload failed');
		} finally {
			if (currentRequest(requestEpoch)) {
				reloadLock.current = false;
				setReloading(false);
			}
		}
	};
	const uploadImage = async (file: File, kind: 'cover' | 'inline', callback?: (url: string) => void) => {
		if (!currentAccount() || uploadTask.current || submitLock.current || reloadLock.current || unavailableRef.current)
			return;
		const field = kind === 'cover' ? 'cover' : 'story';
		if (!IMAGE_UPLOAD_TYPES.includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
			setErrors((previous) => ({ ...previous, [field]: 'Image format' }));
			return;
		}
		if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
			setErrors((previous) => ({ ...previous, [field]: 'Image size' }));
			return;
		}
		const task = { controller: new AbortController(), epoch: epoch.current, kind };
		uploadTask.current = task;
		setUploading(true);
		setErrors((previous) => ({ ...previous, [field]: undefined }));
		try {
			const data = new FormData();
			data.append(
				'operations',
				JSON.stringify({
					query:
						'mutation ImageUploader($file: Upload!, $target: String!) { imageUploader(file: $file, target: $target) }',
					variables: { file: null, target: 'article' },
				}),
			);
			data.append('map', JSON.stringify({ '0': ['variables.file'] }));
			data.append('0', file);
			const accessToken = await ensureAccessToken(true);
			if (uploadTask.current !== task || !currentRequest(task.epoch)) return;
			const response = await axios.post(process.env.REACT_APP_API_GRAPHQL_URL as string, data, {
				signal: task.controller.signal,
				headers: { 'apollo-require-preflight': true, Authorization: `Bearer ${accessToken}` },
			});
			if (uploadTask.current !== task || !currentRequest(task.epoch)) return;
			if (response.data.errors?.length) {
				if (isAuthenticationError({ graphQLErrors: response.data.errors })) invalidateSession();
				throw new Error('Upload failed');
			}
			const image = response.data.data?.imageUploader;
			if (typeof image !== 'string' || !image) throw new Error('Upload failed');
			if (kind === 'cover') setCover(image);
			else callback?.(`${REACT_APP_API_URL}/${image}`);
		} catch (error) {
			if (uploadTask.current === task && currentRequest(task.epoch)) {
				if (isAuthenticationError(error)) invalidateSession();
				else setErrors((previous) => ({ ...previous, [field]: 'Upload failed' }));
			}
		} finally {
			if (uploadTask.current === task) {
				uploadTask.current = null;
				if (currentRequest(task.epoch)) setUploading(false);
			}
		}
	};
	const removeCover = () => {
		if (!currentAccount() || submitLock.current) return;
		if (uploadTask.current?.kind === 'cover') {
			uploadTask.current.controller.abort();
			uploadTask.current = null;
			setUploading(false);
		}
		setCover('');
		setErrors((previous) => ({ ...previous, cover: undefined }));
	};
	const publish = async (event: React.FormEvent) => {
		event.preventDefault();
		if (
			!currentAccount() ||
			submitLock.current ||
			uploadTask.current ||
			reloadLock.current ||
			uncertain ||
			conflict ||
			unavailable
		)
			return;
		if (editing && !article.current) return;
		// Synchronous protection covers two clicks before React renders the pending state.
		submitLock.current = true;
		const html = readStory();
		setStory(html);
		const nextErrors: FieldErrors = {};
		if (!isArticleTitle(title)) nextErrors.title = 'Title error';
		if (!isArticleContent(html)) nextErrors.story = 'Story error';
		setErrors(nextErrors);
		if (nextErrors.title || nextErrors.story) {
			const field = nextErrors.title
				? titleRef.current
				: storyRef.current?.querySelector<HTMLElement>('[role="textbox"]');
			field?.focus();
			field?.scrollIntoView({ block: 'center' });
			submitLock.current = false;
			return;
		}
		setPublishing(true);
		pendingPublication.current = true;
		setFeedback('');
		const requestEpoch = epoch.current;
		try {
			const response = editing
				? await updateBoardArticle({
						variables: {
							input: {
								_id: article.current!._id,
								expectedRevision: article.current!.articleRevision,
								articleTitle: title,
								articleContent: html,
								articleImage: cover || null,
							},
						},
						fetchPolicy: 'no-cache',
						context: { handleErrorLocally: true },
				  })
				: await createBoardArticle({
						variables: {
							input: {
								articleCategory: category,
								articleTitle: title,
								articleContent: html,
								...(cover ? { articleImage: cover } : {}),
							},
						},
						fetchPolicy: 'no-cache',
				  });
			if (!sameAccount()) return;
			if (editing) {
				const updated = response.data?.updateBoardArticle;
				if (updated?._id !== article.current!._id || updated.articleRevision !== article.current!.articleRevision + 1)
					throw new Error('Save unconfirmed');
				article.current = { ...article.current!, articleRevision: updated.articleRevision };
			} else if (!response.data?.createBoardArticle?._id) throw new Error('Publication unconfirmed');
			confirmed.current = true;
			pendingPublication.current = false;
			setUncertain(false);
			setFeedback(editing ? 'Saved' : 'Published');
			setPublishing(false);
			if (currentRequest(requestEpoch)) {
				await sweetTopSmallSuccessAlert(t(editing ? 'Edit article.Saved' : 'Write article.Published'), 700);
				if (currentRequest(requestEpoch)) await router.push(editing ? articleHref : '/mypage?category=myArticles');
			}
		} catch (error) {
			if (sameAccount() && !confirmed.current) {
				const kind = editing ? articleUpdateError(error) : 'unknown';
				if (isAuthenticationError(error) || kind === 'auth') invalidateSession();
				else if (kind === 'conflict') {
					setConflict(true);
					setUncertain(false);
					setFeedback('Conflict');
				} else if (kind === 'unavailable') {
					setUnavailable(true);
					setFeedback('Unavailable');
				} else if (kind === 'rejected') {
					setUncertain(false);
					setFeedback('Save failed');
				} else {
					setUncertain(true);
					setFeedback('Unconfirmed');
				}
			}
		} finally {
			pendingPublication.current = false;
			if (sameAccount() && !confirmed.current) {
				submitLock.current = false;
				setPublishing(false);
			}
		}
	};
	const busy = uploading || publishing || reloading;
	const readOnly =
		publishing || confirmed.current || (editing && (unavailable || reloading || pendingPublication.current));
	return (
		<form className="write-article-form" onSubmit={(event) => void publish(event)} noValidate aria-busy={busy}>
			<fieldset className="write-category" disabled={readOnly || editing}>
				<legend>{t('Write article.Category')}</legend>
				{editing ? (
					<div className="write-category-readonly">
						<strong>{t(`Write article.${categories.find(([value]) => value === category)?.[1]}`)}</strong>
						<span>
							<LockOutlinedIcon aria-hidden="true" />
							{t('Edit article.Category locked')}
						</span>
					</div>
				) : (
					<div className="write-category-options">
						{categories.map(([value, label]) => (
							<label key={value}>
								<input
									type="radio"
									name="articleCategory"
									value={value}
									checked={category === value}
									onChange={() => setCategory(value)}
								/>
								<span>{t(`Write article.${label}`)}</span>
							</label>
						))}
					</div>
				)}
			</fieldset>
			<div className="write-title-field">
				<div className="write-field-heading">
					<label htmlFor="write-title">{t('Write article.Title')}</label>
					<span>{t('Write article.Title limit')}</span>
				</div>
				<textarea
					id="write-title"
					ref={titleRef}
					value={title}
					rows={2}
					placeholder={t('Write article.Title placeholder')}
					disabled={readOnly}
					onChange={(event) => {
						setTitle(event.target.value);
						setErrors((previous) => ({ ...previous, title: undefined }));
					}}
					aria-invalid={Boolean(errors.title)}
					aria-describedby="write-title-error write-title-count"
				/>
				<div id="write-title-count" className="write-title-count">
					{articleCharacterCount(title)} / 50
				</div>
				<p id="write-title-error" className="write-field-error" role={errors.title ? 'alert' : undefined}>
					{errors.title && t(`Write article.${errors.title}`)}
				</p>
			</div>
			<section className="write-cover-field" aria-labelledby="write-cover-label">
				<div className="write-field-heading">
					<h2 id="write-cover-label">
						{t('Write article.Cover photo')} <span>({t('Write article.Optional')})</span>
					</h2>
					<span>JPEG / PNG</span>
				</div>
				<input
					ref={coverRef}
					type="file"
					className="write-file-input"
					accept={IMAGE_UPLOAD_ACCEPT}
					aria-label={t('Write article.Upload cover')}
					disabled={busy || confirmed.current}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (file) void uploadImage(file, 'cover');
					}}
				/>
				<div className={`write-cover${cover ? ' has-image' : ''}`}>
					{cover ? (
						<>
							<img src={`${REACT_APP_API_URL}/${cover}`} alt={t('Write article.Cover preview')} />
							<div className="write-cover-actions">
								<button type="button" onClick={() => coverRef.current?.click()} disabled={busy || confirmed.current}>
									<AddPhotoAlternateOutlinedIcon aria-hidden="true" />
									{t('Write article.Replace')}
								</button>
								<button
									type="button"
									onClick={removeCover}
									disabled={readOnly}
									aria-label={t('Write article.Remove cover')}
								>
									<DeleteOutlineRoundedIcon aria-hidden="true" />
									<span>{t('Write article.Remove')}</span>
								</button>
							</div>
						</>
					) : (
						<button
							className="write-cover-upload"
							type="button"
							onClick={() => coverRef.current?.click()}
							disabled={busy || confirmed.current}
						>
							<AddPhotoAlternateOutlinedIcon aria-hidden="true" />
							<strong>{t('Write article.Upload cover')}</strong>
							<span>JPEG / PNG</span>
						</button>
					)}
				</div>
				{uploading && (
					<p className="write-upload-status" role="status">
						{t('Write article.Uploading')}
					</p>
				)}
				<p className="write-field-error" role={errors.cover ? 'alert' : undefined}>
					{errors.cover && t(`Write article.${errors.cover}`)}
				</p>
			</section>
			<section className={`write-story-field${readOnly ? ' is-publishing' : ''}`} aria-labelledby="write-story-label">
				<div className="write-field-heading">
					<h2 id="write-story-label">{t('Write article.Story')}</h2>
					<span>{t('Write article.Story limit')}</span>
				</div>
				<div ref={storyRef} className="write-story-editor" {...(editing && readOnly ? { inert: '' } : {})}>
					<Editor
						ref={editorRef}
						initialValue=""
						initialEditType="wysiwyg"
						previewStyle="vertical"
						height="auto"
						minHeight="400px"
						placeholder={t('Write article.Story placeholder')}
						hideModeSwitch={true}
						usageStatistics={false}
						language={i18n.language === 'kr' ? 'ko-KR' : i18n.language === 'ru' ? 'ru-RU' : 'en-US'}
						customHTMLSanitizer={sanitizeArticleHtml}
						plugins={[articleHtmlPlugin]}
						toolbarItems={[
							['heading', 'bold', 'italic', 'strike'],
							['quote', 'ul', 'ol'],
							['link', 'image', 'table', 'code'],
						]}
						onChange={() => {
							if (!currentAccount() || submitLock.current) return;
							setStory(readStory());
							setErrors((previous) => ({ ...previous, story: undefined }));
						}}
						hooks={{
							addImageBlobHook: async (file, callback) => {
								await uploadImage(file as File, 'inline', callback);
								return false;
							},
						}}
					/>
				</div>
				<p id="write-story-help" className="write-story-help">
					{t('Write article.Formatting limit')}
				</p>
				<p id="write-story-error" className="write-field-error" role={errors.story ? 'alert' : undefined}>
					{errors.story && t(`Write article.${errors.story}`)}
				</p>
				<p className="write-story-count">
					{t('Write article.Character count', { count: articleCharacterCount(story) })}
				</p>
			</section>
			{feedback && (
				<div ref={feedbackRef} tabIndex={-1} className="write-feedback" role={confirmed.current ? 'status' : 'alert'}>
					<p>{t(`${editing ? 'Edit article' : 'Write article'}.${feedback}`)}</p>
					{editing ? (
						<>
							{(conflict || uncertain) && !unavailable && (
								<button type="button" onClick={() => void reloadArticle()} disabled={busy}>
									{t('Edit article.Reload latest')}
								</button>
							)}
							<Link href={articleHref} target="_blank" rel="noopener noreferrer">
								{t('Edit article.View article')}
							</Link>
						</>
					) : (
						<Link
							href="/mypage?category=myArticles"
							target="_blank"
							rel="noopener noreferrer"
							onClick={() => {
								if (!pendingPublication.current && !confirmed.current) setUncertain(false);
							}}
						>
							{t(`Write article.${confirmed.current ? 'My Articles' : 'Check My Articles'}`)}
						</Link>
					)}
				</div>
			)}
			<div className="write-publish-row">
				<p className="write-publish-note">
					<PublicOutlinedIcon aria-hidden="true" />
					{t(editing ? 'Edit article.Save note' : 'Write article.Publish note')}
				</p>
				<div className="write-publish-actions">
					{editing ? (
						<button
							type="button"
							className="write-cancel"
							disabled={publishing || reloading || confirmed.current || pendingPublication.current}
							onClick={() => void cancel()}
						>
							{t('Write article.Cancel')}
						</button>
					) : (
						<Link href="/community" className="write-cancel">
							{t('Write article.Cancel')}
						</Link>
					)}
					<button
						type="submit"
						className="write-publish"
						disabled={busy || uncertain || conflict || unavailable || confirmed.current}
					>
						{t(
							editing
								? `Edit article.${publishing ? 'Saving' : 'Save Changes'}`
								: `Write article.${publishing ? 'Publishing' : 'Publish Article'}`,
						)}
						<SendRoundedIcon aria-hidden="true" />
					</button>
				</div>
			</div>
		</form>
	);
};

export default TuiEditor;
