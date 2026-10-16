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
import { CREATE_BOARD_ARTICLE } from '../../../apollo/user/mutation';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { BoardArticleCategory } from '../../enums/board-article.enum';
import { getJwtToken, invalidateSession, isAuthenticationError } from '../../auth';
import { REACT_APP_API_URL } from '../../config';
import { articleCharacterCount, isArticleContent, isArticleTitle } from '../../article';
import { articleHtmlPlugin, sanitizeArticleHtml } from '../../article-html';
import { sweetTopSmallSuccessAlert } from '../../sweetAlert';
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

const TuiEditor = ({ memberId }: { memberId: string }) => {
	const { t, i18n } = useTranslation('common');
	const router = useRouter();
	const editorRef = useRef<Editor>(null);
	const titleRef = useRef<HTMLTextAreaElement>(null);
	const coverRef = useRef<HTMLInputElement>(null);
	const storyRef = useRef<HTMLDivElement>(null);
	const mounted = useRef(false);
	const epoch = useRef(0);
	const away = useRef(false);
	const submitLock = useRef(false);
	const pendingPublication = useRef(false);
	const confirmed = useRef(false);
	const uploadTask = useRef<{ controller: AbortController; epoch: number; kind: 'cover' | 'inline' } | null>(null);
	const token = useRef(getJwtToken()).current;
	const [category, setCategory] = useState(BoardArticleCategory.FREE);
	const [title, setTitle] = useState('');
	const [story, setStory] = useState('');
	const [cover, setCover] = useState('');
	const [uploading, setUploading] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [uncertain, setUncertain] = useState(false);
	const [errors, setErrors] = useState<FieldErrors>({});
	const [feedback, setFeedback] = useState('');
	const [createBoardArticle] = useMutation(CREATE_BOARD_ARTICLE);
	const sameAccount = () =>
		mounted.current &&
		authReadyVar() &&
		!authErrorVar() &&
		userVar()._id === memberId &&
		userVar().memberStatus === 'ACTIVE' &&
		getJwtToken() === token &&
		Boolean(token);
	const currentAccount = () => !away.current && sameAccount();
	const currentRequest = (requestEpoch: number) => currentAccount() && requestEpoch === epoch.current;

	useLayoutEffect(() => {
		mounted.current = true;
		const editor = editorRef.current?.getInstance();
		const leave = () => {
			away.current = true;
			epoch.current++;
			uploadTask.current?.controller.abort();
			uploadTask.current = null;
			if (confirmed.current) return;
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
	}, [router.events]);
	useEffect(() => {
		storyRef.current?.querySelector('[role="textbox"]')?.setAttribute('aria-invalid', String(Boolean(errors.story)));
	}, [errors.story]);

	const readStory = () => editorRef.current?.getInstance().getHTML() ?? story;
	const uploadImage = async (file: File, kind: 'cover' | 'inline', callback?: (url: string) => void) => {
		if (!currentAccount() || uploadTask.current || submitLock.current) return;
		const field = kind === 'cover' ? 'cover' : 'story';
		if (!['image/jpeg', 'image/png'].includes(file.type) || !/\.(jpe?g|png)$/i.test(file.name)) {
			setErrors((previous) => ({ ...previous, [field]: 'Image format' }));
			return;
		}
		if (file.size > 15000000) {
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
			const response = await axios.post(process.env.REACT_APP_API_GRAPHQL_URL as string, data, {
				signal: task.controller.signal,
				headers: { 'apollo-require-preflight': true, Authorization: `Bearer ${token}` },
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
		if (!currentAccount() || submitLock.current || uploadTask.current || uncertain) return;
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
			const response = await createBoardArticle({
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
			if (!response.data?.createBoardArticle?._id) throw new Error('Publication unconfirmed');
			confirmed.current = true;
			pendingPublication.current = false;
			setUncertain(false);
			setFeedback('Published');
			setPublishing(false);
			if (currentRequest(requestEpoch)) {
				await sweetTopSmallSuccessAlert(t('Write article.Published'), 700);
				if (currentRequest(requestEpoch)) await router.push('/mypage?category=myArticles');
			}
		} catch (error) {
			if (sameAccount() && !confirmed.current) {
				if (isAuthenticationError(error)) invalidateSession();
				else {
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
	const busy = uploading || publishing;
	const readOnly = publishing || confirmed.current;
	return (
		<form className="write-article-form" onSubmit={(event) => void publish(event)} noValidate aria-busy={busy}>
			<fieldset className="write-category" disabled={readOnly}>
				<legend>{t('Write article.Category')}</legend>
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
					accept="image/jpeg,image/png,.jpg,.jpeg,.png"
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
				<div ref={storyRef} className="write-story-editor">
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
				<div className="write-feedback" role={confirmed.current ? 'status' : 'alert'}>
					<p>{t(`Write article.${feedback}`)}</p>
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
				</div>
			)}
			<div className="write-publish-row">
				<p className="write-publish-note">
					<PublicOutlinedIcon aria-hidden="true" />
					{t('Write article.Publish note')}
				</p>
				<div className="write-publish-actions">
					<Link href="/community" className="write-cancel">
						{t('Write article.Cancel')}
					</Link>
					<button type="submit" className="write-publish" disabled={busy || uncertain || confirmed.current}>
						{t(`Write article.${publishing ? 'Publishing' : 'Publish Article'}`)}
						<SendRoundedIcon aria-hidden="true" />
					</button>
				</div>
			</div>
		</form>
	);
};

export default TuiEditor;
