import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { RequirePermission } from '../../../../../features/session/permissions';
import { SubmissionsPanel } from '../../../../../features/website/submissions-panel';

export const metadata: Metadata = { title: 'Formularios recibidos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['web.submission.read']}>
      <PageHeader
        title="Formularios recibidos"
        description="Mensajes de contacto y solicitudes de cotización del sitio. Cada uno creó un prospecto en Comercial con la tarea de contactarlo."
      />
      <SubmissionsPanel />
    </RequirePermission>
  );
}
