'use client';

import { partyRoleSchema, type PartyDetail, type PartyRole } from '@arza/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { useCatalog } from '../organization/queries';
import { usePermissions } from '../session/permissions';
import { AUTHORIZATION_LABELS, KIND_LABELS, ROLE_LABELS, identification } from './labels';
import { PARTY_KEYS } from './queries';

function Row({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DataCard({ party }: { readonly party: PartyDetail }): JSX.Element {
  const purposes = useCatalog('personal_data_purposes').data?.items ?? [];
  const purpose = purposes.find((item) => item.code === party.data_purpose)?.label;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Tipo" value={KIND_LABELS[party.kind]} />
          <Row label="Documento" value={identification(party)} />
          {party.trade_name === null ? null : (
            <Row label="Nombre comercial" value={party.trade_name} />
          )}
          <Row label="Correo" value={party.email ?? '—'} />
          <Row label="Teléfono" value={party.phone ?? '—'} />
          <Row label="Ciudad" value={party.city ?? '—'} />
          <Row label="Dirección" value={party.address ?? '—'} />
          {party.status_reason === null ? null : (
            <Row label="Motivo del estado" value={party.status_reason} />
          )}
          {party.kind === 'person' ? (
            <>
              <Row label="Finalidad de los datos" value={purpose ?? party.data_purpose ?? '—'} />
              <Row
                label="Autorización"
                value={`${party.data_authorization === null ? '—' : AUTHORIZATION_LABELS[party.data_authorization]}, ${formatDate(party.data_authorized_on)}`}
              />
            </>
          ) : null}
          <Row label="Registrado el" value={formatDateTime(party.created_at)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function useRoleChange(partyId: string) {
  const api = useApiClient();
  return useAdminAction<{ role: PartyRole; add: boolean }>({
    run: ({ role, add }, csrfToken) =>
      add
        ? api.post(`/v1/parties/${partyId}/roles`, { body: { role }, csrfToken })
        : api.delete(`/v1/parties/${partyId}/roles/${role}`, { csrfToken }),
    invalidate: [PARTY_KEYS.all],
    reason: 'Los papeles del tercero quedan en la auditoría.',
  });
}

interface RoleItemProps {
  readonly role: PartyRole;
  readonly record: PartyDetail['role_history'][number] | undefined;
  /** Agregar o terminar el papel; sin permiso, no se ofrece. */
  readonly onToggle: ((role: PartyRole, add: boolean) => void) | null;
  readonly pending: boolean;
}

function RoleItem({ role, record, onToggle, pending }: RoleItemProps): JSX.Element {
  const active = record?.is_active === true;
  const action = active ? 'Terminar' : 'Agregar';
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="min-w-28 font-medium">{ROLE_LABELS[role]}</span>
      {record === undefined ? (
        <span className="text-muted-foreground">No</span>
      ) : (
        <Badge tone={active ? 'success' : 'neutral'}>
          {active ? `Desde el ${formatDate(record.since)}` : 'Terminado'}
        </Badge>
      )}
      {onToggle === null ? null : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          aria-label={`${action} el papel ${ROLE_LABELS[role]}`}
          onClick={() => {
            onToggle(role, !active);
          }}
        >
          {action}
        </Button>
      )}
    </li>
  );
}

/** Papeles del tercero: los vigentes y los que terminaron (ficha 17.3). */
function RolesCard({ party }: { readonly party: PartyDetail }): JSX.Element {
  const canUpdate = usePermissions().can('party.update');
  const change = useRoleChange(party.id);
  const history = new Map(party.role_history.map((row) => [row.role, row]));
  const onToggle = canUpdate
    ? (role: PartyRole, add: boolean) => {
        change.execute({ role, add });
      }
    : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Papeles</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {change.error === null ? null : <FormError error={change.error} />}
        <ul className="flex flex-col gap-2 text-sm">
          {partyRoleSchema.options.map((role) => (
            <RoleItem
              key={role}
              role={role}
              record={history.get(role)}
              onToggle={onToggle}
              pending={change.pending}
            />
          ))}
        </ul>
        {change.dialog}
      </CardContent>
    </Card>
  );
}

export function SummaryPanel({ party }: { readonly party: PartyDetail }): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DataCard party={party} />
      <RolesCard party={party} />
    </div>
  );
}
