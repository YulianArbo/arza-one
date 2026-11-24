import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { IncidentsPanel } from '../../../../../features/privacy/incidents-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Incidentes' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['privacy.incident.manage']}>
      <PageHeader
        title="Incidentes"
        description="Incidentes de seguridad con datos personales. Se reportan a la SIC dentro de los 15 días hábiles siguientes a su detección."
      />
      <IncidentsPanel />
    </RequirePermission>
  );
}
