import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { UserList } from '../../../../../features/administration/user-list';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Usuarios' };

export default function UsersPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['iam.user.read']}>
      <PageHeader
        title="Usuarios"
        description="Personas con cuenta en ARZA ONE y sus roles vigentes."
      />
      <UserList />
    </RequirePermission>
  );
}
