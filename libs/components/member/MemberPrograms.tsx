import React, { useEffect, useState } from 'react';
import { NextPage } from 'next';
import { Pagination, Stack, Typography } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import { ProgramCard } from '../mypage/ProgramCard';
import { Program } from '../../types/program/program';
import { ProgramsInquiry } from '../../types/program/program.input';
import { T } from '../../types/common';
import { useRouter } from 'next/router';
import { useQuery } from '@apollo/client';
import { GET_PROGRAMS } from '../../../apollo/user/query';

const MyPrograms: NextPage = ({ initialInput, ...props }: any) => {
	const device = useDeviceDetect();
	const router = useRouter();
	const { memberId } = router.query;
	const [searchFilter, setSearchFilter] = useState<ProgramsInquiry>({ ...initialInput });
	const [trainerPrograms, setTrainerPrograms] = useState<Program[]>([]);
	const [total, setTotal] = useState<number>(0);

	/** APOLLO REQUESTS **/
	const {
	loading: getProgramsLoading,
	data: getProgramsData,
	error: getProgramsError,
	refetch: getProgramsRefetch,
} = useQuery(GET_PROGRAMS, {
	fetchPolicy: 'network-only',
	variables: { input: searchFilter },
	skip: !searchFilter?.search?.memberId,
	notifyOnNetworkStatusChange: true,
	onCompleted: (data: any) => {
		setTrainerPrograms(data?.getPrograms?.list ?? []);
		setTotal(data?.getPrograms?.metaCounter?.[0]?.total ?? 0);
	},
});

	/** LIFECYCLES **/



	useEffect(() => {
		if (memberId)
			setSearchFilter({ ...initialInput, search: { ...initialInput.search, memberId: memberId as string } });
	}, [memberId]);

	/** HANDLERS **/
	const paginationHandler = (e: T, value: number) => {
		setSearchFilter({ ...searchFilter, page: value });
	};

	if (device === 'mobile') {
		return <div>GYMFLOW PROGRAMS MOBILE</div>;
	} else {
		return (
			<div id="member-programs-page">
				<Stack className="main-title-box">
					<Stack className="right-box">
						<Typography className="main-title">Programs</Typography>
					</Stack>
				</Stack>
				<Stack className="programs-list-box">
					<Stack className="list-box">
						{trainerPrograms?.length > 0 && (
							<Stack className="listing-title-box">
								<Typography className="title-text">Listing title</Typography>
								<Typography className="title-text">Date Published</Typography>
								<Typography className="title-text">Status</Typography>
								<Typography className="title-text">View</Typography>
							</Stack>
						)}
						{trainerPrograms?.length === 0 && (
							<div className={'no-data'}>
								<img src="/img/icons/icoAlert.svg" alt="" />
								<p>No Program found!</p>
							</div>
						)}
						{trainerPrograms?.map((program: Program) => {
							return <ProgramCard program={program} memberPage={true} key={program?._id} />;
						})}

						{trainerPrograms.length !== 0 && (
							<Stack className="pagination-config">
								<Stack className="pagination-box">
									<Pagination
										count={Math.ceil(total / searchFilter.limit)}
										page={searchFilter.page}
										shape="circular"
										color="primary"
										onChange={paginationHandler}
									/>
								</Stack>
								<Stack className="total-result">
									<Typography>{total} program available</Typography>
								</Stack>
							</Stack>
						)}
					</Stack>
				</Stack>
			</div>
		);
	}
};

MyPrograms.defaultProps = {
	initialInput: {
		page: 1,
		limit: 5,
		sort: 'createdAt',
		search: {
			memberId: '',
		},
	},
};

export default MyPrograms;
