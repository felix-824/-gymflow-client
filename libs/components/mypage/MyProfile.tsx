import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NextPage } from 'next';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Button, Stack, Typography } from '@mui/material';
import axios from 'axios';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { MemberSelfUpdate } from '../../types/member/member.update';
import { useMutation, useReactiveVar } from '@apollo/client';
import {
	getAuthSessionId,
	ensureAccessToken,
	updateUserInfo,
	invalidateSession,
	isAuthenticationError,
	logOut,
} from '../../auth';
import { UPDATE_MEMBER } from '../../../apollo/user/mutation';
import { sweetConfirmAlert, sweetErrorHandling, sweetMixinSuccessAlert } from '../../sweetAlert';
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_TYPES, Messages, REACT_APP_API_URL } from '../../config';
import { OwnerMember } from '../../types/member/member';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import AlternateEmailRoundedIcon from '@mui/icons-material/AlternateEmailRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import UserAccountNavigation from './UserAccountNavigation';

const MyProfile: NextPage<{ initialValues?: MemberSelfUpdate; trainerWorkspace?: boolean; userProfile?: boolean }> = ({
	initialValues,
	trainerWorkspace = false,
	userProfile = false,
}) => {
	const device = useDeviceDetect();
	const { t } = useTranslation('common');
	const sessionIdentity = getAuthSessionId();
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const managedProfile = trainerWorkspace || userProfile;
	const expectedRole = userProfile ? 'USER' : 'TRAINER';
	const profileNamespace = userProfile ? 'User profile' : 'Trainer profile';
	const [updateData, setUpdateData] = useState<MemberSelfUpdate>(() =>
		managedProfile
			? {
					memberNick: user.memberNick,
					memberFullName: user.memberFullName ?? '',
					memberPhone: user.memberPhone,
					memberAddress: user.memberAddress ?? '',
					memberImage: user.memberImage ?? '',
			  }
			: initialValues ?? {},
	);
	const [uploading, setUploading] = useState(false);
	const [feedback, setFeedback] = useState('');
	const [brokenImage, setBrokenImage] = useState('');
	const imageInput = useRef<HTMLInputElement>(null);
	const mounted = useRef(true);
	const profileScope = useRef('');
	const writeLock = useRef(false);
	const logoutLock = useRef(false);
	const activeAccount = useCallback(
		() =>
			!managedProfile ||
			(mounted.current &&
				authReadyVar() &&
				!authErrorVar() &&
				userVar()._id === user._id &&
				userVar().memberType === expectedRole &&
				userVar().memberStatus === 'ACTIVE' &&
				getAuthSessionId() === sessionIdentity),
		[managedProfile, expectedRole, user._id, sessionIdentity],
	);

	/** APOLLO REQUESTS **/
	const [updateMember, { loading: saving }] = useMutation<{ updateMember: OwnerMember }, { input: MemberSelfUpdate }>(
		UPDATE_MEMBER,
		{ fetchPolicy: 'no-cache', context: { handleErrorLocally: managedProfile } },
	);

	/** LIFECYCLES **/
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		const scope = `${managedProfile}:${user._id}:${sessionIdentity}`;
		if (profileScope.current === scope) return;
		profileScope.current = scope;
		setUpdateData((previous) => ({
			...previous,
			memberNick: user.memberNick,
			memberPhone: user.memberPhone,
			memberAddress: user.memberAddress,
			memberImage: user.memberImage,
			...(managedProfile ? { memberFullName: user.memberFullName ?? '' } : {}),
		}));
	}, [user, managedProfile, sessionIdentity]);

	/** HANDLERS **/
	const uploadImage = async (e: any) => {
		if (uploading || saving || !e.target.files?.length || !activeAccount() || (managedProfile && writeLock.current))
			return;
		if (managedProfile) {
			writeLock.current = true;
			setFeedback('');
		}
		setUploading(true);
		try {
			const image = e.target.files[0];
			if (!IMAGE_UPLOAD_TYPES.includes(image.type) || !/\.(jpe?g|png|webp)$/i.test(image.name)) throw new Error('Image format');
			if (image.size > IMAGE_UPLOAD_MAX_BYTES) throw new Error('Image size');

			const formData = new FormData();
			formData.append(
				'operations',
				JSON.stringify({
					query: `mutation ImageUploader($file: Upload!, $target: String!) {
						imageUploader(file: $file, target: $target) 
				  }`,
					variables: {
						file: null,
						target: 'member',
					},
				}),
			);
			formData.append(
				'map',
				JSON.stringify({
					'0': ['variables.file'],
				}),
			);
			formData.append('0', image);

			const accessToken = await ensureAccessToken(true);
			if (!activeAccount()) return;
			const response = await axios.post(`${process.env.REACT_APP_API_GRAPHQL_URL}`, formData, {
				headers: {
					'Content-Type': 'multipart/form-data',
					'apollo-require-preflight': true,
					Authorization: `Bearer ${accessToken}`,
				},
			});
			if (!activeAccount()) return;

			if (response.data.errors?.length) {
				if (isAuthenticationError({ graphQLErrors: response.data.errors })) invalidateSession();
				throw new Error(response.data.errors[0].message);
			}
			const responseImage = response.data.data?.imageUploader;
			if (typeof responseImage !== 'string' || !responseImage) throw new Error('Image upload failed.');
			setUpdateData((previous) => ({ ...previous, memberImage: responseImage }));

			return `${REACT_APP_API_URL}/${responseImage}`;
		} catch (err: any) {
			if (!activeAccount()) return;
			if (isAuthenticationError(err)) invalidateSession();
			const validation = ['Image format', 'Image size'].includes(err.message);
			if (managedProfile) setFeedback(validation ? err.message : 'Upload error');
			else await sweetErrorHandling(validation ? new Error(t(`User profile.${err.message}`)) : err);
		} finally {
			if (mounted.current) {
				setUploading(false);
				writeLock.current = false;
			}
			e.target.value = '';
		}
	};

	const updateProfileHandler = useCallback(async () => {
		if (saving || uploading || !activeAccount() || (managedProfile && writeLock.current)) return;
		if (managedProfile) {
			writeLock.current = true;
			setFeedback('');
		}
		try {
			if (!user._id) throw new Error(Messages.error2);

			const result = await updateMember({
				variables: {
					input: managedProfile
						? {
								memberNick: updateData.memberNick,
								memberFullName: updateData.memberFullName || null,
								memberPhone: updateData.memberPhone,
								memberAddress: updateData.memberAddress,
								memberImage: updateData.memberImage,
						  }
						: updateData,
				},
			});
			if (!activeAccount()) return;

			const member = result.data?.updateMember;
			if (!member) throw new Error('Invalid profile receipt');
			if (
				managedProfile &&
				(member._id !== user._id || member.memberType !== expectedRole || member.memberStatus !== 'ACTIVE')
			)
				throw new Error('Invalid profile receipt');

			if (updateData.memberPassword) { await logOut(); return; }
			await updateUserInfo(undefined, member);

			if (managedProfile) {
				if (mounted.current && userVar()._id === user._id && getAuthSessionId() === sessionIdentity) setFeedback('Saved');
			} else await sweetMixinSuccessAlert('information updated successfully.');
		} catch (err: any) {
			if (!activeAccount()) return;
			if (managedProfile) {
				if (isAuthenticationError(err)) invalidateSession();
				setFeedback('Save error');
			} else sweetErrorHandling(err).then();
		} finally {
			writeLock.current = false;
		}
	}, [updateData, saving, uploading, user._id, updateMember, managedProfile, expectedRole, activeAccount, sessionIdentity]);

	const logoutHandler = async () => {
		if (saving || uploading || writeLock.current || logoutLock.current || !activeAccount()) return;
		logoutLock.current = true;
		try {
			if (await sweetConfirmAlert(t(`${profileNamespace}.Logout confirmation`))) {
				if (activeAccount()) await logOut();
			}
		} catch (err) {
			if (activeAccount()) await sweetErrorHandling(err);
		} finally {
			logoutLock.current = false;
		}
	};

	const doDisabledCheck = () => {
		if (updateData.memberNick === '' || updateData.memberPhone === '') {
			return true;
		}
	};

	if (userProfile) {
		if (!ready || authError || user.memberType !== 'USER' || user.memberStatus !== 'ACTIVE' || !user._id) return null;
		const source =
			updateData.memberImage && brokenImage !== updateData.memberImage
				? /^https?:\/\//i.test(updateData.memberImage)
					? updateData.memberImage
					: `${REACT_APP_API_URL}/${updateData.memberImage.replace(/^\//, '')}`
				: '/img/profile/defaultUser.svg';
		return (
			<div id="user-profile-page">
				<header className="user-profile-heading">
					<p className="user-profile-eyebrow">{t('User profile.Account Settings')}</p>
					<h1>{t('User profile.Title')}</h1>
					<p>{t('User profile.Intro')}</p>
				</header>
				<UserAccountNavigation active="Profile" />
				<section className="user-profile-surface" aria-labelledby="user-profile-personal-title">
					<div className="user-profile-section-heading">
						<h2 id="user-profile-personal-title">{t('User profile.Personal Information')}</h2>
						<p>{t('User profile.Personal description')}</p>
					</div>
					<form
						name="user-profile"
						autoComplete="on"
						aria-label={t('User profile.Personal Information')}
						aria-busy={saving || uploading}
						onSubmit={(event) => {
							event.preventDefault();
							void updateProfileHandler();
						}}
					>
						<div className="user-profile-photo">
							<div className="user-profile-image">
								<img
									src={source}
									alt={t('User profile.Profile image')}
									onError={() => setBrokenImage(updateData.memberImage ?? '')}
								/>
								<Button
									type="button"
									className="user-profile-camera"
									disabled={saving || uploading}
									aria-label={t('User profile.Change Photo')}
									onClick={() => imageInput.current?.click()}
								>
									<PhotoCameraOutlinedIcon />
								</Button>
							</div>
							<input
								ref={imageInput}
								id="user-profile-image"
								type="file"
								hidden
								accept={IMAGE_UPLOAD_ACCEPT}
								onChange={uploadImage}
								disabled={saving || uploading}
							/>
							<Button
								type="button"
								className="user-profile-upload"
								disabled={saving || uploading}
								onClick={() => imageInput.current?.click()}
							>
								<CloudUploadOutlinedIcon aria-hidden="true" />
								<span className="user-profile-desktop-copy">
									{t(uploading ? 'User profile.Uploading' : 'User profile.Change Photo')}
								</span>
								<span className="user-profile-mobile-copy">
									{t(uploading ? 'User profile.Uploading' : 'User profile.Upload image')}
								</span>
							</Button>
						</div>
						<div className="user-profile-fields">
							<div className="user-profile-field user-profile-wide">
								<label htmlFor="user-profile-nick">{t('User profile.Nickname')}</label>
								<div className="user-profile-nick-input">
									<AlternateEmailRoundedIcon aria-hidden="true" />
									<input
										id="user-profile-nick"
										name="memberNick"
										type="text"
										autoComplete="nickname"
										autoCapitalize="none"
										spellCheck={false}
										required
										minLength={3}
										maxLength={12}
										value={updateData.memberNick ?? ''}
										disabled={saving || uploading}
										onChange={(event) => setUpdateData({ ...updateData, memberNick: event.target.value })}
									/>
								</div>
							</div>
							<div className="user-profile-field">
								<label htmlFor="user-profile-name">{t('User profile.Full Name')}</label>
								<div>
									<input
										id="user-profile-name"
										name="memberFullName"
										type="text"
										autoComplete="name"
										minLength={3}
										maxLength={100}
										value={updateData.memberFullName ?? ''}
										disabled={saving || uploading}
										onChange={(event) => setUpdateData({ ...updateData, memberFullName: event.target.value })}
									/>
								</div>
							</div>
							<div className="user-profile-field">
								<label htmlFor="user-profile-phone">{t('User profile.Phone')}</label>
								<div>
									<input
										id="user-profile-phone"
										name="memberPhone"
										type="tel"
										autoComplete="tel"
										required
										value={updateData.memberPhone ?? ''}
										disabled={saving || uploading}
										onChange={(event) => setUpdateData({ ...updateData, memberPhone: event.target.value })}
									/>
								</div>
							</div>
							<div className="user-profile-field user-profile-wide">
								<label htmlFor="user-profile-address">{t('User profile.Address')}</label>
								<div>
									<input
										id="user-profile-address"
										name="memberAddress"
										type="text"
										autoComplete="street-address"
										value={updateData.memberAddress ?? ''}
										disabled={saving || uploading}
										onChange={(event) => setUpdateData({ ...updateData, memberAddress: event.target.value })}
									/>
								</div>
							</div>
						</div>
						<div className="user-profile-save">
							{feedback && (
								<p
									className={`user-profile-feedback${feedback === 'Saved' ? ' is-success' : ''}`}
									role={feedback === 'Saved' ? 'status' : 'alert'}
								>
									{t(`User profile.${feedback}`)}
								</p>
							)}
							<Button
								type="submit"
								variant="contained"
								className="user-profile-save-button"
								disabled={saving || uploading || doDisabledCheck()}
							>
								<CheckCircleOutlineRoundedIcon aria-hidden="true" />
								{t(saving ? 'User profile.Saving' : 'User profile.Save Changes')}
							</Button>
						</div>
					</form>
				</section>
				<section className="user-profile-session" aria-labelledby="user-profile-session-title">
					<DevicesOutlinedIcon className="user-profile-session-icon" aria-hidden="true" />
					<div className="user-profile-session-copy">
						<h2 id="user-profile-session-title">{t('User profile.Account Session')}</h2>
						<p>{t('User profile.Session description')}</p>
					</div>
					<Button
						type="button"
						className="user-profile-logout"
						disabled={saving || uploading}
						onClick={() => void logoutHandler()}
					>
						<LogoutRoundedIcon aria-hidden="true" />
						{t('User profile.Log out')}
					</Button>
				</section>
			</div>
		);
	}

	if (trainerWorkspace) {
		if (!ready || authError || user.memberType !== 'TRAINER' || user.memberStatus !== 'ACTIVE' || !user._id)
			return null;
		const name = user.memberFullName?.trim() || user.memberNick;
		const source =
			updateData.memberImage && brokenImage !== updateData.memberImage
				? /^https?:\/\//i.test(updateData.memberImage)
					? updateData.memberImage
					: `${REACT_APP_API_URL}/${updateData.memberImage.replace(/^\//, '')}`
				: '/img/profile/defaultUser.svg';
		return (
			<div id="trainer-profile-page">
				<div className="trainer-profile-breadcrumb">
					<Link passHref href="/mypage?category=trainerDashboard">
						{t('Trainer schedule.Workspace')}
					</Link>
					<span>/</span>
					<span>{t('Trainer profile.Account Profile')}</span>
				</div>
				<header className="trainer-profile-heading">
					<h1>{t('Trainer profile.Title')}</h1>
					<p>{t('Trainer profile.Intro')}</p>
				</header>
				<div className="trainer-profile-surface">
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void updateProfileHandler();
						}}
						aria-label={t('Trainer profile.Title')}
					>
						<div className="trainer-profile-photo">
							<div className="trainer-profile-photo-info">
								<div className="trainer-profile-image">
									<img
										src={source}
										alt={t('Trainer profile.Profile image')}
										onError={() => setBrokenImage(updateData.memberImage ?? '')}
									/>
									<Button
										className="trainer-profile-camera"
										type="button"
										disabled={saving || uploading}
										aria-label={t('Trainer profile.Change Photo')}
										onClick={() => imageInput.current?.click()}
									>
										<PhotoCameraOutlinedIcon />
									</Button>
								</div>
								<div className="trainer-profile-photo-name">
									<span>{t('Trainer profile.Profile image')}</span>
									<strong>{name}</strong>
								</div>
							</div>
							<input
								ref={imageInput}
								id="trainer-profile-image"
								type="file"
								hidden
								accept={IMAGE_UPLOAD_ACCEPT}
								onChange={uploadImage}
								disabled={saving || uploading}
							/>
							<Button
								className="trainer-profile-upload"
								type="button"
								disabled={saving || uploading}
								onClick={() => imageInput.current?.click()}
							>
								<CloudUploadOutlinedIcon />
								<span className="profile-desktop-copy">
									{t(uploading ? 'Trainer profile.Uploading' : 'Trainer profile.Change Photo')}
								</span>
								<span className="profile-mobile-copy">
									{t(uploading ? 'Trainer profile.Uploading' : 'Trainer profile.Upload image')}
								</span>
							</Button>
						</div>
						<div className="trainer-profile-fields">
							<div className="trainer-profile-field field-nickname">
								<label htmlFor="trainer-profile-nick">{t('Trainer profile.Nickname')}</label>
								<div>
									<AlternateEmailRoundedIcon />
									<input
										id="trainer-profile-nick"
										name="memberNick"
										type="text"
										autoComplete="username"
										required
										minLength={3}
										maxLength={12}
										value={updateData.memberNick ?? ''}
										disabled={saving || uploading}
										onChange={(event) => setUpdateData({ ...updateData, memberNick: event.target.value })}
									/>
								</div>
							</div>
							<div className="trainer-profile-field">
								<label htmlFor="trainer-profile-name">{t('Trainer profile.Full Name')}</label>
								<div>
									<PersonOutlineRoundedIcon />
									<input
										id="trainer-profile-name"
										name="memberFullName"
										type="text"
										autoComplete="name"
										minLength={3}
										maxLength={100}
										value={updateData.memberFullName ?? ''}
										disabled={saving || uploading}
										onChange={(event) => setUpdateData({ ...updateData, memberFullName: event.target.value })}
									/>
								</div>
							</div>
							<div className="trainer-profile-field">
								<label htmlFor="trainer-profile-phone">{t('Trainer profile.Phone')}</label>
								<div>
									<PhoneOutlinedIcon />
									<input
										id="trainer-profile-phone"
										name="memberPhone"
										type="tel"
										autoComplete="tel"
										required
										value={updateData.memberPhone ?? ''}
										disabled={saving || uploading}
										onChange={(event) => setUpdateData({ ...updateData, memberPhone: event.target.value })}
									/>
								</div>
							</div>
							<div className="trainer-profile-field field-address">
								<label htmlFor="trainer-profile-address">{t('Trainer profile.Address')}</label>
								<div>
									<LocationOnOutlinedIcon />
									<input
										id="trainer-profile-address"
										name="memberAddress"
										type="text"
										autoComplete="street-address"
										value={updateData.memberAddress ?? ''}
										disabled={saving || uploading}
										onChange={(event) => setUpdateData({ ...updateData, memberAddress: event.target.value })}
									/>
								</div>
							</div>
						</div>
						<div className="trainer-profile-save">
							{feedback && (
								<p
									className={`trainer-profile-feedback${feedback === 'Saved' ? ' is-success' : ''}`}
									role={feedback === 'Saved' ? 'status' : 'alert'}
								>
									{t(`Trainer profile.${feedback}`)}
								</p>
							)}
							<Button
								className="trainer-profile-save-button"
								variant="contained"
								type="submit"
								disabled={saving || uploading || doDisabledCheck()}
							>
								<CheckCircleOutlineRoundedIcon />
								<span>{t(saving ? 'Trainer profile.Saving' : 'Trainer profile.Save Changes')}</span>
							</Button>
						</div>
					</form>
					<div className="trainer-profile-session">
						<div className="trainer-profile-session-copy">
							<h2>{t('Trainer profile.Account Session')}</h2>
							<p>{t('Trainer profile.Session description')}</p>
						</div>
						<Button
							className="trainer-profile-logout"
							type="button"
							disabled={saving || uploading}
							onClick={() => void logoutHandler()}
						>
							<LogoutRoundedIcon />
							{t('Trainer profile.Log out')}
						</Button>
					</div>
				</div>
			</div>
		);
	}
	if (device === 'mobile') {
		return <>MY PROFILE PAGE MOBILE</>;
	} else
		return (
			<div id="my-profile-page">
				<Stack className="main-title-box">
					<Stack className="right-box">
						<Typography className="main-title">My Profile</Typography>
						<Typography className="sub-title">We are glad to see you again!</Typography>
					</Stack>
				</Stack>
				<Stack className="top-box">
					<Stack className="photo-box">
						<Typography className="title">Photo</Typography>
						<Stack className="image-big-box">
							<Stack className="image-box">
								<img
									src={
										updateData?.memberImage
											? `${REACT_APP_API_URL}/${updateData?.memberImage}`
											: `/img/profile/defaultUser.svg`
									}
									alt=""
								/>
							</Stack>
							<Stack className="upload-big-box">
								<input
									type="file"
									hidden
									id="hidden-input"
									onChange={uploadImage}
									accept={IMAGE_UPLOAD_ACCEPT}
								/>
								<label htmlFor="hidden-input" className="labeler">
									<Typography>Upload Profile Image</Typography>
								</label>
								<Typography className="upload-text">{t('User profile.Image format')}</Typography>
							</Stack>
						</Stack>
					</Stack>
					<Stack className="small-input-box">
						<Stack className="input-box">
							<Typography className="title">Username</Typography>
							<input
								type="text"
								placeholder="Your username"
								value={updateData.memberNick}
								onChange={({ target: { value } }) => setUpdateData({ ...updateData, memberNick: value })}
							/>
						</Stack>
						<Stack className="input-box">
							<Typography className="title">Phone</Typography>
							<input
								type="text"
								placeholder="Your Phone"
								value={updateData.memberPhone}
								onChange={({ target: { value } }) => setUpdateData({ ...updateData, memberPhone: value })}
							/>
						</Stack>
					</Stack>
					<Stack className="address-box">
						<Typography className="title">Address</Typography>
						<input
							type="text"
							placeholder="Your address"
							value={updateData.memberAddress}
							onChange={({ target: { value } }) => setUpdateData({ ...updateData, memberAddress: value })}
						/>
					</Stack>
					<Stack className="about-me-box">
						<Button
							className="update-button"
							onClick={updateProfileHandler}
							disabled={saving || uploading || doDisabledCheck()}
						>
							<Typography>Update Profile</Typography>
							<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none">
								<g clipPath="url(#clip0_7065_6985)">
									<path
										d="M12.6389 0H4.69446C4.49486 0 4.33334 0.161518 4.33334 0.361122C4.33334 0.560727 4.49486 0.722245 4.69446 0.722245H11.7672L0.105803 12.3836C-0.0352676 12.5247 -0.0352676 12.7532 0.105803 12.8942C0.176321 12.9647 0.268743 13 0.361131 13C0.453519 13 0.545907 12.9647 0.616459 12.8942L12.2778 1.23287V8.30558C12.2778 8.50518 12.4393 8.6667 12.6389 8.6667C12.8385 8.6667 13 8.50518 13 8.30558V0.361122C13 0.161518 12.8385 0 12.6389 0Z"
										fill="white"
									/>
								</g>
								<defs>
									<clipPath id="clip0_7065_6985">
										<rect width="13" height="13" fill="white" />
									</clipPath>
								</defs>
							</svg>
						</Button>
					</Stack>
				</Stack>
			</div>
		);
};

MyProfile.defaultProps = {
	initialValues: {
		memberImage: '',
		memberNick: '',
		memberPhone: '',
		memberAddress: '',
	},
};

export default MyProfile;
