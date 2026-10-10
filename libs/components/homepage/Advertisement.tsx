import React from 'react';
import { Stack, Typography, Button } from '@mui/material';
import Link from 'next/link';

const Advertisement = () => (
	<Stack
		className="video-frame"
		sx={{
			alignItems: 'center',
			justifyContent: 'center',
			gap: 3,
			background: 'linear-gradient(120deg, #181a20, #394a42)',
			color: 'white',
			padding: 4,
		}}
	>
		<Typography variant="h3" align="center">
			Make room for your next fitness goal.
		</Typography>
		<Typography align="center">Personal training, group classes and online programs in one place.</Typography>
		<Link href="/program">
			<Button variant="contained">Explore programs</Button>
		</Link>
	</Stack>
);
export default Advertisement;
