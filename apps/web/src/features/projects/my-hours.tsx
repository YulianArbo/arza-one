'use client';

import type { TimeEntry, TimeOptions } from '@arza/contracts';
import { Badge, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Timer } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { PROJECT_PATHS, TIME_ENTRY_STATUSES, TIME_TONES, itemLabel } from './labels';
import { useMyTime, useTimeOptions } from './queries';
import { TimeForm } from './time-form';
import { hoursText } from './time-panel';

// «Mis horas» (B27, ficha 17.8): las horas de la persona en todos sus proyectos de las últimas
// semanas, con su estado, y el registro en cualquiera de los proyectos donde es del equipo.

function LogTime({ options }: { readonly options: TimeOptions }): JSX.Element {
  if (options.projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Usted aún no está en el equipo de un proyecto abierto.
      </p>
    );
  }
  return (
    <RecordDialog
      triggerLabel="Registrar horas"
      title="Registrar horas"
      description="Máximo siete días de atraso, en cuartos de hora."
    >
      {(close) => (
        <TimeForm
          projects={options.projects.map((project) => ({
            id: project.id,
            label: `${project.code} · ${project.name}`,
            items: project.items,
          }))}
          earliest={options.earliest_date}
          today={options.today}
          onDone={close}
        />
      )}
    </RecordDialog>
  );
}

function Entries(props: { readonly entries: readonly TimeEntry[]; readonly total: number }) {
  if (props.entries.length === 0) {
    return (
      <EmptyState
        icon={<Timer />}
        title="Sin horas registradas"
        description="Registre cada día lo que trabajó en sus proyectos."
      />
    );
  }
  return (
    <SimpleTable
      caption={`Sus horas: ${hoursText(props.total)}`}
      scrollLabel="Sus horas; desplácese a los lados para ver todas las columnas"
      headers={['Día', 'Proyecto', 'Ítem', 'Horas', 'Se cobra', 'Estado']}
    >
      {props.entries.map((entry) => (
        <TableRow key={entry.id}>
          <TableCell>{formatDate(entry.work_date)}</TableCell>
          <TableCell>
            <Link className="text-primary underline" href={PROJECT_PATHS.project(entry.project.id)}>
              {entry.project.code}
            </Link>
          </TableCell>
          <TableCell>{entry.item === null ? 'General' : itemLabel(entry.item)}</TableCell>
          <TableCell className="tabular-nums">{hoursText(entry.hours)}</TableCell>
          <TableCell>{entry.billable ? 'Sí' : 'No'}</TableCell>
          <TableCell>
            <Badge tone={TIME_TONES[entry.status]}>{TIME_ENTRY_STATUSES[entry.status]}</Badge>
            {entry.decision_note === null ? null : (
              <p className="text-xs text-muted-foreground">{entry.decision_note}</p>
            )}
          </TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

export function MyHours(): JSX.Element {
  const options = useTimeOptions();
  const entries = useMyTime({});
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={PROJECT_PATHS.list}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver a los proyectos
      </Link>
      <PageHeader
        title="Mis horas"
        description="Sus horas en todos sus proyectos. Se registran máximo con siete días de atraso."
      />
      <QueryState query={options} loadingLabel="Cargando sus proyectos">
        {(data) => <LogTime options={data} />}
      </QueryState>
      <QueryState query={entries} loadingLabel="Cargando sus horas">
        {(data) => <Entries entries={data.data} total={data.total_hours} />}
      </QueryState>
    </div>
  );
}
