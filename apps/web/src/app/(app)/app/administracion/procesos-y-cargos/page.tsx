import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { StructurePanel } from '../../../../../features/organization/structure-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Procesos, cargos y organigrama' };

export default function StructurePage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.org.read']}>
      <PageHeader
        title="Procesos, cargos y organigrama"
        description="El mapa de procesos y los cargos con su jerarquía. Lo que tiene registros no se elimina: se inactiva."
      />
      <StructurePanel />
    </RequirePermission>
  );
}
