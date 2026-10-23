'use client';

import type { CrmActivity } from '@arza/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { CompleteActivityForm, NewActivityForm, type ActivityTarget } from './activity-forms';
import { ACTIVITY_TYPES, CRM_PATHS } from './labels';
import { useActivities, type Filters } from './queries';

// Actividades de un prospecto u oportunidad, y la agenda de la persona (B22). Una pendiente cuya
// hora ya pasó se marca «Atrasada».

function recordLink(activity: CrmActivity): JSX.Element {
  const href =
    activity.record.kind === 'lead'
      ? CRM_PATHS.lead(activity.record.id)
      : CRM_PATHS.opportunity(activity.record.id);
  return (
    <Link href={href} className="text-primary underline-offset-4 hover:underline">
      {activity.record.code} · {activity.record.label}
    </Link>
  );
}

function ActivityRow(props: {
  readonly activity: CrmActivity;
  readonly showRecord: boolean;
  readonly canUpdate: boolean;
}): JSX.Element {
  const { activity } = props;
  const late = activity.done_at === null && new Date(activity.due_at) < new Date();
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{activity.subject}</p>
        <p className="text-xs text-muted-foreground">
          {ACTIVITY_TYPES[activity.type]}
          {activity.outcome === null ? '' : ` · ${activity.outcome}`}
        </p>
      </TableCell>
      {props.showRecord ? <TableCell>{recordLink(activity)}</TableCell> : null}
      <TableCell>
        {formatDateTime(activity.due_at)} {late ? <Badge tone="warning">Atrasada</Badge> : null}
      </TableCell>
      <TableCell>{activity.assignee?.name ?? '—'}</TableCell>
      <TableCell>
        <ActivityStatus activity={activity} canUpdate={props.canUpdate} />
      </TableCell>
    </TableRow>
  );
}

/** Hecha, pendiente o el botón para marcarla hecha. */
function ActivityStatus(props: {
  readonly activity: CrmActivity;
  readonly canUpdate: boolean;
}): JSX.Element {
  const { activity } = props;
  if (activity.done_at !== null) return <Badge tone="success">Hecha</Badge>;
  if (!props.canUpdate) return <Badge>Pendiente</Badge>;
  return (
    <RecordDialog
      triggerLabel="Marcar hecha"
      triggerAriaLabel={`Marcar hecha: ${activity.subject}`}
      variant="outline"
      title="Marcar la actividad como hecha"
      description={activity.subject}
    >
      {(close) => <CompleteActivityForm activity={activity} onDone={close} />}
    </RecordDialog>
  );
}

function ActivityTable(props: {
  readonly activities: readonly CrmActivity[];
  readonly showRecord: boolean;
  readonly canUpdate: boolean;
}): JSX.Element {
  if (props.activities.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="No hay actividades"
        description="Agende llamadas, reuniones y tareas para no perder el seguimiento."
      />
    );
  }
  const headers = props.showRecord
    ? ['Actividad', 'Registro', 'Fecha y hora', 'Responsable', 'Estado']
    : ['Actividad', 'Fecha y hora', 'Responsable', 'Estado'];
  return (
    <SimpleTable headers={headers} scrollLabel="Actividades">
      {props.activities.map((activity) => (
        <ActivityRow key={activity.id} {...props} activity={activity} />
      ))}
    </SimpleTable>
  );
}

export function ActivityList(props: {
  readonly filters: Filters;
  readonly showRecord: boolean;
  readonly canUpdate: boolean;
}): JSX.Element {
  const query = useActivities(props.filters);
  return (
    <QueryState query={query} loadingLabel="Cargando las actividades">
      {(data) => (
        <ActivityTable
          activities={data.data}
          showRecord={props.showRecord}
          canUpdate={props.canUpdate}
        />
      )}
    </QueryState>
  );
}

/** Actividades de un prospecto o de una oportunidad, con el botón para agendar otra. */
export function ActivitiesPanel(props: {
  readonly target: ActivityTarget;
  /** El registro sigue abierto: se pueden agendar actividades nuevas. */
  readonly open: boolean;
}): JSX.Element {
  const { can } = usePermissions();
  const canUpdate = can(
    props.target.leadId === null ? 'crm.opportunity.update' : 'crm.lead.update',
  );
  const filters =
    props.target.leadId === null
      ? { opportunity_id: props.target.opportunityId, view: 'all' }
      : { lead_id: props.target.leadId, view: 'all' };
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Actividades</CardTitle>
        {canUpdate && props.open ? (
          <RecordDialog
            triggerLabel="Agendar actividad"
            variant="outline"
            title="Agendar actividad"
            description="Una llamada, reunión, tarea o correo, con su día y hora."
          >
            {(close) => <NewActivityForm target={props.target} onDone={close} />}
          </RecordDialog>
        ) : null}
      </CardHeader>
      <CardContent>
        <ActivityList filters={filters} showRecord={false} canUpdate={canUpdate} />
      </CardContent>
    </Card>
  );
}
