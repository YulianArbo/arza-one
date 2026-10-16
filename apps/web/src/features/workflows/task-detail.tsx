'use client';

import type { TaskSummary, TaskView } from '@arza/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import {
  PRIORITY_LABELS,
  PRIORITY_TONES,
  REASON_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  WF_PATHS,
  personName,
} from './labels';
import { useTask } from './queries';
import { CompletePanel, DecisionPanel, HandOverPanels, StartPanel } from './task-panels';
import { WorkflowHistory } from './workflow-history';

function Detail({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Quién la atiende: la persona, el rol o nadie todavía. */
export function responsibleOf(task: TaskSummary): string {
  if (task.assignee !== null) return personName(task.assignee);
  if (task.assignee_role !== null) return `Rol ${task.assignee_role}`;
  return 'Sin responsable';
}

function TaskFacts({ task }: { readonly task: TaskView }): JSX.Element {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Detail term="Estado">
        <Badge tone={TASK_STATUS_TONES[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
      </Detail>
      <Detail term="Prioridad">
        <Badge tone={PRIORITY_TONES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
      </Detail>
      <Detail term="Vence">{formatDateTime(task.due_at)}</Detail>
      <Detail term="Responsable">{responsibleOf(task)}</Detail>
      <Detail term="Trámite">
        <Link className="text-primary underline" href={WF_PATHS.instance(task.instance.id)}>
          {task.instance.title}
        </Link>
      </Detail>
      <Detail term="Flujo">{task.instance.workflow_name}</Detail>
      <Detail term="Paso actual">{task.instance.state.label}</Detail>
      <Detail term="Por qué la ve">
        {task.reason === null ? '—' : REASON_LABELS[task.reason]}
      </Detail>
      {task.escalated_to === null ? null : (
        <Detail term="Escalada a">{personName(task.escalated_to)}</Detail>
      )}
      {task.delegated_from === null ? null : (
        <Detail term="Delegada por">{personName(task.delegated_from)}</Detail>
      )}
    </dl>
  );
}

function ActionCard({ task }: { readonly task: TaskView }): JSX.Element | null {
  if (!task.can_act) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{task.kind === 'approval' ? 'Su decisión' : 'Qué hacer'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <StartPanel task={task} />
        {task.kind === 'approval' ? <DecisionPanel task={task} /> : <CompletePanel task={task} />}
      </CardContent>
    </Card>
  );
}

function TaskBody({ task }: { readonly task: TaskView }): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={task.title} description="Tarea del motor de flujos." />
      <TaskFacts task={task} />
      <ActionCard task={task} />
      <HandOverPanels task={task} />
      <WorkflowHistory history={task.history} />
    </div>
  );
}

/** Una tarea: sus datos, lo que la persona puede hacer y el historial del trámite. */
export function TaskDetail({ id }: { readonly id: string }): JSX.Element {
  const task = useTask(id);
  return (
    <QueryState query={task} loadingLabel="Cargando la tarea">
      {(data) => <TaskBody task={data} />}
    </QueryState>
  );
}
