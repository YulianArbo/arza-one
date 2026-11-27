import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { TenantForm } from '../../../../../features/organization/tenant-form';
import { SitesPanel } from '../../../../../features/organization/sites-panel';
import { RequirePermission } from '../../../../../features/session/permissions';
import { BrandingPanel } from '../../../../../features/tenancy/branding-panel';
import { TenantExportsSection } from '../../../../../features/tenancy/tenant-exports-panel';

export const metadata: Metadata = { title: 'Empresa y sedes' };

export default function CompanyPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.tenant.read']}>
      <PageHeader
        title="Empresa y sedes"
        description="Datos legales, marca y sedes de la empresa. Salen en los documentos y en las pantallas de la plataforma."
      />
      <div className="flex flex-col gap-10">
        <TenantForm />
        <BrandingPanel />
        <SitesPanel />
        <TenantExportsSection />
      </div>
    </RequirePermission>
  );
}
