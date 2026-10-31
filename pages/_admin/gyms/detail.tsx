import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import GymDetail from '../../../libs/components/admin/gyms/GymDetail';

export { getStaticProps } from './index';
export default withAdminLayout(GymDetail);
