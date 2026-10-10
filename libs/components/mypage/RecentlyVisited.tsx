import React, { useState } from 'react';
import { NextPage } from 'next';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Pagination, Stack, Typography } from '@mui/material';
import ProgramCard from '../program/ProgramCard';
import { Program } from '../../types/program/program';
import { T } from '../../types/common';
import { useQuery } from '@apollo/client';
import { GET_VISITED } from '../../../apollo/user/query';

const RecentlyVisited: NextPage = () => {
	const device = useDeviceDetect();
	const [recentlyVisited, setRecentlyVisited] = useState<Program[]>([]);
	const [total, setTotal] = useState<number>(0);
	const [searchVisited, setSearchVisited] = useState<T>({ page: 1, limit: 6 });

	/** APOLLO REQUESTS **/
	const { loading, error } = useQuery(GET_VISITED, {
		fetchPolicy: 'network-only',
		variables: { input: searchVisited },
		onCompleted: (data) => {
			const total = data.getVisited?.metaCounter?.[0]?.total ?? 0;
			setRecentlyVisited(data.getVisited?.list ?? []);
			setTotal(total);
			const lastPage = Math.max(1, Math.ceil(total / searchVisited.limit));
			if (searchVisited.page > lastPage) setSearchVisited({ ...searchVisited, page: lastPage });
		},
	});

	/** HANDLERS **/
	const paginationHandler = (e: T, value: number) => {
		setSearchVisited({ ...searchVisited, page: value });
	};

	if (device === 'mobile') {
		return <div>GYMFLOW MY FAVORITES MOBILE</div>;
	} else {
		return (
			<div id="my-favorites-page">
				<Stack className="main-title-box">
					<Stack className="right-box">
						<Typography className="main-title">Recently Visited</Typography>
						<Typography className="sub-title">We are glad to see you again!</Typography>
					</Stack>
				</Stack>
				<Stack className="favorites-list-box">
					{loading && <p>Loading history...</p>}
					{error && <p role="alert">Could not load history.</p>}
					{recentlyVisited?.length ? (
						recentlyVisited?.map((program: Program) => {
							return <ProgramCard key={program._id} program={program} recentlyVisited={true} />;
						})
					) : (
						<div className={'no-data'}>
							<img src="/img/icons/icoAlert.svg" alt="" />
							<p>No Recently Visited Programs found!</p>
						</div>
					)}
				</Stack>
				{recentlyVisited?.length ? (
					<Stack className="pagination-config">
						<Stack className="pagination-box">
							<Pagination
								count={Math.ceil(total / searchVisited.limit)}
								page={searchVisited.page}
								shape="circular"
								color="primary"
								onChange={paginationHandler}
							/>
						</Stack>
						<Stack className="total-result">
							<Typography>
								Total {total} recently visited program{total > 1 ? 's' : ''}
							</Typography>
						</Stack>
					</Stack>
				) : null}
			</div>
		);
	}
};

export default RecentlyVisited;
