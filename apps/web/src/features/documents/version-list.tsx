'use client';

import type { Document, Version } from '@arza/contracts';
import { Badge, EmptyState, TableCell, TableRow } from '@arza/ui';
import { History } from 'lucide-react';
import type { JSX } from 'react';

import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { SimpleTable } from '../administration/simple-table';
import { RENDER_LABELS, VERSION_STATUS_LABELS, VERSION_STATUS_TONES } from './labels';
import { VersionSteps } from './version-steps';

// Versiones del documento (B18): estado, quién elaboró y quién aprobó, desde cuándo rigió y los
// pasos que la persona puede dar.

function VersionRow(props: {
  readonly document: Document;
  readonly version: Version;
}): JSX.Element {
  const { version } = props;
  return (
    <TableRow>
      <TableCell className="font-medium">{version.label}</TableCell>
      <TableCell>
        <Badge tone={VERSION_STATUS_TONES[version.status]}>
          {VERSION_STATUS_LABELS[version.status]}
        </Badge>
        {version.render_status === 'ready' ? null : (
          <p className="mt-1 text-xs text-muted-foreground">
            {RENDER_LABELS[version.render_status]}
          </p>
        )}
      </TableCell>
      <TableCell>
        <p>{version.change_summary}</p>
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
