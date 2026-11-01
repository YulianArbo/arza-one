'use client';

import type { TaskSummary } from '@arza/contracts';
import { BarChart, Badge, EmptyState, StatCard } from '@arza/ui';
import { ListTodo } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { PRIORITY_LABELS, PRIORITY_TONES, WF_PATHS } from '../workflows/labels';
import { useMyTasks } from '../workflows/queries';
import { dueToday, tasksByWorkflow } from './dashboard-model';
import { Panel } from './panel';

// Tareas del tablero de Inicio (16.3): cifras, las próximas a vencer y cuántas hay por flujo.
// shortcut: cuenta solo la primera página de la bandeja; si alguien llega a tener más, pedir un
// resumen a la API.

const SHOWN = 5;

function TaskList({ tasks }: { readonly tasks: readonly TaskSummary[] }): JSX.Element {
  return (
    <ul className="flex flex-col divide-y">
      {tasks.slice(0, SHOWN).map((task) => (
        <li key={task.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
          <div className="flex min-w-0 flex-col">
            <Link
              className="truncate font-medium text-primary underline"
              href={WF_PATHS.task(task.id)}
            >
              {task.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {task.instance.workflow_name} · vence {formatDateTime(task.due_at)}
            </span>
          </div>
          <Badge tone={PRIORITY_TONES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
        </li>
      ))}
    </ul>
  );
}

function TaskStats(props: { readonly open: readonly TaskSummary[] }): JSX.Element {
  const overdue = useMyTasks('overdue').data?.data.length;
  const today = dueToday(props.open, new Date());
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Tareas abiertas" value={String(props.open.length)} />
      <StatCard
        label="Tareas vencidas"
        value={overdue === undefined ? '—' : String(overdue)}
        tone={overdue ? 'destructive' : 'success'}
      />
      <StatCard label="Vencen hoy" value={String(today)} tone="warning" />
    </div>
  );
}

function TaskPanels({ tasks }: { readonly tasks: readonly TaskSummary[] }): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Mis tareas">
        <TaskList tasks={tasks} />
        <Link className="text-sm text-primary underline" href={WF_PATHS.inbox}>
          Ver todas sus tareas
        </Link>
      </Panel>
      <Panel title="Tareas abiertas por flujo">
        <BarChart title="Tareas abiertas por flujo" items={tasksByWorkflow(tasks)} />
      </Panel>
    </div>
  );
}

export function TaskOverview(): JSX.Element {
  return (
    <QueryState query={useMyTasks('open')} loadingLabel="Cargando sus tareas">
      {({ data }) => (
        <div className="flex flex-col gap-4">
          <TaskStats open={data} />
          {data.length === 0 ? (
            <EmptyState
              title="Mis tareas"
              description="No tiene tareas pendientes. Cuando un trámite le asigne una, aparecerá aquí."
              icon={<ListTodo />}
            />
          ) : (
            <TaskPanels tasks={data} />
          )}
        </div>
      )}
    </QueryState>
  );
}
