import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { DocumentExplorer } from '../../../../features/documents/document-explorer';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Documentos' };

export default function DocumentsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <PageHeader
        title="Explorador de expedientes"
        description="Documentos del Sistema de Gestión de Calidad y expedientes de terceros. Cada documento muestra su versión vigente."
      />
      <DocumentExplorer />
    </RequirePermission>
  );
}
