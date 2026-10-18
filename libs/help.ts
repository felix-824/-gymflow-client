export const HELP_TOPICS = [
	{ id: 'programs', audience: 'Members', questions: ['find-program', 'find-trainer', 'formats'] },
	{
		id: 'booking',
		audience: 'Members',
		questions: ['book-session', 'unavailable-slot', 'my-bookings', 'cancel-booking'],
	},
	{ id: 'account', audience: 'General', questions: ['create-account', 'account-types', 'update-profile'] },
	{ id: 'favorites', audience: 'Members', questions: ['save-program', 'leave-review', 'unavailable-program'] },
	{
		id: 'trainer-programs',
		audience: 'Trainers',
		questions: ['create-program', 'program-images', 'save-program-changes', 'program-status'],
	},
	{
		id: 'schedule',
		audience: 'Trainers',
		questions: ['set-availability', 'manage-reservations', 'reservation-statuses'],
	},
	{
		id: 'community',
		audience: 'Community',
		questions: ['write-article', 'comments-likes', 'my-articles', 'edit-article'],
	},
	{ id: 'images', audience: 'Media', questions: ['image-formats', 'image-count', 'image-cover'] },
] as const;

export const HELP_SHORTCUTS = [
	{ key: 'Booking', questionId: 'book-session' },
	{ key: 'Bookings', questionId: 'my-bookings' },
	{ key: 'Trainer', questionId: 'find-trainer' },
	{ key: 'Program', questionId: 'create-program' },
	{ key: 'Schedule', questionId: 'set-availability' },
] as const;

export interface HelpQuestion {
	id: string;
	question: string;
	answer: string;
}

export interface HelpTopic {
	id: string;
	audience: string;
	title: string;
	description: string;
	questions: HelpQuestion[];
}

export function readHelpTopics(t: (key: string) => string): HelpTopic[] {
	return HELP_TOPICS.map(({ id, audience, questions }) => {
		const key = `Help center.Topics.${id}`;
		return {
			id,
			audience: t(`Help center.Audiences.${audience}`),
			title: t(`${key}.Title`),
			description: t(`${key}.Description`),
			questions: questions.map((questionId) => ({
				id: questionId,
				question: t(`${key}.Questions.${questionId}.Question`),
				answer: t(`${key}.Questions.${questionId}.Answer`),
			})),
		};
	});
}

export function filterHelpTopics(topics: HelpTopic[], input: string): HelpTopic[] {
	const query = input.trim().toLocaleLowerCase();
	if (!query) return topics;
	return topics.flatMap((topic) => {
		if (`${topic.title} ${topic.description}`.toLocaleLowerCase().includes(query)) return [topic];
		const questions = topic.questions.filter(({ question, answer }) =>
			`${question} ${answer}`.toLocaleLowerCase().includes(query),
		);
		return questions.length ? [{ ...topic, questions }] : [];
	});
}
