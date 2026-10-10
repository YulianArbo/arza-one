'use client';

import type { SecurityEvent } from '@arza/contracts';
import { Badge, EmptyState, TableCell, TableRow } from '@arza/ui';
import { ShieldCheck } from 'lucide-react';
import { useState, type JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { Pager, useCursorTrail } from '../administration/pager';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { SEVERITY_LABELS, SEVERITY_TONES, changesSummary } from './labels';
import { useSecurityEvents } from './queries';

const HEADERS = ['Fecha y hora', 'Gravedad', 'Qué pasó', 'Persona', 'Detalle'];

const SEVERITY_OPTIONS = [
  { value: '', label: 'Todas' },
  ...Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label })),
];

/** Qué pasó, dicho para la persona; el tipo sin traducir se muestra tal cual. */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  'iam.account.locked': 'Cuenta bloqueada por intentos fallidos',
  'audit.chain.broken': 'La auditoría fue alterada',
};

function SecurityRow({ event }: { readonly event: SecurityEvent }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{formatDateTime(event.occurred_at)}</TableCell>
      <TableCell>
        <Badge tone={SEVERITY_TONES[event.severity]}>{SEVERITY_LABELS[event.severity]}</Badge>
      </TableCell>
      <TableCell>
        {TYPE_LABELS[event.type] ?? event.type}
        <p className="font-mono text-xs text-muted-foreground">{event.type}</p>
      </TableCell>
      <TableCell>{event.user?.display_name ?? event.user?.email ?? '—'}</TableCell>
      <TableCell className="max-w-md text-sm break-words">
        {changesSummary(event.detail)}
        {event.ip === null ? null : (
          <p className="text-xs text-muted-foreground">Desde {event.ip}</p>
        )}
      </TableCell>
    </TableRow>
  );
}

function SecurityTable({ events }: { readonly events: readonly SecurityEvent[] }): JSX.Element {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No hay eventos de seguridad"
        description="Aquí aparecen los bloqueos de cuentas y las alertas sobre la auditoría."
        icon={<ShieldCheck />}
      />
    );
  }
  return (
    <SimpleTable headers={HEADERS} caption="Eventos de seguridad, lo más reciente primero">
      {events.map((event) => (
        <SecurityRow key={event.id} event={event} />
      ))}
    </SimpleTable>
  );
}

/** Eventos de seguridad de la empresa (audit.security.read). */
export function SecurityEvents(): JSX.Element {
  const [severity, setSeverity] = useState('');
  const trail = useCursorTrail();
  const page = useSecurityEvents({ severity }, trail.cursor);
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <SelectField
          id="seguridad-gravedad"
          label="Gravedad"
          options={SEVERITY_OPTIONS}
          value={severity}
          onChange={(event) => {
            setSeverity(event.target.value);
            trail.reset();
          }}
        />
      </div>
      <QueryState query={page} loadingLabel="Cargando los eventos de seguridad">
        {(data) => (
          <>
            <SecurityTable events={data.data} />
            <Pager page={data} {...trail.pager} />
          </>
        )}
      </QueryState>
    </div>
  );
}
