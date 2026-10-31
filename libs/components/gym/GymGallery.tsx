import React, { useEffect, useRef, useState } from 'react';
import { IconButton, useMediaQuery } from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { ImageSquare } from 'phosphor-react';
import { useTranslation } from 'next-i18next';
import { isGymImagePath } from '../../gym';
import { REACT_APP_API_URL } from '../../config';

const GalleryImage = ({ path, alt, primary }: { path?: string; alt: string; primary: boolean }) => {
	const [failedPath, setFailedPath] = useState('');
	return isGymImagePath(path) && path !== failedPath ? (
		// Existing API upload origin and canonical Gym path validation.
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={`${REACT_APP_API_URL}/${path}`}
			alt={alt}
			loading={primary ? 'eager' : 'lazy'}
			decoding="async"
			onError={() => setFailedPath(path)}
		/>
	) : (
		<div className="gym-gallery-fallback" role="img" aria-label={alt}>
			<ImageSquare size={40} aria-hidden="true" />
		</div>
	);
};

const GymGallery = ({ images, name }: { images: string[]; name: string }) => {
	const { t } = useTranslation('gyms');
	const mobile = useMediaQuery('(max-width:767px)');
	const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const track = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState(0);
	const photos = Array.isArray(images) ? images.slice(0, 5) : [];
	useEffect(() => {
		setActive(0);
	}, [mobile, images]);
	const move = (index: number) => {
		const target = Math.max(0, Math.min(photos.length - 1, index));
		track.current?.scrollTo({ left: target * track.current.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
		setActive(target);
	};
	return (
		<section className={`gym-gallery is-count-${photos.length}`} aria-label={t('detail.gallery')}>
			{mobile ? (
				<>
					<div
						ref={track}
						className="gym-gallery-track"
						tabIndex={0}
						aria-label={t('detail.gallery')}
						onKeyDown={(event) => {
							if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
								event.preventDefault();
								move(active + (event.key === 'ArrowRight' ? 1 : -1));
							}
						}}
						onScroll={() => {
							if (track.current?.clientWidth)
								setActive(
									Math.max(
										0,
										Math.min(photos.length - 1, Math.round(track.current.scrollLeft / track.current.clientWidth)),
									),
								);
						}}
					>
						{photos.length ? (
							photos.map((path, index) => (
								<div className="gym-gallery-slide" key={index}>
									<GalleryImage
										key={path}
										path={path}
										primary={index === 0}
										alt={t('detail.photoAlt', { name, number: index + 1 })}
									/>
								</div>
							))
						) : (
							<div className="gym-gallery-slide">
								<GalleryImage primary alt={t('catalog.coverAlt', { name })} />
							</div>
						)}
					</div>
					{photos.length > 0 && (
						<div className="gym-gallery-controls">
							<IconButton
								aria-label={t('detail.previousPhoto')}
								disabled={active <= 0}
								onClick={() => move(active - 1)}
							>
								<ChevronLeftRoundedIcon />
							</IconButton>
							<span aria-live="polite">
								{active + 1} / {photos.length}
							</span>
							<IconButton
								aria-label={t('detail.nextPhoto')}
								disabled={active >= photos.length - 1}
								onClick={() => move(active + 1)}
							>
								<ChevronRightRoundedIcon />
							</IconButton>
						</div>
					)}
				</>
			) : (
				<div className="gym-gallery-grid">
					{photos.length ? (
						photos.map((path, index) => (
							<div className="gym-gallery-cell" key={index}>
								<GalleryImage
									key={path}
									path={path}
									primary={index === 0}
									alt={t('detail.photoAlt', { name, number: index + 1 })}
								/>
							</div>
						))
					) : (
						<div className="gym-gallery-cell">
							<GalleryImage primary alt={t('catalog.coverAlt', { name })} />
						</div>
					)}
				</div>
			)}
		</section>
	);
};

export default GymGallery;
