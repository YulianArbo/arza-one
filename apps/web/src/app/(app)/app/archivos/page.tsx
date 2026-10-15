import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { FileList } from '../../../../features/files/file-list';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Archivos' };

export default function FilesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <PageHeader
        title="Archivos"
        description="Cada archivo pasa por el antivirus antes de quedar disponible. Las descargas usan un enlace que vence a los cinco minutos y quedan registradas."
      />
      <FileList />
    </RequirePermission>
  );
}
