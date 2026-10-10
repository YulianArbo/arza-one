import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { RoleList } from '../../../../../features/administration/role-list';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Roles y permisos' };

export default function RolesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['iam.role.read']}>
      <PageHeader
        title="Roles y permisos"
        description="Los roles del sistema siguen el organigrama y no se editan; los personalizados sí."
      />
      <RoleList />
    </RequirePermission>
  );
}
