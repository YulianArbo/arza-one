'use client';

import {
  completeWorkPlanItemSchema,
  saveWorkPlanItemSchema,
  sstCreatedResponseSchema,
  workPlanResponseSchema,
  type WorkPlanCompliance,
  type WorkPlanItem,
} from '@arza/contracts';
import { Badge, FormField, PageHeader, StatCard } from '@arza/ui';
import { useCallback, useState, type SubmitEvent, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { NewRecord } from '../finance/ledger-ui';
import { HrDialogForm, HrList, HrSection } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { FormProblem } from './form-problem';
import { EvidencePicker, type EvidenceState } from './evidence-picker';
import { currentYear, useSstPeople } from './sst-options';
import { useSstAction, useSstQuery } from './sst-queries';

// Plan anual de trabajo del SG-SST (B37, decisión 14): cada actividad se da por hecha solo con su
// evidencia; el plan muestra el cumplimiento del año y el de la fecha.

function useCompleteAction(item: WorkPlanItem, onDone: () => void) {
  const api = useApiClient();
  return useSstAction(
    (body: object, csrfToken: string) =>
      api.post(`/v1/sst/work-plan/${item.id}/actions/complete`, {
        body,
        csrfToken,
        version: item.version,
      }),
    onDone,
  );
}

function CompleteForm(props: { readonly item: WorkPlanItem; readonly onDone: () => void }) {
  const [evidence, setEvidence] = useState<EvidenceState>({ fileId: null, busy: false });
  const [problem, setProblem] = useState<string | null>(null);
  const onEvidence = useCallback((state: EvidenceState) => {
    setEvidence(state);
  }, []);
  const action = useCompleteAction(props.item, props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const done = new FormData(event.currentTarget).get('done_on');
    const parsed = completeWorkPlanItemSchema.safeParse({
      done_on: typeof done === 'string' ? done : '',
      evidence_file_id: evidence.fileId ?? '',
    });
    setProblem(parsed.success ? null : 'Indique la fecha y adjunte la evidencia ya disponible.');
    if (parsed.success) action.execute(parsed.data);
  };
  const id = props.item.id;
  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={submit}>
      <FormField id={`plan-hecho-${id}`} name="done_on" label="Fecha en que se hizo" type="date" />
      <EvidencePicker
        id={`plan-evidencia-${id}`}
        label="Evidencia"
        accept="application/pdf,image/jpeg,image/png"
        onChange={onEvidence}
      />
      <FormProblem text={problem} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton
        label="Dar por hecha"
        pendingLabel="Guardando…"
        pending={action.pending || evidence.busy}
      />
      {action.dialog}
    </form>
  );
}

function ItemState({ item }: { readonly item: WorkPlanItem }): JSX.Element {
  if (item.done_on !== null) {
    return <Badge tone="success">Hecha el {formatDate(item.done_on)} con evidencia</Badge>;
  }
  return item.overdue ? <Badge tone="destructive">Vencida</Badge> : <Badge>Pendiente</Badge>;
}

function PlanRow({ item, manages }: { readonly item: WorkPlanItem; readonly manages: boolean }) {
  return (
    <>
      <span className="flex flex-col">
        <span>
          <strong>{item.activity}</strong> · {item.responsible.name} · vence{' '}
          {formatDate(item.due_on)}
        </span>
        <ItemState item={item} />
      </span>
      <NewRecord
        allowed={manages && item.done_on === null}
        variant="outline"
        label="Dar por hecha"
        title={`Dar por hecha · ${item.activity}`}
        description="La actividad solo se da por hecha con su evidencia."
      >
        {(close) => <CompleteForm item={item} onDone={close} />}
      </NewRecord>
    </>
  );
}

function NewItem({ year, allowed }: { readonly year: number; readonly allowed: boolean }) {
  const api = useApiClient();
  const people = useSstPeople(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Agregar actividad"
      title="Agregar una actividad al plan"
      description="El responsable recibirá un aviso."
      fields={[
        { key: 'activity', label: 'Actividad' },
        { key: 'responsible_id', label: 'Responsable', options: people },
        { key: 'due_on', label: 'Fecha límite', type: 'date' },
      ]}
      schema={saveWorkPlanItemSchema}
      prepare={(values) => ({ ...values, year })}
      run={(body, csrfToken) =>
        api.post('/v1/sst/work-plan', { body, csrfToken, schema: sstCreatedResponseSchema })
      }
      submitLabel="Agregar"
    />
  );
}

function Compliance({ compliance }: { readonly compliance: WorkPlanCompliance }): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard
        label="Cumplimiento del año"
        value={`${String(compliance.year_percent)} %`}
        note={`${String(compliance.done)} de ${String(compliance.total)} actividades`}
      />
      <StatCard
        label="Cumplimiento a la fecha"
        value={`${String(compliance.to_date_percent)} %`}
        note={`${String(compliance.done_of_due)} de ${String(compliance.due_to_date)} que ya vencieron`}
      />
    </div>
  );
}

export function SstPlan(): JSX.Element {
  const { canAll } = usePermissions();
  const year = currentYear();
  const query = useSstQuery(`/v1/sst/work-plan?year=${String(year)}`, workPlanResponseSchema);
  const manages = canAll('sst.plan.manage');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Plan anual de trabajo ${String(year)}`}
        description="Cada actividad se cumple con su evidencia."
      />
      <QueryState query={query} loadingLabel="Cargando el plan">
        {({ compliance, data }) => (
          <>
            <Compliance compliance={compliance} />
            <HrSection id="plan" title="Actividades">
              <NewItem year={year} allowed={manages} />
              <HrList
                items={data}
                empty="El plan aún no tiene actividades."
                keyOf={(item) => item.id}
                render={(item) => <PlanRow item={item} manages={manages} />}
              />
            </HrSection>
          </>
        )}
      </QueryState>
    </div>
  );
}
