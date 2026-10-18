import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ locale, defaultLocale }) => ({
	redirect: {
		destination: locale && locale !== defaultLocale ? `/${locale}/help` : '/help',
		permanent: true,
	},
});

const CS = () => null;

export default CS;
