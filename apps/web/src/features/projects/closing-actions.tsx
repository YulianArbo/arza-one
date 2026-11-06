'use client';

import type { ProjectDetail } from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { NoteForm, type NoteFormSpec } from '../contracts/decision-forms';
import { RecordDialog } from '../organization/record-dialog';
import { CheckField, DialogForm, Fields, useDialogForm, type FieldSpec } from './form-bits';
import { useProjectAction } from './queries';

// Control y cierre del proyecto (B27, decisiones 4, 5, 7 y 13). El líder define el costo promedio
// de la hora (para la rentabilidad), cuántos días tiene el cliente para responder un acta y si el
// contrato prevé la aceptación tácita, con su cláusula. El Líder técnico pasa el proyecto a cierre
// y lo cierra con las lecciones aprendidas cuando no queda nada pendiente.

interface Props {
  readonly project: ProjectDetail;
}

interface SettingsValues {
  readonly hourCost: string;
  readonly days: string;
  readonly tacit: boolean;
  readonly clause: string;
}

function settingsProblems(values: SettingsValues): Record<string, string> {
  const found: Record<string, string> = {};
  const cost = values.hourCost.trim().replace(',', '.');
  if (cost !== '' && !/^\d{1,16}(\.\d{1,2})?$/u.test(cost)) {
    found['hour_cost'] = 'Escriba el valor en pesos, sin puntos de miles.';
  }
  const respond = Number(values.days);
  if (!Number.isInteger(respond) || respond < 1 || respond > 30) {
    found['respond_days'] = 'El plazo va de 1 a 30 días.';
  }
  if (values.tacit && values.clause.trim().length < 3)
    found['tacit_clause'] = 'Indique la cláusula.';
  return found;
}

function settingsBody(values: SettingsValues): object {
  const cost = values.hourCost.trim().replace(',', '.');
  return {
    hour_cost: cost === '' ? null : cost,
    respond_days: Number(values.days),
    tacit_acceptance: values.tacit,
    tacit_clause: values.tacit ? values.clause.trim() : null,
  };
}

function settingsTexts(project: ProjectDetail, tacit: boolean) {
  const specs: FieldSpec<'hourCost' | 'days' | 'clause'>[] = [];
  if (project.can.see_money) {
    specs.push({
      key: 'hourCost',
      field: 'hour_cost',
      id: 'control-costo',
      label: 'Costo promedio de una hora del equipo (pesos)',
      inputMode: 'decimal',
      hint: 'Para la rentabilidad. El equipo del proyecto no lo ve.',
    });
  }
  specs.push({
    key: 'days',
    field: 'respond_days',
    id: 'control-plazo',
    label: 'Días que tiene el cliente para responder un acta',
    inputMode: 'numeric',
  });
  if (tacit) {
    specs.push({
      key: 'clause',
      field: 'tacit_clause',
      id: 'control-clausula',
      label: 'Cláusula del contrato que la prevé',
    });
  }
  return specs;
}

function useSettingsForm(props: Props & { readonly onDone: () => void }) {
  const api = useApiClient();
  const { control } = props.project;
  const save = useProjectAction<object>(async (body, csrfToken) => {
    await api.put(`/v1/projects/${props.project.id}/control-settings`, {
      body,
      version: props.project.version,
      csrfToken,
    });
  }, props.onDone);
  const initial: SettingsValues = {
    hourCost: control.hour_cost ?? '',
    days: String(control.respond_days),
    tacit: control.tacit_acceptance,
    clause: control.tacit_clause ?? '',
  };
  const form = useDialogForm(initial, settingsProblems, (values) => {
    save.execute(settingsBody(values));
  });
  return { save, form };
}

function SettingsForm(props: Props & { readonly onDone: () => void }): JSX.Element {
  const { save, form } = useSettingsForm(props);
  const texts = settingsTexts(props.project, form.values.tacit);
  return (
    <DialogForm
      problems={form.problems}
      fields={texts}
      action={save}
      submitLabel="Guardar"
      onSubmit={form.submit}
    >
      <CheckField
        id="control-tacita"
        label="El contrato prevé la aceptación tácita"
        checked={form.values.tacit}
        onChange={(tacit) => {
          form.set({ tacit });
        }}
      />
      <Fields
        specs={texts}
        values={form.values}
        problems={form.problems}
        onChange={(key, value) => {
          form.set({ [key]: value });
        }}
      />
    </DialogForm>
  );
}

export function SettingsDialog({ project }: Props): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Configurar el control"
      variant="outline"
      title="Control del proyecto"
      description="Costo de la hora, plazo del cliente para las actas y aceptación tácita."
    >
      {(close) => <SettingsForm project={project} onDone={close} />}
    </RecordDialog>
  );
}

function CloseForm(props: Props & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const close = useProjectAction<object>(
    (body, csrfToken) =>
      api.post(`/v1/projects/${props.project.id}/actions/close`, {
        body,
        version: props.project.version,
        csrfToken,
      }),
    props.onDone,
  );
  const spec: NoteFormSpec = {
    idPrefix: 'proyecto-cierre',
    textField: 'lessons',
    textLabel: 'Lecciones aprendidas',
    submitLabel: 'Cerrar el proyecto',
    pendingLabel: 'Cerrando…',
  };
  return <NoteForm spec={spec} action={close} />;
}

export function CloseDialog({ project }: Props): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Cerrar el proyecto"
      title={`Cerrar ${project.code}`}
      description="Se cierra con todos los entregables aceptados, sin incidentes abiertos ni horas por aprobar. Cerrado, solo se consulta."
    >
      {(done) => <CloseForm project={project} onDone={done} />}
    </RecordDialog>
  );
}
