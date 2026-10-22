import type { AuditEvent } from '@arza/contracts';
import { Badge, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { ScrollText } from 'lucide-react';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { RESULT_LABELS, actionLabel, actorLabel, changesSummary, entityLabel } from './labels';

const HEADERS = ['Fecha y hora', 'Quién', 'Qué hizo', 'Registro', 'Resultado', 'Detalle'];

function EventRow({ event }: { readonly event: AuditEvent }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{formatDateTime(event.occurred_at)}</TableCell>
      <TableCell>
        {actorLabel(event.actor)}
        {event.ip === null ? null : (
          <p className="text-xs text-muted-foreground">Desde {event.ip}</p>
        )}
      </TableCell>
      <TableCell>
        {actionLabel(event.action)}
        <p className="font-mono text-xs text-muted-foreground">{event.action}</p>
      </TableCell>
      <TableCell>{entityLabel(event.entity_type)}</TableCell>
      <TableCell>
        <Badge tone={event.result === 'success' ? 'success' : 'destructive'}>
          {RESULT_LABELS[event.result]}
        </Badge>
      </TableCell>
      <TableCell className="max-w-md text-sm break-words">
        {changesSummary(event.changes)}
      </TableCell>
    </TableRow>
  );
}

interface AuditEventTableProps {
  readonly events: readonly AuditEvent[];
  readonly caption: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

/** Eventos de auditoría, del más reciente al más antiguo (consulta e historial de un registro). */
export function AuditEventTable({
  events,
  caption,
  emptyTitle,
  emptyDescription,
}: AuditEventTableProps): JSX.Element {
  if (events.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} icon={<ScrollText />} />;
  }
  return (
    <SimpleTable headers={HEADERS} caption={caption}>
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </SimpleTable>
  );
}
