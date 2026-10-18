import React, { SyntheticEvent, useState } from 'react';
import MuiAccordion, { AccordionProps } from '@mui/material/Accordion';
import { AccordionDetails, Box, Stack, Typography } from '@mui/material';
import MuiAccordionSummary, { AccordionSummaryProps } from '@mui/material/AccordionSummary';
import { useRouter } from 'next/router';
import { styled } from '@mui/material/styles';
import useDeviceDetect from '../../hooks/useDeviceDetect';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';

const Accordion = styled((props: AccordionProps) => <MuiAccordion disableGutters elevation={0} square {...props} />)(
	({ theme }) => ({
		border: `1px solid ${theme.palette.divider}`,
		'&:not(:last-child)': {
			borderBottom: 0,
		},
		'&:before': {
			display: 'none',
		},
	}),
);
const AccordionSummary = styled((props: AccordionSummaryProps) => (
	<MuiAccordionSummary expandIcon={<KeyboardArrowDownRoundedIcon sx={{ fontSize: '1.4rem' }} />} {...props} />
))(({ theme }) => ({
	backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, .05)' : '#fff',
	'& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
		transform: 'rotate(180deg)',
	},
	'& .MuiAccordionSummary-content': {
		marginLeft: theme.spacing(1),
	},
}));

const Faq = () => {
	const device = useDeviceDetect();
	const router = useRouter();
	const [category, setCategory] = useState<string>('program');
	const [expanded, setExpanded] = useState<string | false>('panel1');

	/** APOLLO REQUESTS **/
	/** LIFECYCLES **/

	/** HANDLERS **/
	const changeCategoryHandler = (category: string) => {
		setCategory(category);
	};

	const handleChange = (panel: string) => (event: SyntheticEvent, newExpanded: boolean) => {
		setExpanded(newExpanded ? panel : false);
	};

	const data: Record<string, { id: string; subject: string; content: string }[]> = {
		program: [
			{
				id: 'program-1',
				subject: 'What programs can I find?',
				content: 'Browse personal training, group classes and online programs by category, location and price.',
			},
			{
				id: 'program-2',
				subject: 'What do price and capacity mean?',
				content:
					'Price is KRW per session. Duration is minutes per session, and capacity is the maximum number of participants per session.',
			},
			{
				id: 'program-3',
				subject: 'Why is a saved program unavailable?',
				content:
					'A program may be paused or deleted, or its trainer may no longer be active. Only visible programs appear in the public catalog.',
			},
		],
		buyers: [
			{
				id: 'users-1',
				subject: 'How can I save programs?',
				content:
					'Sign in and use the heart button to add or remove favorites. Favorites and recently visited programs are available in My Page.',
			},
		],
		trainers: [
			{
				id: 'trainers-1',
				subject: 'How do I publish a program?',
				content:
					'Register as a TRAINER, open My Page and choose Add Program. Complete the required details and upload at least one image.',
			},
			{
				id: 'trainers-2',
				subject: 'Can I pause or delete my program?',
				content:
					'Use My Programs to pause or resume a program. Deletion is permanent for trainers and cannot be reversed.',
			},
			{
				id: 'trainers-3',
				subject: 'How do I edit a paused program?',
				content: 'Open the edit action from My Programs. Paused programs are managed there and are not shown publicly.',
			},
		],
		membership: [
			{
				id: 'account-1',
				subject: 'Which account types are available?',
				content: 'You can register as a USER or TRAINER. Your profile can be updated in My Page.',
			},
		],
		community: [
			{
				id: 'community-1',
				subject: 'How can I participate?',
				content:
					'Sign in to publish articles, like posts, follow members and comment on articles. Comments must contain 1–100 characters.',
			},
		],
	};

	if (device === 'mobile') {
		return <div>FAQ MOBILE</div>;
	} else {
		return (
			<Stack className={'faq-content'}>
				<Box className={'categories'} component={'div'}>
					<div
						className={category === 'program' ? 'active' : ''}
						onClick={() => {
							changeCategoryHandler('program');
						}}
					>
						Program
					</div>
					<div
						className={category === 'buyers' ? 'active' : ''}
						onClick={() => {
							changeCategoryHandler('buyers');
						}}
					>
						For Users
					</div>
					<div
						className={category === 'trainers' ? 'active' : ''}
						onClick={() => {
							changeCategoryHandler('trainers');
						}}
					>
						For Trainers
					</div>
					<div
						className={category === 'membership' ? 'active' : ''}
						onClick={() => {
							changeCategoryHandler('membership');
						}}
					>
						Membership
					</div>
					<div
						className={category === 'community' ? 'active' : ''}
						onClick={() => {
							changeCategoryHandler('community');
						}}
					>
						Community
					</div>
				</Box>
				<Box className={'wrap'} component={'div'}>
					{data[category] &&
						data[category].map((ele: any) => (
							<Accordion expanded={expanded === ele?.id} onChange={handleChange(ele?.id)} key={ele?.subject}>
								<AccordionSummary id="panel1d-header" className="question" aria-controls="panel1d-content">
									<Typography className="badge" variant={'h4'}>
										Q
									</Typography>
									<Typography> {ele?.subject}</Typography>
								</AccordionSummary>
								<AccordionDetails>
									<Stack className={'answer flex-box'}>
										<Typography className="badge" variant={'h4'} color={'primary'}>
											A
										</Typography>
										<Typography> {ele?.content}</Typography>
									</Stack>
								</AccordionDetails>
							</Accordion>
						))}
				</Box>
			</Stack>
		);
	}
};

export default Faq;
