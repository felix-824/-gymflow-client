import React, { useCallback, useState } from 'react';
import { NextPage } from 'next';
import useDeviceDetect from '../../libs/hooks/useDeviceDetect';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import { Box, Button, Checkbox, FormControlLabel, FormGroup, Stack } from '@mui/material';
import { useRouter } from 'next/router';
import { logIn, signUp } from '../../libs/auth';
import { sweetMixinErrorAlert } from '../../libs/sweetAlert';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const getStaticProps = async ({ locale }: any) => ({
	props: {
		...(await serverSideTranslations(locale, ['common'])),
	},
});

const Join: NextPage = () => {
	const router = useRouter();
	const device = useDeviceDetect();
	const [input, setInput] = useState({ nick: '', password: '', phone: '', type: 'USER' });
	const [loginView, setLoginView] = useState<boolean>(true);
	const [submitting, setSubmitting] = useState(false);

	/** HANDLERS **/
	const viewChangeHandler = (state: boolean) => {
		setLoginView(state);
	};

	const checkUserTypeHandler = (e: any) => {
		const checked = e.target.checked;
		if (checked) {
			const value = e.target.name;
			handleInput('type', value);
		} else {
			handleInput('type', 'USER');
		}
	};

	const handleInput = useCallback((name: any, value: any) => {
		setInput((prev) => {
			return { ...prev, [name]: value };
		});
	}, []);

	const doLogin = useCallback(async () => {
		if (submitting) return;
		setSubmitting(true);
		try {
			await logIn(input.nick, input.password);
			const referrer = router.query.referrer;
			await router.push(
				typeof referrer === 'string' && referrer.startsWith('/') && !referrer.startsWith('//') ? referrer : '/',
			);
		} catch (err: any) {
			await sweetMixinErrorAlert(err.message);
		} finally {
			setSubmitting(false);
		}
	}, [input, router, submitting]);

	const doSignUp = useCallback(async () => {
		if (submitting) return;
		setSubmitting(true);
		try {
			await signUp(input.nick, input.password, input.phone, input.type);
			const referrer = router.query.referrer;
			await router.push(
				typeof referrer === 'string' && referrer.startsWith('/') && !referrer.startsWith('//') ? referrer : '/',
			);
		} catch (err: any) {
			await sweetMixinErrorAlert(err.message);
		} finally {
			setSubmitting(false);
		}
	}, [input, router, submitting]);

	if (device === 'mobile') {
		return <div>LOGIN MOBILE</div>;
	} else {
		return (
			<Stack className={'join-page'}>
				<Stack className={'container'}>
					<Stack className={'main'}>
						<Stack className={'left'}>
							{/* @ts-ignore */}
							<Box className={'logo'}>
								<strong className="gymflow-logo">GymFlow</strong>
								<span>GymFlow</span>
							</Box>
							<Box className={'info'}>
								<span>{loginView ? 'login' : 'signup'}</span>
								<p>{loginView ? 'Login' : 'Sign'} in with this account across the following sites.</p>
							</Box>
							<Box className={'input-wrap'}>
								<div className={'input-box'}>
									<span>Nickname</span>
									<input
										type="text"
										placeholder={'Enter Nickname'}
										onChange={(e) => handleInput('nick', e.target.value)}
										required={true}
										onKeyDown={(event) => {
											if (event.key == 'Enter' && loginView) doLogin();
											if (event.key == 'Enter' && !loginView) doSignUp();
										}}
									/>
								</div>
								<div className={'input-box'}>
									<span>Password</span>
									<input
										type="text"
										placeholder={'Enter Password'}
										onChange={(e) => handleInput('password', e.target.value)}
										required={true}
										onKeyDown={(event) => {
											if (event.key == 'Enter' && loginView) doLogin();
											if (event.key == 'Enter' && !loginView) doSignUp();
										}}
									/>
								</div>
								{!loginView && (
									<div className={'input-box'}>
										<span>Phone</span>
										<input
											type="text"
											placeholder={'Enter Phone'}
											onChange={(e) => handleInput('phone', e.target.value)}
											required={true}
											onKeyDown={(event) => {
												if (event.key == 'Enter') doSignUp();
											}}
										/>
									</div>
								)}
							</Box>
							<Box className={'register'}>
								{!loginView && (
									<div className={'type-option'}>
										<span className={'text'}>I want to be registered as:</span>
										<div>
											<FormGroup>
												<FormControlLabel
													control={
														<Checkbox
															size="small"
															name={'USER'}
															onChange={checkUserTypeHandler}
															checked={input?.type == 'USER'}
														/>
													}
													label="User"
												/>
											</FormGroup>
											<FormGroup>
												<FormControlLabel
													control={
														<Checkbox
															size="small"
															name={'TRAINER'}
															onChange={checkUserTypeHandler}
															checked={input?.type == 'TRAINER'}
														/>
													}
													label="Trainer"
												/>
											</FormGroup>
										</div>
									</div>
								)}

								{loginView && (
									<div className={'remember-info'}>
										<FormGroup>
											<FormControlLabel control={<Checkbox defaultChecked size="small" />} label="Remember me" />
										</FormGroup>
										<a>Lost your password?</a>
									</div>
								)}

								{loginView ? (
									<Button
										variant="contained"
										endIcon={<img src="/img/icons/rightup.svg" alt="" />}
										disabled={submitting || input.nick == '' || input.password == ''}
										onClick={doLogin}
									>
										LOGIN
									</Button>
								) : (
									<Button
										variant="contained"
										disabled={
											submitting || input.nick == '' || input.password == '' || input.phone == '' || input.type == ''
										}
										onClick={doSignUp}
										endIcon={<img src="/img/icons/rightup.svg" alt="" />}
									>
										SIGNUP
									</Button>
								)}
							</Box>
							<Box className={'ask-info'}>
								{loginView ? (
									<p>
										Not registered yet?
										<b
											onClick={() => {
												viewChangeHandler(false);
											}}
										>
											SIGNUP
										</b>
									</p>
								) : (
									<p>
										Have account?
										<b onClick={() => viewChangeHandler(true)}> LOGIN</b>
									</p>
								)}
							</Box>
						</Stack>
						<Stack className={'right'}></Stack>
					</Stack>
				</Stack>
			</Stack>
		);
	}
};

export default withLayoutBasic(Join);
