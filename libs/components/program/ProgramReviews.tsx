import React, { useEffect, useState } from 'react';
import { useQuery, useReactiveVar } from '@apollo/client';
import { Avatar, Button, Pagination, Rating, Skeleton } from '@mui/material';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { GET_REVIEWS } from '../../../apollo/user/query';
import { authReadyVar } from '../../../apollo/store';
import { REACT_APP_API_URL } from '../../config';
import { reviewDate, reviewerName, reviewsLimit, reviewTotal } from '../../reviews';
import { Reviews } from '../../types/review/review';
import { ReviewsInquiry } from '../../types/review/review.input';

const ProgramReviews = ({ programId }: { programId: string }) => {
	const { t } = useTranslation('common');
	const { locale = 'en' } = useRouter();
	const authReady = useReactiveVar(authReadyVar);
	const [page, setPage] = useState(1);
	const input: ReviewsInquiry = { page, limit: reviewsLimit, search: { programId } };
	const { data, error, loading, refetch } = useQuery<{ getReviews: Reviews }>(GET_REVIEWS, {
		variables: { input },
		context: { handleErrorLocally: true },
		fetchPolicy: 'network-only',
		notifyOnNetworkStatusChange: true,
		skip: !authReady || !/^[a-f\d]{24}$/i.test(programId),
	});
	const result = data?.getReviews;
	const total = reviewTotal(result);
	const lastPage = Math.max(1, Math.ceil(total / reviewsLimit));
	useEffect(() => {
		if (!loading && !error && result && page > lastPage) setPage(lastPage);
	}, [result, loading, error, page, lastPage]);
	const busy = !authReady || loading;
	return (
		<section className="program-reviews" aria-labelledby="program-reviews-title" aria-busy={busy}>
			<header className="program-reviews-heading">
				<h2 id="program-reviews-title">{t('Reviews.Title')}</h2>
				{!busy && !error && total > 0 && (
					<div className="program-reviews-aggregate">
						{result?.averageRating != null && (
							<>
								<strong>
									{new Intl.NumberFormat(locale === 'kr' ? 'ko-KR' : locale, { maximumFractionDigits: 1 }).format(
										result.averageRating,
									)}
								</strong>
								<Rating
									value={result.averageRating}
									precision={0.1}
									readOnly
									size="small"
									getLabelText={(value) => t('Reviews.Stars', { count: value })}
								/>
							</>
						)}
						<span>{t('Reviews.Count', { count: total })}</span>
					</div>
				)}
			</header>
			{busy ? (
				<div className="program-reviews-state" role="status">
					<p>{t('Reviews.Loading')}</p>
					<Skeleton height={60} />
					<Skeleton height={60} />
					<Skeleton height={60} />
				</div>
			) : error || !result ? (
				<div className="program-reviews-state" role="alert">
					<p>{t('Reviews.Load error')}</p>
					<Button onClick={() => void refetch().catch(() => {})}>{t('MyBookings.Retry')}</Button>
				</div>
			) : total === 0 ? (
				<div className="program-reviews-state">
					<h3>{t('Reviews.Empty')}</h3>
					<p>{t('Reviews.Empty description')}</p>
				</div>
			) : (
				<div className="program-reviews-list">
					{result.list.map((review) => {
						const name = reviewerName(review.memberData, t('Reviews.Member'));
						const image = review.memberData?.memberImage?.trim();
						const date = reviewDate(review.createdAt, locale);
						return (
							<article className="program-review" key={review._id}>
								<div className="program-review-heading">
									<div className="program-review-member">
										<Avatar
											src={
												image
													? /^https?:\/\//i.test(image)
														? image
														: `${REACT_APP_API_URL}/${image.replace(/^\//, '')}`
													: '/img/profile/defaultUser.svg'
											}
											alt=""
										>
											<PersonOutlineRoundedIcon aria-hidden="true" />
										</Avatar>
										<h3>{name}</h3>
									</div>
									<div className="program-review-meta">
										<Rating
											value={review.rating}
											readOnly
											size="small"
											getLabelText={(value) => t('Reviews.Stars', { count: value })}
										/>
										{date && <time dateTime={review.createdAt}>{date}</time>}
									</div>
								</div>
								<p className="program-review-content">{review.content}</p>
							</article>
						);
					})}
				</div>
			)}
			{!error && total > reviewsLimit && (
				<nav className="program-reviews-pagination" aria-label={t('Reviews.Pagination')}>
					<Pagination
						page={Math.min(page, lastPage)}
						count={lastPage}
						disabled={busy}
						siblingCount={0}
						boundaryCount={1}
						onChange={(_, value) => setPage(value)}
						getItemAriaLabel={(type, value, selected) =>
							type === 'page'
								? t(selected ? 'MyBookings.Current page' : 'MyBookings.Go to page', { page: value })
								: t(`MyBookings.${type}`)
						}
					/>
				</nav>
			)}
		</section>
	);
};

export default ProgramReviews;
