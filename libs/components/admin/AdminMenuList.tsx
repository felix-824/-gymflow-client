import React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { adminWorkspaceLabels } from '../../admin-workspace-labels';

const AdminMenuList = ({ onNavigate }: { onNavigate?: () => void }) => {
	const router = useRouter();
	const labels = adminWorkspaceLabels(router.locale);
	const items = [
		{ path: 'users', label: labels.users, icon: <PeopleOutlineRoundedIcon /> },
		{ path: 'trainer-applications', label: labels.applications, icon: <AssignmentIndOutlinedIcon /> },
		{ path: 'programs', label: labels.programs, icon: <FitnessCenterOutlinedIcon /> },
		{ path: 'gyms', label: labels.gyms, icon: <StorefrontOutlinedIcon /> },
		{ path: 'community', label: labels.community, icon: <ForumOutlinedIcon /> },
	];
	return (
		<List className="workspace-management" disablePadding>
			{items.map(({ path, label, icon }) => {
				const href = '/_admin/' + path;
				const active = router.pathname === href || router.pathname.startsWith(href + '/');
				return (
					<Link key={path} href={href} passHref legacyBehavior>
						<ListItemButton
							component="a"
							className={active ? 'workspace-link on' : 'workspace-link'}
							aria-current={active ? 'page' : undefined}
							onClick={onNavigate}
						>
							<ListItemIcon>{icon}</ListItemIcon>
							<ListItemText primary={label} />
						</ListItemButton>
					</Link>
				);
			})}
		</List>
	);
};

export default AdminMenuList;
