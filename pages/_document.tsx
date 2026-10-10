import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
	return (
		<Html lang="en">
			<Head>
				<meta name="robots" content="index,follow" />
				<link rel="icon" type="image/svg+xml" href="/img/logo/gymflow-mark.svg" />

				{/* SEO */}
				<meta name="keyword" content={'GymFlow, fitness programs, personal training, trainers, Korea'} />
				<meta
					name={'description'}
					content={
						'Discover fitness programs and trainers across Korea with GymFlow. Compare personal training, group classes and online sessions. | ' +
						'Найдите фитнес-программы и тренеров в Корее с GymFlow. | ' +
						'GymFlow에서 한국 전역의 운동 프로그램과 트레이너를 찾아보세요.'
					}
				/>
			</Head>
			<body>
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}
