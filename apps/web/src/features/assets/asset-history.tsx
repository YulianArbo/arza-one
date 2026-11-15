'use client';

import {
  ASSIGNMENT_STATUS,
  MAINTENANCE_KINDS,
  assetDetailResponseSchema,
  type AssetAssignment,
  type AssetMaintenance,
} from '@arza/contracts';
import { SimpleTable } from '@arza/ui';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { useAssetQuery } from './asset-ui';

// Historial de un activo (B34): quién lo ha tenido, con qué comodato, y sus mantenimientos.

export function AssetHistory({ assetId }: { readonly assetId: string }): JSX.Element {
  const detail = useAssetQuery(`/v1/assets/${assetId}`, assetDetailResponseSchema);
  return (
    <QueryState query={detail} loadingLabel="Cargando historial">
      {(result) => (
        <div className="flex flex-col gap-4">
          <AssignmentHistory rows={result.assignments} />
          <MaintenanceHistory rows={result.maintenance} />
        </div>
      )}
    </QueryState>
  );
}

function assignmentNote(row: AssetAssignment): string {
  if (row.status === 'returned') {
    return `Devuelto el ${formatDate(row.returned_on ?? row.assigned_on)}: ${row.return_note ?? ''}`;
  }
  if (row.status === 'cancelled') return row.closed_reason ?? '';
  return row.record_code ?? '';
}

function AssignmentHistory({ rows }: { readonly rows: readonly AssetAssignment[] }): JSX.Element {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin asignaciones registradas.</p>;
  }
  return (
    <SimpleTable headers={['Responsable', 'Entrega', 'Estado', 'Detalle']} caption="Asignaciones">
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="p-2">{row.holder.name}</td>
          <td className="p-2">{formatDate(row.assigned_on)}</td>
          <td className="p-2">{ASSIGNMENT_STATUS[row.status]}</td>
          <td className="p-2">{assignmentNote(row)}</td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function MaintenanceHistory({ rows }: { readonly rows: readonly AssetMaintenance[] }): JSX.Element {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin mantenimientos registrados.</p>;
  }
  return (
    <SimpleTable headers={['Tipo', 'Programado', 'Hecho', 'Costo']} caption="Mantenimientos">
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="p-2">{MAINTENANCE_KINDS[row.kind]}</td>
          <td className="p-2">{formatDate(row.scheduled_on)}</td>
          <td className="p-2">{row.done_on === null ? 'Pendiente' : formatDate(row.done_on)}</td>
          <td className="p-2">{row.cost === null ? '—' : formatPesos(row.cost)}</td>
        </tr>
      ))}
    </SimpleTable>
  );
}
