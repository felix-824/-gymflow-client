import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import { useTranslation } from 'next-i18next';
import { ProgramCategory } from '../../enums/program.enum';
import { initialProgramsInquiry, readProgramsInquiry } from '../../program';

const categories = [
	{
		category: ProgramCategory.WEIGHT_LOSS,
		image: '/img/fiber/cardio-running.webp',
		layout: 'category-feature',
	},
	{
		category: ProgramCategory.MUSCLE_GAIN,
		image: '/img/fiber/strength-dumbbell-curl.webp',
		layout: 'category-wide',
	},
	{ category: ProgramCategory.YOGA, image: '/img/fiber/yoga-outdoor-flow.webp', layout: 'category-yoga' },
	{ category: ProgramCategory.PILATES, image: '/img/fiber/pilates-reformer.webp', layout: 'category-pilates' },
	{ category: ProgramCategory.CROSSFIT, image: '/img/fiber/strength-lifting.webp', layout: 'category-crossfit' },
	{ category: ProgramCategory.CARDIO, image: '/img/fiber/cardio-skipping.webp', layout: 'category-cardio' },
	{ category: ProgramCategory.REHAB, image: '/img/fiber/yoga-senior-practice.webp', layout: 'category-rehab' },
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
									sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1023px) calc((100vw - 76px) / 2), 50vw"
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
