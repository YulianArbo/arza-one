'use client';

import { PORTAL_DOCUMENT_LABELS, type PortalDocument } from '@arza/contracts';
import { Badge, Button, Card, CardContent, EmptyState } from '@arza/ui';
import { FolderOpen } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { usePortalDocuments, usePortalDownload } from './portal-queries';

// Documentos compartidos (B30, decisión 5): los contratos y actas firmados y los archivos que el
// equipo compartió a propósito. Cada descarga pide un enlace temporal y queda registrada.

function fileNameOf(document: PortalDocument): string {
  const base = document.code ?? document.title;
  return `${base.replace(/[^\p{L}\p{N}._-]+/gu, '-')}.pdf`;
}

function DocumentRow({ document }: { readonly document: PortalDocument }): JSX.Element {
  const download = usePortalDownload();
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="font-medium">{document.title}</span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge>{PORTAL_DOCUMENT_LABELS[document.kind]}</Badge>
          {document.project === null ? null : <span>{document.project}</span>}
          <span>{formatDateTime(document.dated_at)}</span>
        </span>
        {download.error === null ? null : <FormError error={download.error} />}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={download.pending}
          aria-label={`Descargar ${document.title}`}
          onClick={() => {
            download.execute({
              path: `/v1/portal/documents/${document.kind}/${document.id}/link`,
              fileName: fileNameOf(document),
            });
          }}
        >
          {download.pending ? 'Preparando…' : 'Descargar'}
        </Button>
      </div>
      {download.dialog}
    </li>
  );
}

export function PortalDocumentsPage(): JSX.Element {
  const documents = usePortalDocuments();
  return (
    <>
      <PageHeader
        title="Documentos"
        description="Contratos y actas firmados, y lo que el equipo le compartió."
      />
      <QueryState query={documents} loadingLabel="Cargando sus documentos">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<FolderOpen />}
              title="Aún no hay documentos"
              description="Aquí aparecerán los documentos firmados y lo que el equipo comparta con usted."
            />
          ) : (
            <Card>
              <CardContent className="p-4">
                <ul className="flex flex-col divide-y" aria-label="Documentos">
                  {data.data.map((document) => (
                    <DocumentRow key={`${document.kind}-${document.id}`} document={document} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        }
      </QueryState>
    </>
  );
}
