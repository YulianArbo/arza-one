import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { TenantForm } from '../../../../../features/organization/tenant-form';
import { SitesPanel } from '../../../../../features/organization/sites-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Empresa y sedes' };

export default function CompanyPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.tenant.read']}>
      <PageHeader
        title="Empresa y sedes"
        description="Datos legales de la empresa y sus sedes. Salen en los documentos que genera la plataforma."
      />
      <div className="flex flex-col gap-10">
        <TenantForm />
        <SitesPanel />
      </div>
    </RequirePermission>
  );
}
