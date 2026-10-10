import React from 'react';
import { Stack, Box } from '@mui/material';
import useDeviceDetect from '../../hooks/useDeviceDetect';

interface EventData {
	eventTitle: string;
	city: string;
	description: string;
	imageSrc: string;
}
const eventsData: EventData[] = [
 { eventTitle: 'Discover local trainers', city: 'Incheon', description: 'Explore fitness programs in Incheon using the location filter.', imageSrc: '/img/events/INCHEON.webp' },
 { eventTitle: 'Find your training format', city: 'Seoul', description: 'Compare personal training and group programs in Seoul.', imageSrc: '/img/events/SEOUL.webp' },
 { eventTitle: 'Build your next routine', city: 'Daegu', description: 'Search by category and session duration to match your goals.', imageSrc: '/img/events/DAEGU.webp' },
 { eventTitle: 'Explore fitness nearby', city: 'Busan', description: 'Browse trainers and program details in Busan.', imageSrc: '/img/events/BUSAN.webp' },
];

const EventCard = ({ event }: { event: EventData }) => {
	const device = useDeviceDetect();

	if (device === 'mobile') {
		return <div>EVENT CARD</div>;
	} else {
		return (
			<Stack
				className="event-card"
				style={{
					backgroundImage: `url(${event?.imageSrc})`,
					backgroundSize: 'cover',
					backgroundPosition: 'center',
					backgroundRepeat: 'no-repeat',
				}}
			>
				<Box component={'div'} className={'info'}>
					<strong>{event?.city}</strong>
					<span>{event?.eventTitle}</span>
				</Box>
				<Box component={'div'} className={'more'}>
					<span>{event?.description}</span>
				</Box>
			</Stack>
		);
	}
};

const Events = () => {
	const device = useDeviceDetect();

	if (device === 'mobile') {
		return <div>EVENT CARD</div>;
	} else {
		return (
			<Stack className={'events'}>
				<Stack className={'container'}>
					<Stack className={'info-box'}>
						<Box component={'div'} className={'left'}>
							<span className={'white'}>Explore Fitness</span>
							<p className={'white'}>Find a program in your city.</p>
						</Box>
					</Stack>
					<Stack className={'card-wrapper'}>
						{eventsData.map((event: EventData) => {
							return <EventCard event={event} key={event?.eventTitle} />;
						})}
					</Stack>
				</Stack>
			</Stack>
		);
	}
};

export default Events;
