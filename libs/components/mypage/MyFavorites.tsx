import React, { useState } from 'react';
import { NextPage } from 'next';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { Pagination, Stack, Typography } from '@mui/material';
import ProgramCard from '../program/ProgramCard';
import { Program } from '../../types/program/program';
import { T } from '../../types/common';
import { useMutation, useQuery } from '@apollo/client';
import { GET_FAVORITES } from '../../../apollo/user/query';
import { LIKE_TARGET_PROGRAM } from '../../../apollo/user/mutation';
import { Messages } from './../../config';
import { sweetMixinErrorAlert } from './../../sweetAlert';

const MyFavorites: NextPage = () => {
	const device = useDeviceDetect();
	const [myFavorites, setMyFavorites] = useState<Program[]>([]);
	const [total, setTotal] = useState<number>(0);
	const [searchFavorites, setSearchFavorites] = useState<T>({ page: 1, limit: 6 });

	/** APOLLO REQUESTS **/
	const [likeTargetProgram] = useMutation(LIKE_TARGET_PROGRAM);

	const {
		loading: getFavoritesLoading,
		data: getFavoritesData,
		error: getFavoritesError,
		refetch: getFavoritesRefetch,
	} = useQuery(GET_FAVORITES, {
		fetchPolicy: 'network-only',
		variables: {
			input: searchFavorites,
		},
		notifyOnNetworkStatusChange: true,
		onCompleted(data: T) {
			setMyFavorites(data.getFavorites?.list ?? []);
			const count = data.getFavorites?.metaCounter?.[0]?.total ?? 0;
			setTotal(count);
			const lastPage = Math.max(1, Math.ceil(count / searchFavorites.limit));
			if (searchFavorites.page > lastPage) setSearchFavorites({ ...searchFavorites, page: lastPage });
		},
	});

	/** HANDLERS **/
	const paginationHandler = (e: T, value: number) => {
		setSearchFavorites({ ...searchFavorites, page: value });
	};

	const likeProgramHandler = async (user: any, id: string) => {
		try {
			if (!id) return;
			if (!user._id) throw new Error(Messages.error2);

			await likeTargetProgram({
				variables: {
					input: id,
				},
			});

			await getFavoritesRefetch({ input: searchFavorites });
		} catch (err: any) {
			console.log('ERROR, likeProgramHandler:', err.message);
			sweetMixinErrorAlert(err.message).then();
		}
	};

	if (device === 'mobile') {
		return <div>GYMFLOW MY FAVORITES MOBILE</div>;
	} else {
		return (
			<div id="my-favorites-page">
				<Stack className="main-title-box">
					<Stack className="right-box">
						<Typography className="main-title">My Favorites</Typography>
						<Typography className="sub-title">We are glad to see you again!</Typography>
					</Stack>
				</Stack>
				<Stack className="favorites-list-box">
					{getFavoritesLoading && <p>Loading favorites...</p>}
					{getFavoritesError && <p role="alert">Could not load favorites.</p>}
					{myFavorites?.length ? (
						myFavorites?.map((program: Program) => {
							return (
								<ProgramCard
									key={program._id}
									program={program}
									likeProgramHandler={likeProgramHandler}
									myFavorites={true}
								/>
							);
						})
					) : (
						<div className={'no-data'}>
							<img src="/img/icons/icoAlert.svg" alt="" />
							<p>No Favorites found!</p>
						</div>
					)}
				</Stack>
				{myFavorites?.length ? (
					<Stack className="pagination-config">
						<Stack className="pagination-box">
							<Pagination
								count={Math.ceil(total / searchFavorites.limit)}
								page={searchFavorites.page}
								shape="circular"
								color="primary"
								onChange={paginationHandler}
							/>
						</Stack>
						<Stack className="total-result">
							<Typography>
								Total {total} favorite program{total > 1 ? 's' : ''}
							</Typography>
						</Stack>
					</Stack>
				) : null}
			</div>
		);
	}
};

export default MyFavorites;
