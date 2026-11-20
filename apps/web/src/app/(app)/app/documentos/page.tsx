import type { Metadata } from 'next';
import { buttonVariants } from '@arza/ui';
import { ListChecks } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { DocumentExplorer } from '../../../../features/documents/document-explorer';
import { DocumentsAlso } from '../../../../features/documents/documents-also';
import { MASTER_LIST_PATH } from '../../../../features/documents/labels';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Documentos' };

/** Documentos (B22B, boceto 13): el explorador de carpetas y las demás funciones del módulo. */
export default function DocumentsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Documentos"
          description="Abra una carpeta para consultar los documentos y sus versiones vigentes."
          action={
            <Link href={MASTER_LIST_PATH} className={buttonVariants({ variant: 'outline' })}>
              <ListChecks aria-hidden="true" />
              Listado Maestro
            </Link>
          }
        />
        <DocumentExplorer />
        <DocumentsAlso />
      </div>
    </RequirePermission>
  );
}
