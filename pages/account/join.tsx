import React, { FormEvent, useRef, useState } from 'react';
import { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button, CircularProgress, IconButton } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AlternateEmailRoundedIcon from '@mui/icons-material/AlternateEmailRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import SportsOutlinedIcon from '@mui/icons-material/SportsOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import withLayoutBasic from '../../libs/components/layout/LayoutBasic';
import { logIn, signUp } from '../../libs/auth';
import { authErrorMessage, safeAuthDestination } from '../../libs/auth-form';

export const getStaticProps = async ({ locale }: any) => ({
	props: { ...(await serverSideTranslations(locale, ['common'])) },
});

const Join: NextPage = () => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const [input, setInput] = useState({ nick: '', password: '', confirmPassword: '', phone: '', type: 'USER' });
	const [loginView, setLoginView] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [mismatch, setMismatch] = useState(false);
	const [visible, setVisible] = useState({ password: false, confirmPassword: false });
	const writeLock = useRef(false);
	const confirmInput = useRef<HTMLInputElement>(null);

	/** HANDLERS **/
	const viewChangeHandler = (nextLoginView: boolean) => {
		if (writeLock.current) return;
		setLoginView(nextLoginView);
		setInput((previous) => ({ ...previous, password: '', confirmPassword: '' }));
		setVisible({ password: false, confirmPassword: false });
		setError('');
		setMismatch(false);
	};
	const handleInput = (name: keyof typeof input, value: string) => {
		setInput((previous) => ({ ...previous, [name]: value }));
		setError('');
		setMismatch(false);
	};
	const submitHandler = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (writeLock.current) return;
		setError('');
		if (!loginView && input.password !== input.confirmPassword) {
			setMismatch(true);
			setError(t('Auth.Password mismatch'));
			confirmInput.current?.focus();
			return;
		}
		writeLock.current = true;
		setSubmitting(true);
		try {
			if (loginView) await logIn(input.nick, input.password, { handleErrorLocally: true });
			else await signUp(input.nick, input.password, input.phone, input.type, { handleErrorLocally: true });
			await router.push(safeAuthDestination(router.query.referrer));
		} catch (err: unknown) {
			setError(authErrorMessage(err, t('Auth.Connection error'), t('Auth.Auth error')));
		} finally {
			writeLock.current = false;
			setSubmitting(false);
		}
	};
	const passwordField = (name: 'password' | 'confirmPassword', label: string) => (
		<div className="auth-field">
			<label htmlFor={`auth-${name}`}>
				<LockOutlinedIcon aria-hidden="true" />
				{t(`Auth.${label}`)}
			</label>
			<div className="auth-input-wrap">
				<LockOutlinedIcon className="auth-input-icon" aria-hidden="true" />
				<input
					ref={name === 'confirmPassword' ? confirmInput : undefined}
					id={`auth-${name}`}
					name={name}
					type={visible[name] ? 'text' : 'password'}
					value={input[name]}
					onChange={(event) => handleInput(name, event.target.value)}
					autoComplete={loginView ? 'current-password' : 'new-password'}
					required
					minLength={5}
					maxLength={12}
					placeholder={
						loginView ? '••••••••' : t(name === 'password' ? 'Auth.Create password' : 'Auth.Repeat password')
					}
					disabled={submitting}
					aria-invalid={name === 'confirmPassword' && mismatch}
					aria-describedby={name === 'confirmPassword' && mismatch ? 'auth-error' : undefined}
				/>
				<IconButton
					type="button"
					className="auth-visibility"
					disabled={submitting}
					aria-label={t(
						`Auth.${visible[name] ? 'Hide' : 'Show'} ${name === 'password' ? 'password' : 'confirm password'}`,
					)}
					aria-pressed={visible[name]}
					aria-controls={`auth-${name}`}
					onClick={() => setVisible((previous) => ({ ...previous, [name]: !previous[name] }))}
				>
					{visible[name] ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
				</IconButton>
			</div>
		</div>
	);

	return (
		<div className="auth-page">
			<header className="auth-header">
				<div className="auth-header-inner">
					<Link passHref href="/" className="auth-mobile-back" aria-label={t('Auth.Back to main')}>
						<ArrowBackRoundedIcon />
					</Link>
					<Link passHref href="/" className="auth-brand" aria-label={t('Program navigation.GymFlow home')}>
						Gym<span>Flow</span>
					</Link>
					<div className="auth-header-actions">
						<Link passHref href="/" className="auth-desktop-back">
							<ArrowBackRoundedIcon />
							{t('Auth.Back to main')}
						</Link>
						<span className="auth-account-mark" aria-hidden="true">
							<PersonOutlineRoundedIcon />
						</span>
					</div>
				</div>
			</header>
			<div className="auth-content">
				<div className="auth-composition">
					<aside className="auth-editorial">
						<img src="/img/auth/desktop-training.jpg" alt={t('Auth.Training photo')} />
						<span className="auth-discovery">{t('Auth.Fitness discovery')}</span>
						<div className="auth-editorial-copy">
							<p className="auth-eyebrow">{t('Auth.Fitness marketplace')}</p>
							<h2>{t('Auth.Marketplace title')}</h2>
							<p>{t('Auth.Marketplace copy')}</p>
						</div>
					</aside>
					<section className="auth-form-panel" aria-labelledby="auth-title">
						<div className="auth-form-inner">
							<div className="auth-mobile-intro">
								<img src="/img/auth/mobile-training.jpg" alt="" />
								<div>
									<p className="auth-eyebrow">{t('Auth.Fitness marketplace')}</p>
									<strong>{t(loginView ? 'Auth.Welcome back' : 'Auth.Create Account')}</strong>
									<p>{t('Auth.Marketplace copy')}</p>
								</div>
							</div>
							<div className="auth-mode-switch" role="group" aria-label={t('Auth.Authentication mode')}>
								<Button
									type="button"
									aria-pressed={loginView}
									disabled={submitting}
									onClick={() => viewChangeHandler(true)}
								>
									{t('Auth.Log In')}
								</Button>
								<Button
									type="button"
									aria-pressed={!loginView}
									disabled={submitting}
									onClick={() => viewChangeHandler(false)}
								>
									{t('Auth.Sign Up')}
								</Button>
							</div>
							<div className="auth-form-heading">
								<h1 id="auth-title">{t(loginView ? 'Auth.Welcome back' : 'Auth.Create Account')}</h1>
								<p>{t(loginView ? 'Auth.Login intro' : 'Auth.Signup intro')}</p>
							</div>
							<form onSubmit={submitHandler} aria-busy={submitting} aria-describedby={error ? 'auth-error' : undefined}>
								{!loginView && (
									<fieldset className="auth-role-field" disabled={submitting}>
										<legend>{t('Auth.Account Type')}</legend>
										<div className="auth-role-switch">
											{[
												{ value: 'USER', label: 'Member', Icon: FitnessCenterOutlinedIcon },
												{ value: 'TRAINER', label: 'Trainer', Icon: SportsOutlinedIcon },
											].map(({ value, label, Icon }) => (
												<label key={value}>
													<input
														type="radio"
														name="accountType"
														value={value}
														checked={input.type === value}
														onChange={() => handleInput('type', value)}
													/>
													<span>
														<Icon aria-hidden="true" />
														{t(`Auth.${label}`)}
													</span>
												</label>
											))}
										</div>
									</fieldset>
								)}
								<div className="auth-field">
									<label htmlFor="auth-nick">
										<AlternateEmailRoundedIcon aria-hidden="true" />
										{t('Auth.Nickname')}
									</label>
									<div className="auth-input-wrap">
										<AlternateEmailRoundedIcon className="auth-input-icon" aria-hidden="true" />
										<input
											id="auth-nick"
											name="nick"
											autoComplete="username"
											type="text"
											required
											minLength={3}
											maxLength={12}
											autoCapitalize="none"
											spellCheck={false}
											placeholder="@nickname"
											value={input.nick}
											onChange={(event) => handleInput('nick', event.target.value)}
											disabled={submitting}
										/>
									</div>
								</div>
								{!loginView && (
									<div className="auth-field">
										<label htmlFor="auth-phone">
											<PhoneOutlinedIcon aria-hidden="true" />
											{t('Auth.Phone')}
										</label>
										<div className="auth-input-wrap">
											<PhoneOutlinedIcon className="auth-input-icon" aria-hidden="true" />
											<input
												id="auth-phone"
												name="phone"
												autoComplete="tel"
												type="tel"
												required
												placeholder="+82 10-0000-0000"
												value={input.phone}
												onChange={(event) => handleInput('phone', event.target.value)}
												disabled={submitting}
											/>
										</div>
									</div>
								)}
								{passwordField('password', 'Password')}
								{!loginView && passwordField('confirmPassword', 'Confirm Password')}
								{error && (
									<p id="auth-error" className="auth-error" role="alert">
										{error}
									</p>
								)}
								<Button
									type="submit"
									variant="contained"
									className="auth-submit"
									disabled={submitting}
									endIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardRoundedIcon />}
								>
									{t(submitting ? 'Auth.Submitting' : loginView ? 'Auth.Log In' : 'Auth.Create Account')}
								</Button>
							</form>
							<p className="auth-switch-helper">
								{t(loginView ? 'Auth.New here' : 'Auth.Already registered')}{' '}
								<button type="button" disabled={submitting} onClick={() => viewChangeHandler(!loginView)}>
									{t(loginView ? 'Auth.Create Account' : 'Auth.Log In')}
								</button>
							</p>
						</div>
					</section>
				</div>
			</div>
			<footer className="auth-footer">
				<span>© GymFlow</span>
				<Link href="/help">{t('Auth.Support')}</Link>
			</footer>
		</div>
	);
};

export default withLayoutBasic(Join);
