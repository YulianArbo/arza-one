import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalUsersPage } from '../../../../features/portal/portal-users';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Usuarios de mi empresa' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.user.manage']}>
      <PortalUsersPage />
    </RequirePermission>
  );
}
