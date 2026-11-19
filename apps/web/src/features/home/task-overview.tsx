'use client';

import type { TaskSummary } from '@arza/contracts';
import { BarChart, EmptyState, StatCard } from '@arza/ui';
import { ListTodo } from 'lucide-react';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { useMyTasks } from '../workflows/queries';
import { dueToday, tasksByWorkflow } from './dashboard-model';
import { Panel } from './panel';

// Tareas del tablero de Inicio (16.3): cifras y cuántas hay por flujo. Las próximas a vencer
// están en «Requieren su atención» (B22B).
// shortcut: cuenta solo la primera página de la bandeja; si alguien llega a tener más, pedir un
// resumen a la API.

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

/** La lista de tareas va arriba, en «Requieren su atención»; aquí queda su reparto por flujo. */
function TaskPanels({ tasks }: { readonly tasks: readonly TaskSummary[] }): JSX.Element {
  return (
    <Panel title="Tareas abiertas por flujo">
      <BarChart title="Tareas abiertas por flujo" items={tasksByWorkflow(tasks)} />
    </Panel>
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
