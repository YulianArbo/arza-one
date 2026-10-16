import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { RequirePermission } from '../../../../../features/session/permissions';
import { DefinitionsList } from '../../../../../features/workflows/definitions-list';

export const metadata: Metadata = { title: 'Flujos' };

export default function WorkflowsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['wf.definition.manage']}>
      <PageHeader
        title="Flujos"
        description="Los estados, transiciones, aprobaciones y plazos de cada proceso. Cambiar un flujo publicado crea una versión nueva."
      />
      <DefinitionsList />
    </RequirePermission>
  );
}
