'use client';

import type { ProjectDetail, TimeEntry } from '@arza/contracts';
import { Badge, Button, Checkbox, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Timer } from 'lucide-react';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { useSession } from '../session/session-provider';
import { DialogForm, TextInput } from './form-bits';
import { TIME_ENTRY_STATUSES, TIME_TONES, itemLabel } from './labels';
import { useProjectAction, useTimeEntries, useTimeOptions } from './queries';
import { TimeForm } from './time-form';

// Horas del proyecto (B27, ficha 17.8). Cada miembro registra las suyas y las ve; el Líder técnico
// ve todas, aprueba varias a la vez o devuelve una con lo que hay que corregir. Nadie decide sobre
// las suyas, y una hora aprobada ya no cambia.

interface Props {
  readonly project: ProjectDetail;
}

export function hoursText(hours: number): string {
  return `${String(hours).replace('.', ',')} h`;
}

function LogTime({ project }: Props): JSX.Element {
  const options = useTimeOptions();
  return (
    <RecordDialog
      triggerLabel="Registrar horas"
      title="Registrar horas"
      description="Máximo siete días de atraso, en cuartos de hora."
    >
      {(close) => (
        <QueryState query={options} loadingLabel="Cargando los ítems">
          {(data) => {
            const mine = data.projects.find((row) => row.id === project.id);
            const items = mine?.items ?? [];
            return (
              <TimeForm
                projects={[{ id: project.id, label: project.code, items }]}
                earliest={data.earliest_date}
                today={data.today}
                onDone={close}
              />
            );
          }}
        </QueryState>
      )}
    </RecordDialog>
  );
}

function ReturnForm(props: Props & { readonly entry: TimeEntry; readonly onDone: () => void }) {
  const api = useApiClient();
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const path = `/v1/projects/${props.project.id}/time-entries/${props.entry.id}/actions/return`;
  const back = useProjectAction<string>(async (text, csrfToken) => {
    await api.post(path, { body: { reason: text }, version: props.entry.version, csrfToken });
  }, props.onDone);
  return (
    <DialogForm
      problems={problems}
      fields={[{ field: 'reason', id: 'horas-motivo', label: 'Qué debe corregir' }]}
      action={back}
      submitLabel="Devolver"
      onSubmit={() => {
        const found: Record<string, string> =
          reason.trim().length < 3 ? { reason: 'Escriba qué debe corregir.' } : {};
        setProblems(found);
        if (Object.keys(found).length === 0) back.execute(reason.trim());
      }}
    >
      <TextInput
        id="horas-motivo"
        label="Qué debe corregir"
        value={reason}
        error={problems['reason']}
        onValue={setReason}
      />
    </DialogForm>
  );
}

function RemoveButton(props: Props & { readonly entry: TimeEntry }): JSX.Element {
  const api = useApiClient();
  const path = `/v1/projects/${props.project.id}/time-entries/${props.entry.id}`;
  const remove = useProjectAction<undefined>((_args, csrfToken) =>
    api.delete(path, { version: props.entry.version, csrfToken }),
  );
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={remove.pending}
        aria-label={`Borrar las horas del ${formatDate(props.entry.work_date)}`}
        onClick={() => {
          remove.execute(undefined);
        }}
      >
        Borrar
      </Button>
      {remove.error === null ? null : <FormError error={remove.error} />}
      {remove.dialog}
    </>
  );
}

interface RowProps extends Props {
  readonly entry: TimeEntry;
  readonly mine: boolean;
  readonly selected: boolean;
  readonly onSelect: (checked: boolean) => void;
}

function EntryActions(props: RowProps): JSX.Element | null {
  const { entry, project } = props;
  if (props.mine && entry.status !== 'approved') {
    return <RemoveButton project={project} entry={entry} />;
  }
  if (!props.mine && project.can.approve_time && entry.status !== 'returned') {
    return (
      <RecordDialog
        triggerLabel="Devolver"
        variant="outline"
        title="Devolver las horas"
        description="La persona recibe un aviso con lo que debe corregir."
      >
        {(close) => <ReturnForm project={project} entry={entry} onDone={close} />}
      </RecordDialog>
    );
  }
  return null;
}

function EntryRow(props: RowProps): JSX.Element {
  const { entry, project } = props;
  const selectable = project.can.approve_time && !props.mine && entry.status === 'registered';
  return (
    <TableRow>
      <TableCell>
        {selectable ? (
          <Checkbox
            aria-label={`Elegir las horas de ${entry.person.name} del ${formatDate(entry.work_date)}`}
            checked={props.selected}
            onChange={(event) => {
              props.onSelect(event.target.checked);
            }}
          />
        ) : null}
      </TableCell>
      <TableCell>{formatDate(entry.work_date)}</TableCell>
      <TableCell>{entry.person.name}</TableCell>
      <TableCell>{entry.item === null ? 'General' : itemLabel(entry.item)}</TableCell>
      <TableCell className="tabular-nums">{hoursText(entry.hours)}</TableCell>
      <TableCell>{entry.billable ? 'Sí' : 'No'}</TableCell>
      <TableCell>
        <Badge tone={TIME_TONES[entry.status]}>{TIME_ENTRY_STATUSES[entry.status]}</Badge>
        {entry.decision_note === null ? null : (
          <p className="text-xs text-muted-foreground">{entry.decision_note}</p>
        )}
      </TableCell>
      <TableCell>
        <EntryActions {...props} />
      </TableCell>
    </TableRow>
  );
}

function ApproveButton(
  props: Props & { readonly ids: readonly string[]; readonly onDone: () => void },
) {
  const api = useApiClient();
  const approve = useProjectAction<readonly string[]>(async (ids, csrfToken) => {
    await api.post(`/v1/projects/${props.project.id}/time-entries/actions/approve`, {
      body: { ids },
      csrfToken,
    });
  }, props.onDone);
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={props.ids.length === 0 || approve.pending}
        onClick={() => {
          approve.execute(props.ids);
        }}
      >
        Aprobar las elegidas ({props.ids.length})
      </Button>
      {approve.error === null ? null : <FormError error={approve.error} />}
      {approve.dialog}
    </div>
  );
}

function EntriesTable(
  props: Props & { readonly entries: readonly TimeEntry[]; readonly total: number },
): JSX.Element {
  const { session } = useSession();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const toggle = (id: string, checked: boolean): void => {
    setSelected(checked ? [...selected, id] : selected.filter((current) => current !== id));
  };
  return (
    <div className="flex flex-col gap-3">
      {props.project.can.approve_time ? (
        <ApproveButton
          project={props.project}
          ids={selected}
          onDone={() => {
            setSelected([]);
          }}
        />
      ) : null}
      <SimpleTable
        caption={`Horas registradas: ${hoursText(props.total)}`}
        scrollLabel="Horas; desplácese a los lados para ver todas las columnas"
        headers={['Elegir', 'Día', 'Persona', 'Ítem', 'Horas', 'Se cobra', 'Estado', 'Acción']}
      >
        {props.entries.map((entry) => (
          <EntryRow
            key={entry.id}
            project={props.project}
            entry={entry}
            mine={entry.person.id === session.user.id}
            selected={selected.includes(entry.id)}
            onSelect={(checked) => {
              toggle(entry.id, checked);
            }}
          />
        ))}
      </SimpleTable>
    </div>
  );
}

function TimeTable(
  props: Props & { readonly entries: readonly TimeEntry[]; readonly total: number },
): JSX.Element {
  if (props.entries.length === 0) {
    return (
      <EmptyState
        icon={<Timer />}
        title="Sin horas registradas"
        description="Las horas del equipo aparecen aquí cuando se registran."
      />
    );
  }
  return <EntriesTable {...props} />;
}

export function TimePanel({ project }: Props): JSX.Element {
  const entries = useTimeEntries(project.id, {});
  return (
    <div className="flex flex-col gap-4">
      {project.can.log_time && project.status !== 'closed' ? (
        <div>
          <LogTime project={project} />
        </div>
      ) : null}
      <QueryState query={entries} loadingLabel="Cargando las horas">
        {(data) => <TimeTable project={project} entries={data.data} total={data.total_hours} />}
      </QueryState>
    </div>
  );
}
