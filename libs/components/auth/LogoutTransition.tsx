import React, { ReactNode } from 'react';
import { useReactiveVar } from '@apollo/client';
import { useRouter } from 'next/router';
import { logoutInProgressVar } from '../../../apollo/store';
import { adminWorkspaceLabels } from '../../admin-workspace-labels';

const LogoutTransition = ({ children }: { children: ReactNode }) => {
	const loggingOut = useReactiveVar(logoutInProgressVar);
	const router = useRouter();
	if (loggingOut)
		return (
			<main aria-busy="true">
				<p role="status">{adminWorkspaceLabels(router.locale).loggingOut}</p>
			</main>
		);
	return <>{children}</>;
};

export default LogoutTransition;
