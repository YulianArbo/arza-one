'use client';

import type { TaskSummary } from '@arza/contracts';
import { Badge, EmptyState, Label, TableCell, TableRow } from '@arza/ui';
import { LayoutList } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { Pager, useCursorTrail } from '../administration/pager';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { TASK_STATUS_LABELS, TASK_STATUS_TONES, WF_PATHS, personName } from './labels';
import { useTaskBoard, type BoardFilters } from './queries';
import { responsibleOf } from './task-detail';

// Tablero de tareas (ficha 17.5): todas las tareas de la empresa, para quien las supervisa. Una
// tarea vencida y escalada al jefe inmediato queda visible aquí.

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  ...Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

function BoardRow({ task }: { readonly task: TaskSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          className="font-medium text-primary underline"
          href={WF_PATHS.instance(task.instance.id)}
        >
          {task.title}
        </Link>
      </TableCell>
      <TableCell>{responsibleOf(task)}</TableCell>
      <TableCell>
        <Badge tone={TASK_STATUS_TONES[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
      </TableCell>
      <TableCell>{formatDateTime(task.due_at)}</TableCell>
      <TableCell>{task.escalated_at === null ? '—' : personName(task.escalated_to)}</TableCell>
    </TableRow>
  );
}

function Filters(props: {
  readonly filters: BoardFilters;
  readonly onChange: (filters: BoardFilters) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-48">
        <SelectField
          id="tablero-estado"
          label="Estado"
          options={STATUS_OPTIONS}
          value={props.filters.status}
          onChange={(event) => {
            props.onChange({ ...props.filters, status: event.target.value });
          }}
        />
      </div>
      <div className="flex items-center gap-2 pb-2">
        <input
          id="tablero-escaladas"
          type="checkbox"
          checked={props.filters.escalated}
          onChange={(event) => {
            props.onChange({ ...props.filters, escalated: event.target.checked });
          }}
        />
        <Label htmlFor="tablero-escaladas">Solo las escaladas</Label>
      </div>
    </div>
  );
}

/** Tablero de todas las tareas, por estado y escalamiento, por páginas. */
export function TaskBoard(): JSX.Element {
  const [filters, setFilters] = useState<BoardFilters>({ status: '', escalated: false });
  const trail = useCursorTrail();
  const page = useTaskBoard(filters, trail.cursor);
  return (
    <div className="flex flex-col gap-4">
      <Filters
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          trail.reset();
        }}
      />
      <QueryState query={page} loadingLabel="Cargando el tablero">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              title="Sin tareas"
              description="No hay tareas con estos filtros."
              icon={<LayoutList />}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <SimpleTable headers={['Tarea', 'Responsable', 'Estado', 'Vence', 'Escalada a']}>
                {data.data.map((task) => (
                  <BoardRow key={task.id} task={task} />
                ))}
              </SimpleTable>
              <Pager page={data} {...trail.pager} />
            </div>
          )
        }
      </QueryState>
    </div>
  );
}
