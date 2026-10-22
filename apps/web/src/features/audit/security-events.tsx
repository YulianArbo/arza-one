'use client';

import type { SecurityEvent } from '@arza/contracts';
import {
  Badge,
  EmptyState,
  Pager,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
  useCursorTrail,
} from '@arza/ui';
import { ShieldCheck } from 'lucide-react';
import { useState, type JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
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
  'iam.account.locked_by_admin': 'Un administrador bloqueó la cuenta',
  'iam.mfa.failures': 'Códigos equivocados: sesión cerrada y cuenta bloqueada',
  'iam.mfa.reset': 'Se reinició el segundo factor',
  'iam.mfa.changed': 'Pasó el segundo factor a otro celular',
  'iam.mfa.disabled': 'Desactivó el segundo factor',
  'iam.mfa.enabled': 'Activó el segundo factor',
  'iam.mfa.recovery_codes_regenerated': 'Generó códigos de recuperación nuevos',
  'iam.mfa.recovery_code_used': 'Usó un código de recuperación',
  'iam.login.new_device': 'Inició sesión desde un equipo nuevo',
  'iam.permissions.changed': 'Cambiaron los permisos',
  'iam.sessions.revoked': 'Se cerraron todas las sesiones de una persona',
  'iam.sessions.revoked_all': 'Se cerraron todas las sesiones de la empresa',
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
