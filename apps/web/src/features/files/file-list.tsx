'use client';

import type { DownloadLinkResponse, FileView } from '@arza/contracts';
import { Badge, Button, EmptyState, TableCell, TableRow } from '@arza/ui';
import { Paperclip } from 'lucide-react';
import { useState, type JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { usePermissions } from '../session/permissions';
import { FilePreview } from './file-preview';
import { FileUpload } from './file-upload';
import {
  REJECTION_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  canPreview,
  formatSize,
  typeLabel,
} from './labels';
import { useDownloadLink, useFiles } from './queries';

/** Pide el enlace de cinco minutos y lo abre: la API entrega el archivo como adjunto. */
export function DownloadButton(props: {
  readonly requestLink: () => Promise<DownloadLinkResponse>;
  readonly label?: string;
}): JSX.Element {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const download = (): void => {
    setPending(true);
    setError(null);
    props
      .requestLink()
      .then((link) => {
        window.open(link.url, '_self');
      })
      .catch(setError)
      .finally(() => {
        setPending(false);
      });
  };
  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" onClick={download} disabled={pending}>
        {pending ? 'Preparando…' : (props.label ?? 'Descargar')}
      </Button>
      {error === null ? null : <FormError error={error} />}
    </div>
  );
}

function StatusCell({ file }: { readonly file: FileView }): JSX.Element {
  return (
    <TableCell>
      <Badge tone={STATUS_TONES[file.status]}>{STATUS_LABELS[file.status]}</Badge>
      {file.rejection === null ? null : (
        <p className="mt-1 text-xs text-destructive">{REJECTION_LABELS[file.rejection]}</p>
      )}
    </TableCell>
  );
}

function FileRow({ file }: { readonly file: FileView }): JSX.Element {
  const requestLink = useDownloadLink();
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{file.file_name}</p>
        <p className="text-xs text-muted-foreground">
          {typeLabel(file.mime_type)} · {formatSize(file.size_bytes)} ·{' '}
          {formatDateTime(file.created_at)}
        </p>
      </TableCell>
      <StatusCell file={file} />
      <TableCell>
        {file.sha256 === null ? (
          '—'
        ) : (
          <code className="text-xs break-all" title="Huella SHA-256">
            {file.sha256}
          </code>
        )}
      </TableCell>
      <TableCell>
        {file.status === 'available' ? (
          <div className="flex flex-wrap gap-2">
            {canPreview(file) ? <FilePreview file={file} /> : null}
            <DownloadButton requestLink={async () => requestLink(file.id)} />
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function FileTable({ files }: { readonly files: readonly FileView[] }): JSX.Element {
  if (files.length === 0) {
    return (
      <EmptyState
        icon={<Paperclip />}
        title="Todavía no hay archivos"
        description="Los archivos que suba aparecerán aquí con el resultado del antivirus."
      />
    );
  }
  return (
    <SimpleTable headers={['Archivo', 'Estado', 'Huella SHA-256', 'Acciones']}>
      {files.map((file) => (
        <FileRow key={file.id} file={file} />
      ))}
    </SimpleTable>
  );
}

/** Archivos de la empresa que la persona puede ver, con la carga si tiene permiso (B14). */
export function FileList(): JSX.Element {
  const files = useFiles();
  const canUpload = usePermissions().can('doc.document.create');
  return (
    <div className="flex flex-col gap-6">
      {canUpload ? <FileUpload /> : null}
      <QueryState query={files} loadingLabel="Cargando los archivos">
        {(data) => <FileTable files={data.data} />}
      </QueryState>
    </div>
  );
}
