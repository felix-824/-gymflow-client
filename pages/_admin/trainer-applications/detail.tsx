import withAdminLayout from '../../../libs/components/layout/LayoutAdmin';
import TrainerApplicationDetail from '../../../libs/components/admin/trainer-applications/TrainerApplicationDetail';

export { getStaticProps } from './index';
export default withAdminLayout(TrainerApplicationDetail);
