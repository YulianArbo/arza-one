import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../../components/app-shell/page-header';
import { RoleCreatePanel } from '../../../../../../features/administration/role-create';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nuevo rol' };

export default function NewRolePage(): JSX.Element {
  return (
    <RequirePermission anyOf={['iam.role.manage']}>
      <PageHeader
        title="Nuevo rol personalizado"
        description="Elija los permisos por módulo. Donde se puede, limítelos a «solo lo propio»."
      />
      <RoleCreatePanel />
    </RequirePermission>
  );
}
