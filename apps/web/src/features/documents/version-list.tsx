'use client';

import type { Document, Version } from '@arza/contracts';
import { Badge, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { History } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { RENDER_LABELS, VERSION_STATUS_LABELS, VERSION_STATUS_TONES, requestPath } from './labels';
import { VersionSteps } from './version-steps';

// Versiones del documento (B18): estado, quién elaboró y quién aprobó, desde cuándo rigió y los
// pasos que la persona puede dar. Desde B19, el paso de su trámite y la solicitud que la originó.

/** Estado de la versión, el paso de su trámite y la conversión a PDF. */
function StatusCell({ version }: { readonly version: Version }): JSX.Element {
  return (
    <TableCell>
      <Badge tone={VERSION_STATUS_TONES[version.status]}>
        {VERSION_STATUS_LABELS[version.status]}
      </Badge>
      {version.step === null ? null : (
        <p className="mt-1 text-xs text-muted-foreground">Paso: {version.step}</p>
      )}
      {version.render_status === 'ready' ? null : (
        <p className="mt-1 text-xs text-muted-foreground">{RENDER_LABELS[version.render_status]}</p>
      )}
    </TableCell>
  );
}

function VersionRow(props: {
  readonly document: Document;
  readonly version: Version;
}): JSX.Element {
  const { version } = props;
  return (
    <TableRow>
      <TableCell className="font-medium">{version.label}</TableCell>
      <StatusCell version={version} />
      <TableCell>
        <p>{version.change_summary}</p>
        {version.change_request === null ? null : (
          <Link
            href={requestPath(version.change_request.id)}
            className="text-xs text-primary hover:underline"
          >
            {version.change_request.code}
          </Link>
        )}
        {version.review_note === null ? null : (
          <p className="mt-1 text-xs text-warning-foreground">Devuelta: {version.review_note}</p>
        )}
      </TableCell>
      <TableCell>
        <p>{version.created_by?.name ?? '—'}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(version.created_at)}</p>
      </TableCell>
      <TableCell>
        <p>{version.approved_by?.name ?? '—'}</p>
        <p className="text-xs text-muted-foreground">
          Rige desde {formatDate(version.effective_date)}
        </p>
      </TableCell>
      <TableCell>
        <VersionSteps document={props.document} version={version} />
      </TableCell>
    </TableRow>
  );
}

export function VersionList(props: {
  readonly document: Document;
  readonly versions: readonly Version[];
}): JSX.Element {
  if (props.versions.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="No hay versiones visibles"
        description="Cuando el documento tenga una versión vigente, aparecerá aquí."
      />
    );
  }
  return (
    <SimpleTable headers={['Versión', 'Estado', 'Qué cambia', 'Elaboró', 'Aprobó', 'Pasos']}>
      {props.versions.map((version) => (
        <VersionRow key={version.id} document={props.document} version={version} />
      ))}
    </SimpleTable>
  );
}
