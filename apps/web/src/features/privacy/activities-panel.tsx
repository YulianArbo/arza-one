'use client';

import type { Activity } from '@arza/contracts';
import { Badge, EmptyState, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { ActiveBadge, RecordDialog } from '../organization/record-dialog';
import { ActivityForm } from './activity-form';
import { DATA_CATEGORY_LABELS, HOLDER_TYPE_LABELS } from './labels';
import { useActivities } from './queries';

// Privacidad › Actividades de tratamiento (B17; Ley 1581, art. 4): qué datos, de quién, para qué,
// con qué fundamento, por cuánto tiempo y con qué encargados.

function ActivityRow({ activity }: { readonly activity: Activity }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium">{activity.name}</TableCell>
      <TableCell>
        {activity.data_categories.map((item) => DATA_CATEGORY_LABELS[item]).join(', ')}
      </TableCell>
      <TableCell>
        {activity.holder_types.map((item) => HOLDER_TYPE_LABELS[item]).join(', ')}
      </TableCell>
      <TableCell>{activity.retention}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <ActiveBadge active={activity.status === 'active'} />
          {activity.sensitive ? <Badge tone="warning">Datos sensibles</Badge> : null}
        </div>
      </TableCell>
      <TableCell>
        <RecordDialog
          triggerLabel="Editar"
          triggerAriaLabel={`Editar la actividad ${activity.name}`}
          variant="outline"
          title={`Editar ${activity.name}`}
          description="Los cambios quedan en la auditoría."
        >
          {(close) => <ActivityForm activity={activity} onDone={close} />}
        </RecordDialog>
      </TableCell>
    </TableRow>
  );
}

export function ActivitiesPanel(): JSX.Element {
  const activities = useActivities();
  return (
    <div className="flex flex-col gap-4">
      <RecordDialog
        triggerLabel="Registrar actividad"
        title="Registrar una actividad de tratamiento"
        description="Qué datos personales se tratan, de quiénes, para qué y por cuánto tiempo."
      >
        {(close) => <ActivityForm activity={null} onDone={close} />}
      </RecordDialog>
      <QueryState query={activities} loadingLabel="Cargando las actividades de tratamiento">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay actividades registradas"
              description="Registre cada uso de datos personales: clientes, proveedores, selección, nómina…"
            />
          ) : (
            <SimpleTable
              caption="Registro de actividades de tratamiento"
              headers={['Actividad', 'Datos', 'Titulares', 'Conservación', 'Estado', '']}
            >
              {data.data.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
    </div>
  );
}
