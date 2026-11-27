import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { RequirePermission } from '../../../../../features/session/permissions';
import { PlatformTenants } from '../../../../../features/tenancy/platform-tenants';

export const metadata: Metadata = { title: 'Empresas de la plataforma' };

export default function PlatformTenantsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['platform.tenant.read']}>
      <PageHeader
        title="Empresas de la plataforma"
        description="Alta, plan, suspensión y eliminación de las empresas que usan ARZA ONE. Solo se ve su ficha, nunca su contenido."
      />
      <PlatformTenants />
    </RequirePermission>
  );
}
