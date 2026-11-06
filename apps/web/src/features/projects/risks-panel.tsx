'use client';

import {
  riskLevelOf,
  riskStatusSchema,
  type ProjectDetail,
  type ProjectRisk,
} from '@arza/contracts';
import { Badge, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { ShieldAlert } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  optional,
  optionsOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from './form-bits';
import { PROJECT_RISK_LEVELS, RISK_LEVEL_TONES, RISK_STATUSES } from './labels';
import { useProjectAction, useRisks } from './queries';

// Riesgos del proyecto (B27, ficha 17.8): probabilidad e impacto de 1 a 5; el nivel se calcula
// (bajo hasta 6, medio hasta 14, alto desde 15). Un riesgo alto avisa al líder, que decide si el
// proyecto queda en riesgo.

interface Props {
  readonly project: ProjectDetail;
}

interface Values {
  readonly description: string;
  readonly probability: string;
  readonly impact: string;
  readonly response: string;
  readonly ownerId: string;
  readonly status: string;
}

const SCALE = ['1', '2', '3', '4', '5'].map((value) => ({ value, label: value }));

const TEXTS: readonly FieldSpec<'description' | 'response'>[] = [
  { key: 'description', field: 'description', id: 'riesgo-descripcion', label: 'Riesgo' },
  { key: 'response', field: 'response', id: 'riesgo-respuesta', label: 'Qué se hará' },
];

function choicesOf(project: ProjectDetail): ChoiceSpec<keyof Values>[] {
  const scale = (key: 'probability' | 'impact', id: string, label: string) => ({
    key,
    field: key,
    id,
    label,
    options: SCALE,
  });
  return [
    scale('probability', 'riesgo-probabilidad', 'Probabilidad (1 rara, 5 casi segura)'),
    scale('impact', 'riesgo-impacto', 'Impacto (1 menor, 5 grave)'),
    {
      key: 'ownerId',
      field: 'owner_id',
      id: 'riesgo-responsable',
      label: 'Responsable',
      options: [
        { value: '', label: 'Elija a alguien del equipo' },
        ...project.members.map((m) => ({ value: m.person.id, label: m.person.name })),
      ],
    },
    {
      key: 'status',
      field: 'status',
      id: 'riesgo-estado',
      label: 'Estado',
      options: optionsOf(RISK_STATUSES),
    },
  ];
}

function problemsOf(values: Values): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.description.trim().length < 3) found['description'] = 'Describa el riesgo.';
  if (values.ownerId === '') found['owner_id'] = 'Elija al responsable.';
  return found;
}

function initialOf(project: ProjectDetail, risk: ProjectRisk | undefined): Values {
  return {
    description: risk?.description ?? '',
    probability: String(risk?.probability ?? 3),
    impact: String(risk?.impact ?? 3),
    response: risk?.response ?? '',
    ownerId: risk?.owner?.id ?? project.manager?.id ?? '',
    status: risk?.status ?? 'open',
  };
}

function bodyOf(values: Values): object {
  return {
    description: values.description.trim(),
    probability: Number(values.probability),
    impact: Number(values.impact),
    response: optional(values.response),
    owner_id: values.ownerId,
    status: riskStatusSchema.parse(values.status),
  };
}

function useRiskForm(props: Props & { readonly risk?: ProjectRisk; readonly onDone: () => void }) {
  const api = useApiClient();
  const { risk, project } = props;
  const base = `/v1/projects/${project.id}/risks`;
  const save = useProjectAction<object>(async (body, csrfToken) => {
    if (risk === undefined) await api.post(base, { body, csrfToken });
    else await api.put(`${base}/${risk.id}`, { body, version: risk.version, csrfToken });
  }, props.onDone);
  const form = useDialogForm(initialOf(project, risk), problemsOf, (values) => {
    save.execute(bodyOf(values));
  });
  return { save, form };
}

function RiskForm(props: Props & { readonly risk?: ProjectRisk; readonly onDone: () => void }) {
  const { save, form } = useRiskForm(props);
  const choices = choicesOf(props.project);
  const change = (key: keyof Values, value: string): void => {
    form.set({ [key]: value });
  };
  const level = riskLevelOf(Number(form.values.probability), Number(form.values.impact));
  return (
    <DialogForm
      problems={form.problems}
      fields={[...TEXTS, ...choices]}
      action={save}
      submitLabel="Guardar el riesgo"
      onSubmit={form.submit}
    >
      <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
      <ChoiceFields
        specs={choices}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <p className="text-sm" aria-live="polite">
        Nivel: <Badge tone={RISK_LEVEL_TONES[level]}>{PROJECT_RISK_LEVELS[level]}</Badge>
      </p>
    </DialogForm>
  );
}

function RiskRow(props: Props & { readonly risk: ProjectRisk; readonly editable: boolean }) {
  const { risk } = props;
  return (
    <TableRow>
      <TableCell>{risk.description}</TableCell>
      <TableCell>
        <Badge tone={RISK_LEVEL_TONES[risk.level]}>
          {PROJECT_RISK_LEVELS[risk.level]} ({String(risk.probability * risk.impact)})
        </Badge>
      </TableCell>
      <TableCell>{risk.owner?.name ?? '—'}</TableCell>
      <TableCell>{risk.response ?? '—'}</TableCell>
      <TableCell>{RISK_STATUSES[risk.status]}</TableCell>
      <TableCell>
        {props.editable ? (
          <RecordDialog
            triggerLabel="Actualizar"
            variant="outline"
            title="Actualizar el riesgo"
            description="Cambie su valoración, su respuesta o ciérrelo."
          >
            {(close) => <RiskForm project={props.project} risk={risk} onDone={close} />}
          </RecordDialog>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function RisksTable(props: Props & { readonly risks: readonly ProjectRisk[] }): JSX.Element {
  if (props.risks.length === 0) {
    return (
      <EmptyState
        icon={<ShieldAlert />}
        title="Sin riesgos registrados"
        description="Registre lo que podría afectar el alcance, el tiempo, el costo o la calidad."
      />
    );
  }
  const editable = props.project.can.update && props.project.status !== 'closed';
  return (
    <SimpleTable
      caption="Riesgos del proyecto"
      scrollLabel="Riesgos; desplácese a los lados para ver todas las columnas"
      headers={['Riesgo', 'Nivel', 'Responsable', 'Respuesta', 'Estado', 'Acción']}
    >
      {props.risks.map((risk) => (
        <RiskRow key={risk.id} project={props.project} risk={risk} editable={editable} />
      ))}
    </SimpleTable>
  );
}

export function RisksPanel({ project }: Props): JSX.Element {
  const risks = useRisks(project.id);
  return (
    <div className="flex flex-col gap-4">
      {project.can.update && project.status !== 'closed' ? (
        <div>
          <RecordDialog
            triggerLabel="Registrar un riesgo"
            title="Nuevo riesgo"
            description="Probabilidad e impacto de 1 a 5; uno alto avisa al líder del proyecto."
          >
            {(close) => <RiskForm project={project} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={risks} loadingLabel="Cargando los riesgos">
        {(data) => <RisksTable project={project} risks={data.data} />}
      </QueryState>
    </div>
  );
}
