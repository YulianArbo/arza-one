'use client';

import type { InstanceView, TaskSummary } from '@arza/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { RecordActivity } from '../records/record-activity';
import { TASK_STATUS_LABELS, TASK_STATUS_TONES, WF_PATHS, personName } from './labels';
import { useInstanceAction } from './mutations';
import { useInstance } from './queries';
import { responsibleOf } from './task-detail';
import { WorkflowActions } from './workflow-actions';
import { WorkflowHistory } from './workflow-history';

function TaskRow({ task }: { readonly task: TaskSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link className="text-primary underline" href={WF_PATHS.task(task.id)}>
          {task.title}
        </Link>
      </TableCell>
      <TableCell>{responsibleOf(task)}</TableCell>
      <TableCell>
        <Badge tone={TASK_STATUS_TONES[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
      </TableCell>
      <TableCell>{formatDateTime(task.due_at)}</TableCell>
    </TableRow>
  );
}

function ActionsCard({ instance }: { readonly instance: InstanceView }): JSX.Element {
  const act = useInstanceAction(instance.id);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acciones del trámite</CardTitle>
      </CardHeader>
      <CardContent>
        {instance.completed_at === null ? (
          <WorkflowActions
            actions={instance.actions}
            pending={act.pending}
            error={act.error}
            onAction={(action, comment) => {
              act.execute({ action, comment });
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            El trámite terminó el {formatDateTime(instance.completed_at)}.
          </p>
        )}
        {act.dialog}
      </CardContent>
    </Card>
  );
}

function InstanceBody({ instance }: { readonly instance: InstanceView }): JSX.Element {
  const description = `${instance.workflow.name} (versión ${String(instance.workflow.version)}) · iniciado por ${personName(instance.started_by)} el ${formatDateTime(instance.started_at)}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={instance.title} description={description} />
      <p className="text-sm">
        Paso actual: <Badge tone="info">{instance.state.label}</Badge>
        {instance.due_at === null ? null : <span> · vence {formatDateTime(instance.due_at)}</span>}
      </p>
      <ActionsCard instance={instance} />
      <section aria-labelledby="tareas-titulo" className="flex flex-col gap-3">
        <h2 id="tareas-titulo" className="text-lg font-semibold">
          Tareas
        </h2>
        <SimpleTable headers={['Tarea', 'Responsable', 'Estado', 'Vence']}>
          {instance.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </SimpleTable>
      </section>
      <WorkflowHistory history={instance.history} />
      <RecordActivity
        record={{ entity_type: 'wf_instance', entity_id: instance.id }}
        writePermissions={['wf.task.work']}
      />
    </div>
  );
}

/** Un trámite: paso actual, acciones posibles, sus tareas y el historial. */
export function InstanceDetail({ id }: { readonly id: string }): JSX.Element {
  const instance = useInstance(id);
  return (
    <QueryState query={instance} loadingLabel="Cargando el trámite">
      {(data) => <InstanceBody instance={data} />}
    </QueryState>
  );
}
