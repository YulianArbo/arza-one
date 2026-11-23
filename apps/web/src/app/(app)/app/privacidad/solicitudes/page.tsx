import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { RequestsPanel } from '../../../../../features/privacy/requests-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Solicitudes de titulares' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['privacy.request.manage']}>
      <PageHeader
        title="Solicitudes de titulares"
        description="Consultas y reclamos sobre datos personales, con su fecha límite legal en días hábiles (Ley 1581 de 2012, arts. 14 y 15)."
      />
      <RequestsPanel />
    </RequirePermission>
  );
}
