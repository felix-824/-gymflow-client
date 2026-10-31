import React, { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@mui/material';
import { ImageSquare } from 'phosphor-react';
import { useRouter } from 'next/router';
import { useReactiveVar } from '@apollo/client';
import { useTranslation } from 'next-i18next';
import axios from 'axios';
import { authErrorVar, authReadyVar, userVar } from '../../../../apollo/store';
import { ensureAccessToken, getAuthSessionId, invalidateSession, isAuthenticationError } from '../../../auth';
import {
	getApiGraphqlUrl,
	IMAGE_UPLOAD_ACCEPT,
	IMAGE_UPLOAD_MAX_BYTES,
	IMAGE_UPLOAD_TYPES,
	REACT_APP_API_URL,
} from '../../../config';
import { gymImagesError } from '../../../admin-gyms';
import { MemberStatus, MemberType } from '../../../enums/member.enum';

export interface GymImagesProps {
	title?: string;
	images: string[];
	onChange: (images: string[]) => void;
	// Identity of the owning form/draft; change it when replacing the draft, even on the same route.
	scopeKey: string;
	disabled?: boolean;
	showValidation?: boolean;
	// The future form must block saving while this synchronous upload lock is held.
	onUploadingChange?: (uploading: boolean) => void;
}

const GymPhotoPreview = ({ path, alt }: { path: string; alt: string }) => {
	const [failed, setFailed] = useState(false);
	return !failed && !gymImagesError([path]) ? (
		<img src={`${REACT_APP_API_URL}/${path}`} alt={alt} onError={() => setFailed(true)} />
	) : (
		<div className="gym-photo-fallback" role="img" aria-label={alt}>
			<ImageSquare size={32} aria-hidden="true" />
		</div>
	);
};

const GymImages = ({
	title,
	images,
	onChange,
	scopeKey,
	disabled = false,
	showValidation = false,
	onUploadingChange,
}: GymImagesProps) => {
	const { t } = useTranslation('admin-gyms');
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const session = getAuthSessionId();
	const scope = `${scopeKey}:${router.asPath}:${ready}:${authError}:${user._id}:${user.memberType}:${
		user.memberStatus
	}:${session}:${disabled}:${JSON.stringify(images)}`;
	const currentScope = useRef(scope);
	currentScope.current = scope;
	const busyCallback = useRef(onUploadingChange);
	busyCallback.current = onUploadingChange;
	const changeCallback = useRef(onChange);
	changeCallback.current = onChange;
	const inputRef = useRef<HTMLInputElement>(null);
	const taskRef = useRef<{ controller: AbortController; scope: string } | null>(null);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState('');
	const id = useId();
	const errorId = `${id}-error`;
	const hintId = `${id}-hint`;
	const authorized =
		ready &&
		!authError &&
		Boolean(user._id && session) &&
		user.memberType === MemberType.ADMIN &&
		user.memberStatus === MemberStatus.ACTIVE;
	const validationError = images.length || showValidation ? gymImagesError(images) : null;
	const error = uploadError || validationError;
	const locked = disabled || uploading;

	useEffect(() => {
		setUploading(false);
		setUploadError('');
		const cancel = () => {
			const task = taskRef.current;
			if (!task) return;
			taskRef.current = null;
			task.controller.abort();
			busyCallback.current?.(false);
		};
		const leave = () => {
			cancel();
			setUploading(false);
			if (inputRef.current) inputRef.current.value = '';
		};
		router.events.on('routeChangeStart', leave);
		return () => {
			router.events.off('routeChangeStart', leave);
			cancel();
		};
	}, [scope, router.events]);

	const uploadImages = async () => {
		if (disabled || taskRef.current || !inputRef.current?.files?.length) return;
		if (!authorized) {
			setUploadError('auth.session');
			return;
		}
		const task = { controller: new AbortController(), scope };
		taskRef.current = task;
		const isCurrent = () =>
			taskRef.current === task &&
			!task.controller.signal.aborted &&
			currentScope.current === task.scope &&
			getAuthSessionId() === session &&
			authReadyVar() &&
			!authErrorVar() &&
			userVar()._id === user._id &&
			userVar().memberType === MemberType.ADMIN &&
			userVar().memberStatus === MemberStatus.ACTIVE;
		setUploading(true);
		setUploadError('');
		busyCallback.current?.(true);
		try {
			const files = Array.from(inputRef.current.files);
			if (files.length + images.length > 5) {
				setUploadError('photos.maximum');
				return;
			}
			if (files.some((file) => !IMAGE_UPLOAD_TYPES.includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name))) {
				setUploadError('photos.fileType');
				return;
			}
			if (files.some((file) => file.size > IMAGE_UPLOAD_MAX_BYTES)) {
				setUploadError('photos.size');
				return;
			}
			if (images.length && gymImagesError(images)) {
				setUploadError(gymImagesError(images)!);
				return;
			}
			const formData = new FormData();
			formData.append(
				'operations',
				JSON.stringify({
					query:
						'mutation ImagesUploader($files: [Upload!]!, $target: String!) { imagesUploader(files: $files, target: $target) }',
					variables: { files: files.map(() => null), target: 'gym' },
				}),
			);
			const map: Record<string, string[]> = {};
			files.forEach((_, index) => {
				map[String(index)] = ['variables.files.' + index];
			});
			formData.append('map', JSON.stringify(map));
			files.forEach((file, index) => formData.append(String(index), file));
			const accessToken = await ensureAccessToken(true);
			if (!isCurrent()) return;
			const response = await axios.post(getApiGraphqlUrl(), formData, {
				signal: task.controller.signal,
				headers: { 'apollo-require-preflight': 'true', Authorization: 'Bearer ' + accessToken },
			});
			if (!isCurrent()) return;
			const errors: unknown = response.data?.errors;
			if (errors != null) {
				if (!Array.isArray(errors) || errors.some((error) => !error || typeof error !== 'object')) {
					setUploadError('photos.malformed');
					return;
				}
				if (errors.length) throw Object.assign(new Error('Photo upload rejected'), { graphQLErrors: errors });
			}
			const uploaded: unknown = response.data?.data?.imagesUploader;
			if (!Array.isArray(uploaded) || uploaded.length !== files.length || gymImagesError(uploaded)) {
				setUploadError('photos.malformed');
				return;
			}
			const next = [...images, ...uploaded];
			const nextError = gymImagesError(next);
			if (nextError) {
				setUploadError(nextError);
				return;
			}
			changeCallback.current(next);
		} catch (failure) {
			if (!isCurrent()) return;
			const authenticationError = isAuthenticationError(failure);
			setUploadError(authenticationError ? 'auth.session' : 'photos.error');
			if (authenticationError) void invalidateSession().catch(() => undefined);
		} finally {
			if (taskRef.current === task) {
				taskRef.current = null;
				setUploading(false);
				busyCallback.current?.(false);
				if (inputRef.current) inputRef.current.value = '';
			}
		}
	};
	const changeImages = (next: string[]) => {
		if (disabled || taskRef.current) return;
		setUploadError('');
		onChange(next);
	};
	return (
		<fieldset
			className="admin-gym-control gym-photos"
			disabled={disabled}
			aria-describedby={`${hintId}${error ? ' ' + errorId : ''}`}
			aria-busy={uploading}
		>
			<legend>{title ?? t('photos.title')}</legend>
			<div className="gym-photo-heading">
				<p>{t('photos.intro')}</p>
				<span>{t('photos.count', { count: images.length })}</span>
			</div>
			{images.length ? (
				<ol className="gym-photo-gallery">
					{images.map((path, index) => (
						<li className={index === 0 ? 'gym-photo is-cover' : 'gym-photo'} key={`${path}:${index}`}>
							<div className="gym-photo-preview">
								<GymPhotoPreview key={path} path={path} alt={t('photos.alt', { index: index + 1 })} />
								{index === 0 && <span className="gym-photo-cover">{t('photos.cover')}</span>}
							</div>
							<div className="gym-photo-actions">
								{index > 0 && (
									<Button
										type="button"
										disabled={locked}
										aria-label={t('photos.makeCover', { index: index + 1 })}
										onClick={() => changeImages([path, ...images.filter((_, position) => position !== index)])}
									>
										{t('photos.makeCoverAction')}
									</Button>
								)}
								<Button
									type="button"
									disabled={locked}
									aria-label={t('photos.remove', { index: index + 1 })}
									onClick={() => changeImages(images.filter((_, position) => position !== index))}
								>
									{t('photos.removeAction')}
								</Button>
							</div>
						</li>
					))}
				</ol>
			) : (
				<div className="gym-photo-empty">
					<ImageSquare size={28} aria-hidden="true" />
					<p>{t('photos.empty')}</p>
				</div>
			)}
			<div className="gym-photo-upload">
				<Button
					type="button"
					variant="outlined"
					disabled={locked || images.length >= 5 || !authorized}
					onClick={() => inputRef.current?.click()}
					aria-describedby={`${hintId}${error ? ' ' + errorId : ''}`}
				>
					{t('photos.upload')}
				</Button>
				<p id={hintId}>
					{t('photos.fileType')} {t('photos.size')}
				</p>
			</div>
			<input
				ref={inputRef}
				type="file"
				hidden
				multiple
				accept={IMAGE_UPLOAD_ACCEPT}
				disabled={locked || images.length >= 5 || !authorized}
				aria-label={t('photos.upload')}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? errorId : hintId}
				onChange={uploadImages}
			/>
			{uploading && (
				<p role="status" className="gym-control-note">
					{t('photos.uploading')}
				</p>
			)}
			{error && (
				<p id={errorId} role="alert" className="gym-control-error">
					{t(error)}
				</p>
			)}
		</fieldset>
	);
};

export default GymImages;
