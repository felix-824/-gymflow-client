import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Filter from '../program/Filter';
import { ProgramsInquiry } from '../../types/program/program.input';
import { initialProgramsInquiry } from '../../program';

const HeaderFilter = () => {
	const router = useRouter();
	const [searchFilter, setSearchFilter] = useState<ProgramsInquiry>(initialProgramsInquiry);
	const pushSearchHandler = (input: ProgramsInquiry) => {
		setSearchFilter(input);
		void router.push({ pathname: '/program', query: { input: JSON.stringify(input) } });
	};
	return (
		<Filter
			searchFilter={searchFilter}
			setSearchFilter={pushSearchHandler}
			initialInput={initialProgramsInquiry}
			compact
		/>
	);
};

export default HeaderFilter;
