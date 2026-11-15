'use client';

import {
  MAINTENANCE_KINDS,
  assetMaintenanceListResponseSchema,
  type AssetMaintenance,
} from '@arza/contracts';
import { Badge, EmptyState, SimpleTable } from '@arza/ui';
import { Wrench } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { CompleteMaintenanceForm } from './asset-forms';
import { AssetButton, useAssetQuery } from './asset-ui';

// Mantenimientos de los activos (B34): programados y hechos. Se programan desde el inventario; aquí
// se registran como hechos con su costo, o se quitan los programados por error.

export function MaintenancePanel(): JSX.Element {
  const maintenance = useAssetQuery('/v1/asset-maintenance', assetMaintenanceListResponseSchema);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mantenimientos de activos"
        description="Mantenimientos preventivos y correctivos. Se programan desde el inventario de activos."
      />
      <QueryState query={maintenance} loadingLabel="Cargando mantenimientos">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<Wrench />}
              title="Aún no hay mantenimientos"
              description="Los mantenimientos programados aparecerán aquí."
            />
          ) : (
            <MaintenanceTable rows={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

const HEADERS = ['Activo', 'Tipo', 'Programado', 'Estado', 'Costo', ''];

function MaintenanceTable({ rows }: { readonly rows: readonly AssetMaintenance[] }): JSX.Element {
  return (
    <SimpleTable headers={HEADERS} caption="Mantenimientos">
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="p-2">
            <span className="font-medium">{row.asset.code}</span>
            <span className="block text-xs text-muted-foreground">{row.asset.name}</span>
          </td>
          <td className="p-2">{MAINTENANCE_KINDS[row.kind]}</td>
          <td className="p-2">{formatDate(row.scheduled_on)}</td>
          <td className="p-2">
            <Badge>{row.done_on === null ? 'Pendiente' : 'Hecho'}</Badge>
            {row.done_on === null ? null : (
              <span className="block text-xs text-muted-foreground">{formatDate(row.done_on)}</span>
            )}
          </td>
          <td className="p-2">{row.cost === null ? '—' : formatPesos(row.cost)}</td>
          <td className="p-2">
            <MaintenanceActions row={row} />
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function MaintenanceActions({ row }: { readonly row: AssetMaintenance }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  if (row.done_on !== null || !can('asset.manage')) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <RecordDialog
        triggerLabel="Registrar como hecho"
        triggerAriaLabel={`Registrar como hecho el mantenimiento de ${row.asset.code}`}
        title={`Mantenimiento de ${row.asset.code}`}
        description="Escriba la fecha en que se hizo y su costo."
        variant="outline"
      >
        {(close) => <CompleteMaintenanceForm maintenance={row} onDone={close} />}
      </RecordDialog>
      <AssetButton
        label="Quitar"
        pendingLabel="Quitando…"
        ariaLabel={`Quitar el mantenimiento programado de ${row.asset.code}`}
        run={(csrfToken) => api.delete(`/v1/asset-maintenance/${row.id}`, { csrfToken })}
      />
    </div>
  );
}
