import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NextPage } from 'next';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Button, Stack, Typography } from '@mui/material';
import axios from 'axios';
import { authErrorVar, authReadyVar, userVar } from '../../../apollo/store';
import { MemberSelfUpdate } from '../../types/member/member.update';
import { useMutation, useReactiveVar } from '@apollo/client';
import {
	getJwtToken,
	updateStorage,
	updateUserInfo,
	invalidateSession,
	isAuthenticationError,
	logOut,
} from '../../auth';
import { UPDATE_MEMBER } from '../../../apollo/user/mutation';
import { sweetConfirmAlert, sweetErrorHandling, sweetMixinSuccessAlert } from '../../sweetAlert';
import { Messages, REACT_APP_API_URL } from '../../config';
import { Member } from '../../types/member/member';
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

const MyProfile: NextPage<{ initialValues?: MemberSelfUpdate; trainerWorkspace?: boolean }> = ({
	initialValues,
	trainerWorkspace = false,
}) => {
	const device = useDeviceDetect();
	const { t } = useTranslation('common');
	const token = getJwtToken();
	const user = useReactiveVar(userVar);
	const ready = useReactiveVar(authReadyVar);
	const authError = useReactiveVar(authErrorVar);
	const [updateData, setUpdateData] = useState<MemberSelfUpdate>(() =>
		trainerWorkspace
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
	const writeLock = useRef(false);
	const logoutLock = useRef(false);
	const activeAccount = useCallback(
		() =>
			!trainerWorkspace ||
			(mounted.current &&
				authReadyVar() &&
				!authErrorVar() &&
				userVar()._id === user._id &&
				userVar().memberType === 'TRAINER' &&
				userVar().memberStatus === 'ACTIVE' &&
				getJwtToken() === token),
		[trainerWorkspace, user._id, token],
	);

	/** APOLLO REQUESTS **/
	const [updateMember, { loading: saving }] = useMutation<{ updateMember: Member }, { input: MemberSelfUpdate }>(
		UPDATE_MEMBER,
		{ context: { handleErrorLocally: trainerWorkspace } },
	);

	/** LIFECYCLES **/
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		setUpdateData((previous) => ({
			...previous,
			memberNick: user.memberNick,
			memberPhone: user.memberPhone,
			memberAddress: user.memberAddress,
			memberImage: user.memberImage,
			...(trainerWorkspace ? { memberFullName: user.memberFullName ?? '' } : {}),
		}));
	}, [user, trainerWorkspace]);

	/** HANDLERS **/
	const uploadImage = async (e: any) => {
		if (uploading || saving || !e.target.files?.length || !activeAccount() || (trainerWorkspace && writeLock.current))
			return;
		if (trainerWorkspace) {
			writeLock.current = true;
			setFeedback('');
		}
		setUploading(true);
		try {
			const image = e.target.files[0];
			if (!['image/jpeg', 'image/png'].includes(image.type)) throw new Error(Messages.error5);

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

			const response = await axios.post(`${process.env.REACT_APP_API_GRAPHQL_URL}`, formData, {
				headers: {
					'Content-Type': 'multipart/form-data',
					'apollo-require-preflight': true,
					Authorization: `Bearer ${token}`,
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
		} catch (err) {
			if (!activeAccount()) return;
			if (isAuthenticationError(err)) invalidateSession();
			if (trainerWorkspace) setFeedback('Upload error');
			else await sweetErrorHandling(err);
		} finally {
			if (mounted.current) {
				setUploading(false);
				writeLock.current = false;
			}
			e.target.value = '';
		}
	};

	const updateProfileHandler = useCallback(async () => {
		if (saving || uploading || !activeAccount() || (trainerWorkspace && writeLock.current)) return;
		if (trainerWorkspace) {
			writeLock.current = true;
			setFeedback('');
		}
		try {
			if (!user._id) throw new Error(Messages.error2);

			const result = await updateMember({
				variables: {
					input: trainerWorkspace
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
			const jwtToken = member?.accessToken;
			if (!member || !jwtToken) throw new Error('Invalid profile receipt');
			if (
				trainerWorkspace &&
				(member._id !== user._id || member.memberType !== 'TRAINER' || member.memberStatus !== 'ACTIVE')
			)
				throw new Error('Invalid profile receipt');

			await updateStorage({ jwtToken });
			await updateUserInfo(jwtToken, member);

			if (trainerWorkspace) {
				if (mounted.current && userVar()._id === user._id && getJwtToken() === jwtToken) setFeedback('Saved');
			} else await sweetMixinSuccessAlert('information updated successfully.');
		} catch (err: any) {
			if (!activeAccount()) return;
			if (trainerWorkspace) {
				if (isAuthenticationError(err)) invalidateSession();
				setFeedback('Save error');
			} else sweetErrorHandling(err).then();
		} finally {
			writeLock.current = false;
		}
	}, [updateData, saving, uploading, user._id, updateMember, trainerWorkspace, activeAccount]);

	const logoutHandler = async () => {
		if (saving || uploading || writeLock.current || logoutLock.current || !activeAccount()) return;
		logoutLock.current = true;
		try {
			if (await sweetConfirmAlert(t('Trainer profile.Logout confirmation'))) {
				if (activeAccount()) logOut();
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
								accept="image/jpeg,image/png"
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
									accept="image/jpg, image/jpeg, image/png"
								/>
								<label htmlFor="hidden-input" className="labeler">
									<Typography>Upload Profile Image</Typography>
								</label>
								<Typography className="upload-text">A photo must be in JPG, JPEG or PNG format!</Typography>
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
