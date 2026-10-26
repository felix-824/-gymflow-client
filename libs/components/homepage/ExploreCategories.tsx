import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import { useTranslation } from 'next-i18next';
import { ProgramCategory } from '../../enums/program.enum';
import { initialProgramsInquiry, readProgramsInquiry } from '../../program';

const categories = [
	{
		category: ProgramCategory.MUSCLE_GAIN,
		image: '/img/fiber/strength-dumbbell-curl.webp',
		layout: 'category-feature',
	},
	{ category: ProgramCategory.YOGA, image: '/img/fiber/yoga-outdoor-flow.webp', layout: 'category-yoga' },
	{ category: ProgramCategory.PILATES, image: '/img/fiber/pilates-training.webp', layout: 'category-pilates' },
	{ category: ProgramCategory.CARDIO, image: '/img/fiber/cardio-skipping.webp', layout: 'category-cardio' },
] as const;

const ExploreCategories = () => {
	const { t } = useTranslation('common');

	const getCategoryHref = (category: ProgramCategory) => {
		const inquiry = readProgramsInquiry(
			{
				...initialProgramsInquiry,
				page: 1,
				search: { categoryList: [category] },
			},
			initialProgramsInquiry,
		);

		return {
			pathname: '/program',
			query: { input: JSON.stringify(inquiry) },
		};
	};

	return (
		<section className="explore-categories" aria-labelledby="explore-categories-title">
			<div className="explore-categories-inner">
				<header className="explore-categories-header">
					<h2 id="explore-categories-title">{t('Home categories.Title')}</h2>
					<p>{t('Home categories.Description')}</p>
				</header>
				<div className="explore-categories-grid">
					{categories.map(({ category, image, layout }) => {
						const categoryName = t(`Program discovery card.${category}`);
						const compactImageSizes = layout === 'category-feature' || layout === 'category-yoga'
							? '(max-width: 767px) calc(100vw - 40px), (max-width: 1023px) calc(100vw - 64px)'
							: '(max-width: 359px) calc(100vw - 40px), (max-width: 767px) calc((100vw - 52px) / 2), (max-width: 1023px) calc((100vw - 80px) / 2)';
						const desktopImageSizes = layout === 'category-feature' || layout === 'category-yoga'
							? '(max-width: 1344px) calc((100vw - 80px) / 2), 632px'
							: '(max-width: 1344px) calc((100vw - 112px) / 4), 308px';

						return (
							<Link
								key={category}
								href={getCategoryHref(category)}
								passHref
								className={`explore-category-tile ${layout}`}
								aria-label={t('Home categories.Browse category', { category: categoryName })}
							>
								<Image
									src={image}
									alt=""
									fill
									sizes={`${compactImageSizes}, ${desktopImageSizes}`}
								/>
								<span className="explore-category-content">
									<span>{categoryName}</span>
									<ArrowOutwardRoundedIcon aria-hidden={true} />
								</span>
							</Link>
						);
					})}
				</div>
			</div>
		</section>
	);
};

export default ExploreCategories;
