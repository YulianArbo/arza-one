'use client';

import {
  ASSET_CATEGORIES,
  MAINTENANCE_KINDS,
  RETIRE_REASONS,
  assetAssigneeListResponseSchema,
  assetCreatedResponseSchema,
  assignAssetSchema,
  cancelAssignmentSchema,
  completeMaintenanceSchema,
  retireAssetSchema,
  returnAssetSchema,
  saveAssetSchema,
  scheduleMaintenanceSchema,
  type Asset,
  type AssetAssignment,
  type AssetMaintenance,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import {
  ShortForm,
  moneyText,
  optionalText,
  optionsOf,
  useAssetQuery,
  type ShortField,
} from './asset-ui';

// Formularios de Activos (B34): alta del activo, asignación en comodato, anulación, devolución,
// baja y mantenimientos. Todos validan con el mismo contrato que usa la API.

interface Done {
  readonly onDone: () => void;
}

const ASSET_FIELDS: readonly ShortField[] = [
  { field: 'name', id: 'asset-name', label: 'Nombre' },
  {
    field: 'category',
    id: 'asset-category',
    label: 'Categoría',
    options: optionsOf(ASSET_CATEGORIES),
  },
  { field: 'serial', id: 'asset-serial', label: 'Serie', hint: 'Opcional.' },
  { field: 'purchase_date', id: 'asset-purchase-date', label: 'Fecha de compra', type: 'date' },
  { field: 'cost', id: 'asset-cost', label: 'Costo', decimal: true, hint: 'En pesos.' },
  {
    field: 'useful_life_months',
    id: 'asset-life',
    label: 'Vida útil (meses)',
    hint: 'Para la depreciación informativa. Por ejemplo, 36.',
  },
  { field: 'location', id: 'asset-location', label: 'Ubicación', hint: 'Opcional.' },
];

const EMPTY_ASSET = {
  name: '',
  category: '',
  serial: '',
  purchase_date: '',
  cost: '',
  useful_life_months: '',
  location: '',
};

function assetBody(values: Record<string, string>): unknown {
  return {
    ...values,
    serial: optionalText(values['serial'] ?? ''),
    location: optionalText(values['location'] ?? ''),
    cost: moneyText(values['cost'] ?? ''),
    useful_life_months: Number(values['useful_life_months']),
  };
}

export function AssetForm({ onDone }: Done): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <ShortForm
      fields={ASSET_FIELDS}
      initial={EMPTY_ASSET}
      schema={saveAssetSchema}
      prepare={assetBody}
      submitLabel="Registrar activo"
      pendingLabel="Registrando…"
      onDone={onDone}
      run={(body, csrfToken) =>
        api.post('/v1/assets', {
          body,
          schema: assetCreatedResponseSchema,
          idempotencyKey: key,
          csrfToken,
        })
      }
    />
  );
}

/** Campos de la asignación: la lista avisa quién aún no puede firmar el comodato. */
function useAssignFields(): readonly ShortField[] {
  const people = useAssetQuery('/v1/asset-assignees', assetAssigneeListResponseSchema).data?.data;
  return [
    {
      field: 'user_id',
      id: 'assign-user',
      label: 'Colaborador',
      options: (people ?? []).map((person) => ({
        value: person.id,
        label: person.ready
          ? person.name
          : `${person.name} (falta vincular su persona en Terceros)`,
      })),
    },
    { field: 'assigned_on', id: 'assign-date', label: 'Fecha de entrega', type: 'date' },
    {
      field: 'message',
      id: 'assign-message',
      label: 'Mensaje para quien firma',
      hint: 'Opcional.',
    },
  ];
}

/** Asignar en comodato: solo aparecen listos quienes ya pueden firmar el contrato. */
export function AssignForm(props: Done & { readonly asset: Asset }): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const fields = useAssignFields();
  return (
    <ShortForm
      fields={fields}
      initial={{ user_id: '', assigned_on: '', message: '' }}
      schema={assignAssetSchema}
      prepare={(values) => ({ ...values, message: optionalText(values['message'] ?? '') })}
      submitLabel="Asignar y enviar a firma"
      pendingLabel="Asignando…"
      onDone={props.onDone}
      run={(body, csrfToken) =>
        api.post(`/v1/assets/${props.asset.id}/assignments`, {
          body,
          schema: assetCreatedResponseSchema,
          idempotencyKey: key,
          csrfToken,
        })
      }
    />
  );
}

interface AssignmentProps extends Done {
  readonly assignment: AssetAssignment;
}

export function CancelAssignmentForm(props: AssignmentProps): JSX.Element {
  const api = useApiClient();
  const { assignment } = props;
  return (
    <ShortForm
      fields={[{ field: 'reason', id: 'cancel-reason', label: 'Motivo' }]}
      initial={{ reason: '' }}
      schema={cancelAssignmentSchema}
      submitLabel="Anular asignación"
      pendingLabel="Anulando…"
      onDone={props.onDone}
      run={(body, csrfToken) =>
        api.post(`/v1/asset-assignments/${assignment.id}/cancellation`, {
          body,
          version: assignment.version,
          csrfToken,
        })
      }
    />
  );
}

export function ReturnForm(props: AssignmentProps): JSX.Element {
  const api = useApiClient();
  const { assignment } = props;
  return (
    <ShortForm
      fields={[
        { field: 'returned_on', id: 'return-date', label: 'Fecha de devolución', type: 'date' },
        { field: 'note', id: 'return-note', label: 'Estado en que se devuelve' },
      ]}
      initial={{ returned_on: '', note: '' }}
      schema={returnAssetSchema}
      submitLabel="Registrar devolución"
      pendingLabel="Registrando…"
      onDone={props.onDone}
      run={(body, csrfToken) =>
        api.post(`/v1/asset-assignments/${assignment.id}/return`, {
          body,
          version: assignment.version,
          csrfToken,
        })
      }
    />
  );
}

export function RetireForm(props: Done & { readonly asset: Asset }): JSX.Element {
  const api = useApiClient();
  const { asset } = props;
  return (
    <ShortForm
      fields={[
        { field: 'retired_on', id: 'retire-date', label: 'Fecha de baja', type: 'date' },
        {
          field: 'reason',
          id: 'retire-reason',
          label: 'Motivo',
          options: optionsOf(RETIRE_REASONS),
        },
        { field: 'note', id: 'retire-note', label: 'Detalle' },
      ]}
      initial={{ retired_on: '', reason: '', note: '' }}
      schema={retireAssetSchema}
      submitLabel="Dar de baja"
      pendingLabel="Dando de baja…"
      onDone={props.onDone}
      run={(body, csrfToken) =>
        api.post(`/v1/assets/${asset.id}/retirement`, { body, version: asset.version, csrfToken })
      }
    />
  );
}

export function ScheduleMaintenanceForm(props: Done & { readonly asset: Asset }): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <ShortForm
      fields={[
        {
          field: 'kind',
          id: 'maintenance-kind',
          label: 'Tipo',
          options: optionsOf(MAINTENANCE_KINDS),
        },
        { field: 'scheduled_on', id: 'maintenance-date', label: 'Fecha programada', type: 'date' },
        { field: 'note', id: 'maintenance-note', label: 'Nota', hint: 'Opcional.' },
      ]}
      initial={{ kind: '', scheduled_on: '', note: '' }}
      schema={scheduleMaintenanceSchema}
      prepare={(values) => ({ ...values, note: optionalText(values['note'] ?? '') })}
      submitLabel="Programar mantenimiento"
      pendingLabel="Programando…"
      onDone={props.onDone}
      run={(body, csrfToken) =>
        api.post(`/v1/assets/${props.asset.id}/maintenance`, {
          body,
          schema: assetCreatedResponseSchema,
          idempotencyKey: key,
          csrfToken,
        })
      }
    />
  );
}

export function CompleteMaintenanceForm(
  props: Done & { readonly maintenance: AssetMaintenance },
): JSX.Element {
  const api = useApiClient();
  const { maintenance } = props;
  return (
    <ShortForm
      fields={[
        { field: 'done_on', id: 'maintenance-done', label: 'Fecha en que se hizo', type: 'date' },
        { field: 'cost', id: 'maintenance-cost', label: 'Costo', decimal: true, hint: 'En pesos.' },
        { field: 'note', id: 'maintenance-result', label: 'Nota', hint: 'Opcional.' },
      ]}
      initial={{ done_on: '', cost: '', note: '' }}
      schema={completeMaintenanceSchema}
      prepare={(values) => ({
        ...values,
        cost: moneyText(values['cost'] ?? ''),
        note: optionalText(values['note'] ?? ''),
      })}
      submitLabel="Registrar como hecho"
      pendingLabel="Registrando…"
      onDone={props.onDone}
      run={(body, csrfToken) =>
        api.post(`/v1/asset-maintenance/${maintenance.id}/completion`, {
          body,
          version: maintenance.version,
          csrfToken,
        })
      }
    />
  );
}
