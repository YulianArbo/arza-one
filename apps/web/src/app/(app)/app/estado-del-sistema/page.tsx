import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { SystemStatusPanel } from '../../../../features/system-status/system-status-panel';

export const metadata: Metadata = { title: 'Estado del sistema' };

export default function SystemStatusPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Estado del sistema"
        description="Versión de la API y estado de la base de datos, las colas y los archivos."
      />
      <SystemStatusPanel />
    </>
  );
}
