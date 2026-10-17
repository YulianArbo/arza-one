import type { Metadata } from 'next';
import { buttonVariants } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { DocumentExplorer } from '../../../../features/documents/document-explorer';
import { MASTER_LIST_PATH, REQUESTS_PATH } from '../../../../features/documents/labels';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Documentos' };

export default function DocumentsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <PageHeader
        title="Explorador de expedientes"
        description="Documentos del Sistema de Gestión de Calidad y expedientes de terceros. Cada documento muestra su versión vigente."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={MASTER_LIST_PATH} className={buttonVariants({ variant: 'outline' })}>
              Listado Maestro
            </Link>
            <Link href={REQUESTS_PATH} className={buttonVariants({ variant: 'outline' })}>
              Solicitudes
            </Link>
          </div>
        }
      />
      <DocumentExplorer />
    </RequirePermission>
  );
}
