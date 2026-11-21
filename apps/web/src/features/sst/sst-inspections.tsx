'use client';

import {
  INSPECTION_KINDS,
  INSPECTION_STATUS,
  checklistResponseSchema,
  inspectionListResponseSchema,
  recordInspectionSchema,
  requestHomeInspectionSchema,
  reviewInspectionSchema,
  sstCreatedResponseSchema,
  type Inspection,
} from '@arza/contracts';
import { FormField, PageHeader, SelectField } from '@arza/ui';
import { useState, type SubmitEvent, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { NewRecord } from '../finance/ledger-ui';
import { HrDialogForm, HrList, HrSection, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { FormProblem } from './form-problem';
import { ItemChoice, checklistAnswers } from './my-sst-home';
import { useSstEmployees } from './sst-options';
import { useSstAction, useSstQuery } from './sst-queries';

// Inspecciones (B37, decisión 11): SST registra las de instalaciones y emergencias con su lista de
// chequeo; pide la autoinspección del puesto en casa y la revisa cuando el colaborador responde.

type Kind = 'facility' | 'emergency';

function useChecklist(kind: Kind) {
  return useSstQuery(`/v1/sst/inspections/checklists/${kind}`, checklistResponseSchema);
}

function Checklist({ kind }: { readonly kind: Kind }): JSX.Element {
  const query = useChecklist(kind);
  return (
    <QueryState query={query} loadingLabel="Cargando la lista de chequeo">
      {({ data }) => (
        <div className="flex flex-col gap-2">
          {data.map((item) => (
            <ItemChoice key={item.code} prefix="inspeccion" code={item.code} label={item.label} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function KindSelect(props: { readonly kind: Kind; readonly onChange: (kind: Kind) => void }) {
  return (
    <SelectField
      id="inspeccion-tipo"
      label="Tipo"
      value={props.kind}
      onChange={(event) => {
        props.onChange(event.target.value as Kind);
      }}
      options={[
        { value: 'facility', label: INSPECTION_KINDS.facility },
        { value: 'emergency', label: INSPECTION_KINDS.emergency },
      ]}
    />
  );
}

function useRecordAction(onDone: () => void) {
  const api = useApiClient();
  return useSstAction(
    (body: object, csrfToken: string) =>
      api.post('/v1/sst/inspections', { body, csrfToken, schema: sstCreatedResponseSchema }),
    onDone,
  );
}

function RecordForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const [kind, setKind] = useState<Kind>('facility');
  const [problem, setProblem] = useState<string | null>(null);
  const codes = (useChecklist(kind).data?.data ?? []).map((item) => item.code);
  const action = useRecordAction(onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = recordInspectionSchema.safeParse({
      kind,
      inspected_on: text(form, 'inspected_on'),
      place: text(form, 'place'),
      answers: checklistAnswers(form, codes),
      findings: orNull(text(form, 'findings')),
    });
    setProblem(parsed.success ? null : 'Indique fecha y lugar, y responda cada punto de la lista.');
    if (parsed.success) action.execute(parsed.data);
  };
  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={submit}>
      <KindSelect kind={kind} onChange={setKind} />
      <FormField id="inspeccion-fecha" name="inspected_on" label="Fecha" type="date" />
      <FormField id="inspeccion-lugar" name="place" label="Lugar" />
      <Checklist kind={kind} />
      <FormField id="inspeccion-hallazgos" name="findings" label="Hallazgos (opcional)" />
      <FormProblem text={problem} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton
        label="Registrar inspección"
        pendingLabel="Registrando…"
        pending={action.pending}
      />
      {action.dialog}
    </form>
  );
}

function HomeRequest({ allowed }: { readonly allowed: boolean }): JSX.Element | null {
  const api = useApiClient();
  const employees = useSstEmployees(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Pedir autoinspección en casa"
      title="Pedir la autoinspección del puesto en casa"
      description="El colaborador la responde desde Mi espacio."
      fields={[
        { key: 'employee_id', label: 'Colaborador', options: employees },
        { key: 'due_on', label: 'Fecha límite', type: 'date' },
      ]}
      schema={requestHomeInspectionSchema}
      run={(body, csrfToken) =>
        api.post('/v1/sst/inspections/home-requests', {
          body,
          csrfToken,
          schema: sstCreatedResponseSchema,
        })
      }
      submitLabel="Pedir"
    />
  );
}

function ReviewDialog(props: { readonly item: Inspection; readonly allowed: boolean }) {
  const api = useApiClient();
  const failed = props.item.answers.filter((answer) => answer.result === 'fail');
  return (
    <HrDialogForm
      allowed={props.allowed && props.item.status === 'submitted'}
      label="Revisar"
      title="Revisar la autoinspección"
      description={failed.map((answer) => answer.label).join(' · ') || 'Todo cumple.'}
      fields={[{ key: 'findings', label: 'Hallazgos y recomendaciones' }]}
      schema={reviewInspectionSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/sst/inspections/${props.item.id}/actions/review`, {
          body,
          csrfToken,
          version: props.item.version,
        })
      }
      submitLabel="Guardar revisión"
    />
  );
}

function InspectionRow(props: { readonly item: Inspection; readonly manages: boolean }) {
  const { item } = props;
  const when =
    item.inspected_on === null
      ? `Límite ${formatDate(item.due_on)}`
      : `Hecha ${formatDate(item.inspected_on)}`;
  return (
    <>
      <span className="flex flex-col">
        <span>
          <strong>{INSPECTION_KINDS[item.kind]}</strong> · {INSPECTION_STATUS[item.status]} ·{' '}
          {item.employee?.name ?? item.place ?? ''}
        </span>
        <span>
          {when} · {String(item.failed)} puntos sin cumplir
        </span>
        {item.findings === null ? null : <span>Hallazgos: {item.findings}</span>}
      </span>
      <ReviewDialog item={item} allowed={props.manages} />
    </>
  );
}

export function SstInspections(): JSX.Element {
  const { canAll } = usePermissions();
  const manages = canAll('sst.inspection.manage');
  const query = useSstQuery('/v1/sst/inspections', inspectionListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Inspecciones"
        description="Instalaciones, emergencias y puesto de trabajo en casa."
      />
      <HrSection id="inspecciones" title="Inspecciones">
        <div className="flex flex-wrap gap-2">
          <NewRecord
            allowed={manages}
            label="Registrar inspección"
            title="Registrar una inspección"
            description="Responda cada punto de la lista de chequeo."
          >
            {(close) => <RecordForm onDone={close} />}
          </NewRecord>
          <HomeRequest allowed={manages} />
        </div>
        <QueryState query={query} loadingLabel="Cargando inspecciones">
          {({ data }) => (
            <HrList
              items={data}
              empty="No hay inspecciones registradas."
              keyOf={(item) => item.id}
              render={(item) => <InspectionRow item={item} manages={manages} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
