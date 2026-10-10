import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { CostCentersPanel } from '../../../../../features/organization/cost-centers-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Centros de costo' };

export default function CostCentersPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.org.read']}>
      <PageHeader
        title="Centros de costo"
        description="Los centros con que la empresa reparte sus gastos."
      />
      <CostCentersPanel />
    </RequirePermission>
  );
}
