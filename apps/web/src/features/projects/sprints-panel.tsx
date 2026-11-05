'use client';

import { WORKING_STATUSES, type ProjectDetail, type ProjectSprint } from '@arza/contracts';
import { Badge, Button, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Repeat } from 'lucide-react';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { RecordDialog } from '../organization/record-dialog';
import { DialogForm, Fields, summaryOf, type FieldSpec } from './form-bits';
import { SPRINT_STATUSES, SPRINT_TONES } from './labels';
import { useProjectAction } from './queries';

// Iteraciones del proyecto (B26, ficha 17.8): planeada → en curso → cerrada. Caben dentro de las
// fechas del proyecto y solo una corre a la vez; al cerrarla, lo no terminado vuelve a la lista de
// pendientes. Las gestiona el Líder técnico.

interface Props {
  readonly project: ProjectDetail;
}

interface SprintValues {
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly goal: string;
}

const FIELDS: readonly FieldSpec<keyof SprintValues>[] = [
  { key: 'name', field: 'name', id: 'iteracion-nombre', label: 'Nombre' },
  { key: 'startsOn', field: 'starts_on', id: 'iteracion-inicio', label: 'Inicio', type: 'date' },
  { key: 'endsOn', field: 'ends_on', id: 'iteracion-fin', label: 'Fin', type: 'date' },
  { key: 'goal', field: 'goal', id: 'iteracion-meta', label: 'Meta (opcional)', multiline: true },
];

function problemsOf(values: SprintValues): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.name.trim().length < 3) found['name'] = 'Escriba el nombre de la iteración.';
  if (values.startsOn === '') found['starts_on'] = 'Elija la fecha de inicio.';
  if (values.endsOn === '') found['ends_on'] = 'Elija la fecha de fin.';
  else if (values.endsOn < values.startsOn)
    found['ends_on'] = 'Debe ser igual o posterior al inicio.';
  return found;
}

function bodyOf(values: SprintValues): object {
  const goal = values.goal.trim();
  return {
    name: values.name.trim(),
    starts_on: values.startsOn,
    ends_on: values.endsOn,
    goal: goal === '' ? null : goal,
  };
}

function NewSprint(props: Props & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const name = `Iteración ${String(props.project.sprints.length + 1)}`;
  const [values, setValues] = useState<SprintValues>({ name, startsOn: '', endsOn: '', goal: '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const create = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/projects/${props.project.id}/sprints`, { body, csrfToken });
  }, props.onDone);
  const submit = (): void => {
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length === 0) create.execute(bodyOf(values));
  };
  return (
    <DialogForm
      problems={problems}
      fields={summaryOf(FIELDS)}
      action={create}
      submitLabel="Planear"
      onSubmit={submit}
    >
      <Fields
        specs={FIELDS}
        values={values}
        problems={problems}
        onChange={(key, value) => {
          setValues({ ...values, [key]: value });
        }}
      />
    </DialogForm>
  );
}

function SprintStep(
  props: Props & {
    readonly sprint: ProjectSprint;
    readonly action: 'start' | 'close';
    readonly label: string;
  },
): JSX.Element {
  const api = useApiClient();
  const path = `/v1/projects/${props.project.id}/sprints/${props.sprint.id}/actions/${props.action}`;
  const step = useProjectAction<undefined>((_args, csrfToken) =>
    api.post(path, { body: {}, version: props.sprint.version, csrfToken }),
  );
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={step.pending}
        aria-label={`${props.label} ${props.sprint.name}`}
        onClick={() => {
          step.execute(undefined);
        }}
      >
        {props.label}
      </Button>
      {step.error === null ? null : <FormError error={step.error} />}
      {step.dialog}
    </>
  );
}

function SprintAction(props: Props & { readonly sprint: ProjectSprint }): JSX.Element | null {
  if (!props.project.can.update) return null;
  if (props.sprint.status === 'active') {
    return <SprintStep {...props} action="close" label="Cerrar" />;
  }
  if (props.sprint.status === 'planned' && WORKING_STATUSES.includes(props.project.status)) {
    return <SprintStep {...props} action="start" label="Iniciar" />;
  }
  return null;
}

function SprintRow(props: Props & { readonly sprint: ProjectSprint }): JSX.Element {
  const { sprint } = props;
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{sprint.name}</span>
        {sprint.goal === null ? null : (
          <p className="text-xs text-muted-foreground">{sprint.goal}</p>
        )}
      </TableCell>
      <TableCell>
        {formatDate(sprint.starts_on)} – {formatDate(sprint.ends_on)}
      </TableCell>
      <TableCell className="tabular-nums">{String(sprint.items)}</TableCell>
      <TableCell>
        <Badge tone={SPRINT_TONES[sprint.status]}>{SPRINT_STATUSES[sprint.status]}</Badge>
      </TableCell>
      <TableCell>
        <SprintAction project={props.project} sprint={sprint} />
      </TableCell>
    </TableRow>
  );
}

function SprintsTable({ project }: Props): JSX.Element {
  if (project.sprints.length === 0) {
    return (
      <EmptyState
        icon={<Repeat />}
        title="Sin iteraciones"
        description="Planee la primera y lleve a ella los ítems con criterios de aceptación."
      />
    );
  }
  return (
    <SimpleTable
      caption="Iteraciones"
      scrollLabel="Iteraciones; desplácese a los lados para ver todas las columnas"
      headers={['Iteración', 'Fechas', 'Ítems', 'Estado', 'Acción']}
    >
      {project.sprints.map((sprint) => (
        <SprintRow key={sprint.id} project={project} sprint={sprint} />
      ))}
    </SimpleTable>
  );
}

export function SprintsPanel({ project }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {project.can.update ? (
        <div>
          <RecordDialog
            triggerLabel="Planear una iteración"
            variant="outline"
            title="Nueva iteración"
            description="Dentro de las fechas del proyecto. Se inicia cuando el proyecto está en ejecución."
          >
            {(close) => <NewSprint project={project} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <SprintsTable project={project} />
    </div>
  );
}
