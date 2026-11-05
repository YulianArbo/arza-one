'use client';

import type { ProjectDetail, ProjectMilestone } from '@arza/contracts';
import { Badge, Button, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Flag } from 'lucide-react';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { formatPercent } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { DialogForm, Fields, decimal, summaryOf, type FieldSpec } from './form-bits';
import { MILESTONE_STATUSES } from './labels';
import { useProjectAction } from './queries';

// Hitos del proyecto (B26, ficha 17.8): cada uno con su fecha y el porcentaje del valor que se
// factura al cumplirlo; entre todos, como máximo el 100 %. Los entregables y el acta de cada hito
// llegan con el B27.

interface Props {
  readonly project: ProjectDetail;
}

interface MilestoneValues {
  readonly name: string;
  readonly dueOn: string;
  readonly pct: string;
}

function billed(project: ProjectDetail): number {
  return project.milestones.reduce((sum, milestone) => sum + milestone.billing_pct * 100, 0) / 100;
}

function fieldsFor(project: ProjectDetail): FieldSpec<keyof MilestoneValues>[] {
  return [
    { key: 'name', field: 'name', id: 'hito-nombre', label: 'Nombre' },
    { key: 'dueOn', field: 'due_on', id: 'hito-fecha', label: 'Fecha comprometida', type: 'date' },
    {
      key: 'pct',
      field: 'billing_pct',
      id: 'hito-porcentaje',
      label: 'Porcentaje que se factura',
      hint: `Ya están asignados ${formatPercent(billed(project))} de 100 %.`,
      inputMode: 'decimal',
    },
  ];
}

function problemsOf(values: MilestoneValues): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.name.trim().length < 3) found['name'] = 'Escriba el nombre del hito.';
  if (values.dueOn === '') found['due_on'] = 'Elija la fecha.';
  const pct = decimal(values.pct);
  if (Number.isNaN(pct) || pct < 0 || pct > 100) {
    found['billing_pct'] = 'Escriba un porcentaje de 0 a 100.';
  }
  return found;
}

function NewMilestone(props: Props & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const fields = fieldsFor(props.project);
  const [values, setValues] = useState<MilestoneValues>({ name: '', dueOn: '', pct: '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const create = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/projects/${props.project.id}/milestones`, { body, csrfToken });
  }, props.onDone);
  const submit = (): void => {
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    create.execute({
      name: values.name.trim(),
      due_on: values.dueOn,
      billing_pct: decimal(values.pct),
    });
  };
  return (
    <DialogForm
      problems={problems}
      fields={summaryOf(fields)}
      action={create}
      submitLabel="Agregar el hito"
      onSubmit={submit}
    >
      <Fields
        specs={fields}
        values={values}
        problems={problems}
        onChange={(key, value) => {
          setValues({ ...values, [key]: value });
        }}
      />
    </DialogForm>
  );
}

function CompleteButton(props: Props & { readonly milestone: ProjectMilestone }): JSX.Element {
  const api = useApiClient();
  const path = `/v1/projects/${props.project.id}/milestones/${props.milestone.id}/actions/complete`;
  const complete = useProjectAction<undefined>((_args, csrfToken) =>
    api.post(path, { body: {}, version: props.milestone.version, csrfToken }),
  );
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={complete.pending}
        aria-label={`Marcar cumplido ${props.milestone.name}`}
        onClick={() => {
          complete.execute(undefined);
        }}
      >
        Marcar cumplido
      </Button>
      {complete.error === null ? null : <FormError error={complete.error} />}
      {complete.dialog}
    </>
  );
}

function MilestoneRow(props: Props & { readonly milestone: ProjectMilestone }): JSX.Element {
  const { milestone, project } = props;
  return (
    <TableRow>
      <TableCell>{milestone.name}</TableCell>
      <TableCell>{formatDate(milestone.due_on)}</TableCell>
      <TableCell className="tabular-nums">{formatPercent(milestone.billing_pct)}</TableCell>
      <TableCell>
        <Badge tone={milestone.status === 'done' ? 'success' : 'info'}>
          {MILESTONE_STATUSES[milestone.status]}
        </Badge>
      </TableCell>
      <TableCell>
        {project.can.update && milestone.status === 'pending' ? (
          <CompleteButton project={project} milestone={milestone} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function MilestonesTable({ project }: Props): JSX.Element {
  if (project.milestones.length === 0) {
    return (
      <EmptyState
        icon={<Flag />}
        title="Sin hitos"
        description="Registre los hitos del contrato con el porcentaje que se factura en cada uno."
      />
    );
  }
  return (
    <SimpleTable
      caption={`Hitos del proyecto: ${formatPercent(billed(project))} del valor asignado`}
      scrollLabel="Hitos; desplácese a los lados para ver todas las columnas"
      headers={['Hito', 'Fecha', 'Se factura', 'Estado', 'Acción']}
    >
      {project.milestones.map((milestone) => (
        <MilestoneRow key={milestone.id} project={project} milestone={milestone} />
      ))}
    </SimpleTable>
  );
}

export function MilestonesPanel({ project }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {project.can.update ? (
        <div>
          <RecordDialog
            triggerLabel="Agregar un hito"
            variant="outline"
            title="Nuevo hito"
            description="Entre todos los hitos se factura como máximo el 100 % del valor."
          >
            {(close) => <NewMilestone project={project} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <MilestonesTable project={project} />
    </div>
  );
}
