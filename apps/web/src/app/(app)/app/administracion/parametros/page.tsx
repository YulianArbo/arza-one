import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { ParametersPanel } from '../../../../../features/organization/parameters-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Parámetros' };

export default function ParametersPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.parameter.read']}>
      <PageHeader
        title="Parámetros"
        description="Valores con fecha de vigencia. Un cambio nunca borra el valor anterior: queda en el historial."
      />
      <ParametersPanel />
    </RequirePermission>
  );
}
