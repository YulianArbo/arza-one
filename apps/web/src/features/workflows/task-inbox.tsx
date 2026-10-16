'use client';

import type { TaskSummary } from '@arza/contracts';
import { Badge, Button, EmptyState, TableCell, TableRow } from '@arza/ui';
import { ListTodo } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { usePermissions } from '../session/permissions';
import {
  PRIORITY_LABELS,
  PRIORITY_TONES,
  REASON_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  WF_PATHS,
} from './labels';
import { useMyTasks, type InboxView } from './queries';

// Bandeja «Mis tareas» (ficha 17.5): una sola bandeja para todos los módulos, con vencimientos y
// prioridad. Primero las vencidas, luego las que vencen antes.

const VIEWS: readonly { readonly value: InboxView; readonly label: string }[] = [
  { value: 'open', label: 'Abiertas' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'closed', label: 'Cerradas' },
];

const EMPTY: Readonly<Record<InboxView, string>> = {
  open: 'No tiene tareas pendientes. Cuando un trámite le asigne una, aparecerá aquí.',
  overdue: 'No tiene tareas vencidas.',
  closed: 'Todavía no ha cerrado tareas.',
};

function TaskRow({ task }: { readonly task: TaskSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link className="font-medium text-primary underline" href={WF_PATHS.task(task.id)}>
          {task.title}
        </Link>
        <p className="text-xs text-muted-foreground">{task.instance.workflow_name}</p>
      </TableCell>
      <TableCell>
        <Badge tone={TASK_STATUS_TONES[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
      </TableCell>
      <TableCell>
        <Badge tone={PRIORITY_TONES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
      </TableCell>
      <TableCell>{formatDateTime(task.due_at)}</TableCell>
      <TableCell>{task.reason === null ? '—' : REASON_LABELS[task.reason]}</TableCell>
    </TableRow>
  );
}

function ViewSwitch(props: {
  readonly view: InboxView;
  readonly onChange: (view: InboxView) => void;
}): JSX.Element {
  return (
    <div role="group" aria-label="Qué tareas ver" className="flex flex-wrap gap-2">
      {VIEWS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={option.value === props.view ? 'primary' : 'outline'}
          aria-pressed={option.value === props.view}
          onClick={() => {
            props.onChange(option.value);
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function TaskTable(props: {
  readonly tasks: readonly TaskSummary[];
  readonly view: InboxView;
}): JSX.Element {
  if (props.tasks.length === 0) {
    return <EmptyState title="Sin tareas" description={EMPTY[props.view]} icon={<ListTodo />} />;
  }
  return (
    <SimpleTable headers={['Tarea', 'Estado', 'Prioridad', 'Vence', 'Por qué la ve']}>
      {props.tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </SimpleTable>
  );
}

/** «Mis tareas»: abiertas, vencidas o cerradas, con enlace al tablero para quien ve todas. */
export function TaskInbox(): JSX.Element {
  const [view, setView] = useState<InboxView>('open');
  const tasks = useMyTasks(view);
  const permissions = usePermissions();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewSwitch view={view} onChange={setView} />
        {permissions.canAll('wf.task.read_all') ? (
          <Link className="text-sm text-primary underline" href={WF_PATHS.board}>
            Ver el tablero de todas las tareas
          </Link>
        ) : null}
      </div>
      <QueryState query={tasks} loadingLabel="Cargando sus tareas">
        {(data) => <TaskTable tasks={data.data} view={view} />}
      </QueryState>
    </div>
  );
}
