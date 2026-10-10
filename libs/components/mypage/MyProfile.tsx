import React, { useCallback, useEffect, useState } from 'react';
import { NextPage } from 'next';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Button, Stack, Typography } from '@mui/material';
import axios from 'axios';
import { userVar } from '../../../apollo/store';
import { MemberSelfUpdate } from '../../types/member/member.update';
import { useMutation, useReactiveVar } from '@apollo/client';
import { getJwtToken, updateStorage, updateUserInfo, invalidateSession, isAuthenticationError } from '../../auth';
import { UPDATE_MEMBER } from '../../../apollo/user/mutation';
import { sweetErrorHandling, sweetMixinSuccessAlert } from '../../sweetAlert';
import { Messages, REACT_APP_API_URL } from '../../config';

const MyProfile: NextPage = ({ initialValues, ...props }: any) => {
	const device = useDeviceDetect();
	const token = getJwtToken();
	const user = useReactiveVar(userVar);
	const [updateData, setUpdateData] = useState<MemberSelfUpdate>(initialValues);
	const [uploading, setUploading] = useState(false);

	/** APOLLO REQUESTS **/
	const [updateMember, { loading: saving }] = useMutation(UPDATE_MEMBER);

	/** LIFECYCLES **/
	useEffect(() => {
		setUpdateData((previous) => ({
			...previous,
			memberNick: user.memberNick,
			memberPhone: user.memberPhone,
			memberAddress: user.memberAddress,
			memberImage: user.memberImage,
		}));
	}, [user]);

	/** HANDLERS **/
	const uploadImage = async (e: any) => {
		if (uploading || saving || !e.target.files?.length) return;
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

			if (response.data.errors?.length) {
				if (isAuthenticationError({ graphQLErrors: response.data.errors })) invalidateSession();
				throw new Error(response.data.errors[0].message);
			}
			const responseImage = response.data.data?.imageUploader;
			if (typeof responseImage !== 'string' || !responseImage) throw new Error('Image upload failed.');
			setUpdateData((previous) => ({ ...previous, memberImage: responseImage }));

			return `${REACT_APP_API_URL}/${responseImage}`;
		} catch (err) {
			if (isAuthenticationError(err)) invalidateSession();
			await sweetErrorHandling(err);
		} finally {
			setUploading(false);
			e.target.value = '';
		}
	};

	const updateProfileHandler = useCallback(async () => {
		if (saving || uploading) return;
		try {
			if (!user._id) throw new Error(Messages.error2);

			const result = await updateMember({
				variables: {
					input: updateData,
				},
			});

			// @ts-ignore
			const jwtToken = result.data.updateMember?.accessToken;

			await updateStorage({ jwtToken });
			await updateUserInfo(jwtToken, result.data.updateMember);

			await sweetMixinSuccessAlert('information updated successfully.');
		} catch (err: any) {
			sweetErrorHandling(err).then();
		}
	}, [updateData, saving, uploading, user._id, updateMember]);

	const doDisabledCheck = () => {
		if (updateData.memberNick === '' || updateData.memberPhone === '') {
			return true;
		}
	};

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
