import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Stack, Typography } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { ProgramCategory, ProgramLocation, ProgramType } from '../../enums/program.enum';
import { ProgramInput } from '../../types/program/program.input';
import { Program } from '../../types/program/program';
import axios from 'axios';
import { getJwtToken, invalidateSession, isAuthenticationError } from '../../auth';
import { authReadyVar, userVar } from '../../../apollo/store';
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import { CREATE_PROGRAM, UPDATE_PROGRAM } from '../../../apollo/user/mutation';
import { GET_TRAINER_PROGRAMS } from '../../../apollo/user/query';
import { sweetMixinSuccessAlert } from '../../sweetAlert';
import { programFormError, programPayload, readTrainerProgramsInquiry } from '../../program';
import { REACT_APP_API_URL } from '../../config';

const initialValues: ProgramInput = {
	programName: '',
	programType: ProgramType.PT_1ON1,
	programCategory: ProgramCategory.WEIGHT_LOSS,
	programLocation: ProgramLocation.SEOUL,
	programPrice: 0,
	programDuration: 60,
	programCapacity: 1,
	programAddress: '',
	programDesc: '',
	programImages: [],
};

const AddProgram = () => {
	const device = useDeviceDetect();
	const router = useRouter();
	const user = useReactiveVar(userVar);
	const authReady = useReactiveVar(authReadyVar);
	const programId = typeof router.query.programId === 'string' ? router.query.programId : '';
	const inquiry = readTrainerProgramsInquiry(router.query.input);
	const [insertProgramData, setInsertProgramData] = useState<ProgramInput>({ ...initialValues });
	const [loadedId, setLoadedId] = useState('');
	const [formError, setFormError] = useState('');
	const [loadError, setLoadError] = useState('');
	const [uploading, setUploading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const submitting = useRef(false);
	const [createProgram, { loading: creating }] = useMutation(CREATE_PROGRAM);
	const [updateProgram, { loading: updating }] = useMutation(UPDATE_PROGRAM);

	/** APOLLO REQUESTS **/
	const { loading, refetch: getTrainerProgramsRefetch } = useQuery(GET_TRAINER_PROGRAMS, {
		fetchPolicy: 'network-only',
		variables: { input: inquiry },
		skip: !router.isReady || !programId || !authReady || user.memberType !== 'TRAINER',
		onCompleted: (data) => {
			const program: Program | undefined = data.getTrainerPrograms?.list?.find(
				(item: Program) => item._id === programId,
			);
			if (!program) {
				setLoadError('Program not found on this management page. Return to My Programs and select it again.');
				return;
			}
			setInsertProgramData(programPayload(program));
			setLoadedId(program._id);
			setLoadError('');
		},
		onError: () => setLoadError('Could not load this program. Return to My Programs to retry.'),
	});

	/** LIFECYCLES **/
	useEffect(() => {
		setLoadedId('');
		setLoadError('');
		setFormError('');
		if (!programId) setInsertProgramData({ ...initialValues });
	}, [programId]);

	/** HANDLERS **/
	const typeHandler = (type: ProgramType) => {
		setInsertProgramData({
			...insertProgramData,
			programType: type,
			programLocation:
				type === ProgramType.ONLINE
					? ProgramLocation.ONLINE
					: insertProgramData.programLocation === ProgramLocation.ONLINE
					? ProgramLocation.SEOUL
					: insertProgramData.programLocation,
			programCapacity: type === ProgramType.PT_1ON1 ? 1 : insertProgramData.programCapacity,
			programAddress: type === ProgramType.ONLINE ? '' : insertProgramData.programAddress,
		});
	};
	const uploadImages = async () => {
		if (uploading || !inputRef.current?.files?.length) return;
		setUploading(true);
		setFormError('');
		try {
			const files = Array.from(inputRef.current.files);
			if (files.length + insertProgramData.programImages.length > 5)
				throw new Error('Cannot upload more than 5 images.');
			if (files.some((file) => !['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)))
				throw new Error('Only JPEG and PNG images are allowed.');
			const formData = new FormData();
			formData.append(
				'operations',
				JSON.stringify({
					query:
						'mutation ImagesUploader($files: [Upload!]!, $target: String!) { imagesUploader(files: $files, target: $target) }',
					variables: { files: files.map(() => null), target: 'program' },
				}),
			);
			const map: Record<string, string[]> = {};
			files.forEach((_, index) => {
				map[String(index)] = ['variables.files.' + index];
			});
			formData.append('map', JSON.stringify(map));
			files.forEach((file, index) => formData.append(String(index), file));
			const response = await axios.post(
				process.env.REACT_APP_API_GRAPHQL_URL ?? 'http://localhost:3007/graphql',
				formData,
				{
					headers: { 'apollo-require-preflight': 'true', Authorization: 'Bearer ' + getJwtToken() },
				},
			);
			if (response.data.errors?.length) {
				if (isAuthenticationError({ graphQLErrors: response.data.errors })) invalidateSession();
				throw new Error(response.data.errors[0].message);
			}
			const images: string[] = response.data.data?.imagesUploader;
			if (!Array.isArray(images) || images.length !== files.length) throw new Error('Image upload failed.');
			setInsertProgramData((previous) => ({ ...previous, programImages: [...previous.programImages, ...images] }));
		} catch (err: any) {
			if (isAuthenticationError(err)) invalidateSession();
			setFormError(err.message ?? 'Image upload failed.');
		} finally {
			setUploading(false);
			if (inputRef.current) inputRef.current.value = '';
		}
	};
	const submitHandler = async (event: React.FormEvent) => {
		event.preventDefault();
		if (submitting.current || uploading || (programId && loadedId !== programId)) return;
		const error = programFormError(insertProgramData);
		if (error) {
			setFormError(error);
			return;
		}
		submitting.current = true;
		setFormError('');
		try {
			const payload = programPayload(insertProgramData, Boolean(programId));
			if (programId) await updateProgram({ variables: { input: { ...payload, _id: programId } } });
			else await createProgram({ variables: { input: payload } });
			await sweetMixinSuccessAlert(programId ? 'Program updated successfully.' : 'Program created successfully.');
			await router.push({ pathname: '/mypage', query: { category: 'myPrograms', input: JSON.stringify(inquiry) } });
		} catch (err: any) {
			if (/program changed|conflict/i.test(err.message ?? '')) {
				await getTrainerProgramsRefetch();
				setFormError('Program changed. The latest values have been loaded; review them before saving again.');
			} else setFormError(err.message ?? 'Could not save this program.');
		} finally {
			submitting.current = false;
		}
	};

	if (!authReady) return <p>Loading profile...</p>;
	if (user.memberType !== 'TRAINER') return <p>Only trainers can manage programs.</p>;
	if (device === 'mobile') return <div>ADD PROGRAM MOBILE PAGE</div>;
	if (programId && (loading || loadedId !== programId || loadError))
		return (
			<Stack>
				<Typography role={loadError ? 'alert' : undefined}>{loadError || 'Loading program...'}</Typography>
				<Button onClick={() => router.push('/mypage?category=myPrograms')}>My Programs</Button>
			</Stack>
		);

	return (
		<div id="add-program-page">
			<Stack className="main-title-box">
				<Typography className="main-title">{programId ? 'Edit Program' : 'Add New Program'}</Typography>
			</Stack>
			<form onSubmit={submitHandler}>
				<Stack className="config">
					<Stack className="description-box" spacing={3}>
						<Stack className="config-column">
							<Typography className="title">Program name</Typography>
							<input
								className="description-input"
								value={insertProgramData.programName}
								maxLength={100}
								onChange={(e) => setInsertProgramData({ ...insertProgramData, programName: e.target.value })}
							/>
						</Stack>
						<Stack className="config-row" spacing={2} direction="row">
							<Stack className="price-year-after-price">
								<Typography className="title">Type</Typography>
								<select
									className="select-description"
									value={insertProgramData.programType}
									onChange={(e) => typeHandler(e.target.value as ProgramType)}
								>
									{Object.values(ProgramType).map((value) => (
										<option key={value} value={value}>
											{value.replace(/_/g, ' ')}
										</option>
									))}
								</select>
							</Stack>
							<Stack className="price-year-after-price">
								<Typography className="title">Category</Typography>
								<select
									className="select-description"
									value={insertProgramData.programCategory}
									onChange={(e) =>
										setInsertProgramData({ ...insertProgramData, programCategory: e.target.value as ProgramCategory })
									}
								>
									{Object.values(ProgramCategory).map((value) => (
										<option key={value} value={value}>
											{value.replace(/_/g, ' ')}
										</option>
									))}
								</select>
							</Stack>
						</Stack>
						<Stack className="config-row" spacing={2} direction="row">
							{(['programPrice', 'programDuration', 'programCapacity'] as const).map((key, index) => (
								<Stack key={key} className="price-year-after-price">
									<Typography className="title">
										{['Price (KRW/session)', 'Duration (minutes/session)', 'Capacity (participants/session)'][index]}
									</Typography>
									<input
										className="description-input"
										type="number"
										min={index === 0 ? 0 : 1}
										max={2147483647}
										step={1}
										disabled={key === 'programCapacity' && insertProgramData.programType === ProgramType.PT_1ON1}
										value={Number.isNaN(insertProgramData[key]) ? '' : insertProgramData[key]}
										onChange={(e) =>
											setInsertProgramData({
												...insertProgramData,
												[key]: e.target.value === '' ? NaN : Number(e.target.value),
											})
										}
									/>
								</Stack>
							))}
						</Stack>
						<Stack className="config-column">
							<Typography className="title">Location</Typography>
							<select
								className="select-description"
								value={insertProgramData.programLocation}
								disabled={insertProgramData.programType === ProgramType.ONLINE}
								onChange={(e) =>
									setInsertProgramData({ ...insertProgramData, programLocation: e.target.value as ProgramLocation })
								}
							>
								{Object.values(ProgramLocation)
									.filter(
										(location) =>
											insertProgramData.programType === ProgramType.ONLINE || location !== ProgramLocation.ONLINE,
									)
									.map((value) => (
										<option key={value} value={value}>
											{value}
										</option>
									))}
							</select>
						</Stack>
						{insertProgramData.programType !== ProgramType.ONLINE && (
							<Stack className="config-column">
								<Typography className="title">Physical address</Typography>
								<input
									className="description-input"
									value={insertProgramData.programAddress ?? ''}
									maxLength={100}
									onChange={(e) => setInsertProgramData({ ...insertProgramData, programAddress: e.target.value })}
								/>
							</Stack>
						)}
						<Stack className="config-column">
							<Typography className="title">Description (optional)</Typography>
							<textarea
								className="description-input"
								value={insertProgramData.programDesc ?? ''}
								maxLength={500}
								onChange={(e) => setInsertProgramData({ ...insertProgramData, programDesc: e.target.value })}
							/>
						</Stack>
						<Stack className="config-column">
							<Typography className="title">Program images (up to 5)</Typography>
							<input
								ref={inputRef}
								type="file"
								accept="image/jpeg,image/png"
								multiple
								disabled={uploading || creating || updating}
								onChange={uploadImages}
							/>
							{uploading && <Typography>Uploading images...</Typography>}
							<Stack direction="row" spacing={2} flexWrap="wrap">
								{insertProgramData.programImages.map((image, index) => (
									<Stack key={image}>
										<img
											src={REACT_APP_API_URL + '/' + image}
											alt={'Program image ' + (index + 1)}
											width={120}
											height={90}
											style={{ objectFit: 'cover' }}
										/>
										<Button
											type="button"
											disabled={uploading}
											onClick={() =>
												setInsertProgramData({
													...insertProgramData,
													programImages: insertProgramData.programImages.filter((_, position) => position !== index),
												})
											}
										>
											Remove
										</Button>
									</Stack>
								))}
							</Stack>
						</Stack>
						{formError && (
							<Typography role="alert" color="error">
								{formError}
							</Typography>
						)}
						<Button type="submit" variant="contained" disabled={creating || updating || uploading}>
							{creating || updating ? 'Saving...' : programId ? 'Save Changes' : 'Create Program'}
						</Button>
					</Stack>
				</Stack>
			</form>
		</div>
	);
};

export default AddProgram;
