'use client';

import {
  DISCIPLINARY_DECISIONS,
  DISCIPLINARY_STATUS,
  citeDisciplinarySchema,
  decideDisciplinarySchema,
  disciplinaryCaseSchema,
  disciplinaryListResponseSchema,
  hrCreatedResponseSchema,
  openDisciplinarySchema,
  recordHearingSchema,
  type DisciplinaryCase,
  type DisciplinarySummary,
} from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { useActiveEmployees } from './hr-admin-absences';
import { HrActionButton, HrDialogForm, HrList, HrSection, optionsOf, orNull } from './hr-dialog';
import { useHrQuery } from './hr-queries';

// Proceso disciplinario con debido proceso (B36, decisión 8). Información restringida: la lista no
// muestra el contenido; «Ver el caso» lo descifra y la consulta queda en la auditoría. Los soportes
// (citación, acta y decisión) se cargan antes en Archivos y se pegan aquí por su identificador.

function OpenCase(): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const employees = useActiveEmployees();
  return (
    <HrDialogForm
      allowed
      label="Abrir proceso"
      title="Abrir un proceso disciplinario"
      description="Describa los hechos con claridad: el colaborador los verá en la citación."
      fields={[
        { key: 'employee_id', label: 'Colaborador', options: employees },
        { key: 'facts', label: 'Hechos' },
      ]}
      schema={openDisciplinarySchema}
      run={(body, csrfToken) =>
        api.post('/v1/hr/disciplinary-cases', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Abrir proceso"
    />
  );
}

function CaseView({ detail }: { readonly detail: DisciplinaryCase }): JSX.Element {
  return (
    <div className="flex w-full flex-col gap-1 rounded-md bg-muted p-3">
      <span>Hechos: {detail.facts}</span>
      {detail.statement === null ? null : <span>Descargos: {detail.statement}</span>}
      {detail.reasoning === null ? null : <span>Motivación: {detail.reasoning}</span>}
    </div>
  );
}

type StepPost = (action: string, body: object, csrfToken: string) => Promise<unknown>;

function CiteStep(props: { readonly summary: DisciplinarySummary; readonly post: StepPost }) {
  return (
    <HrDialogForm
      allowed={props.summary.status === 'opened'}
      label="Citar a descargos"
      title={`Citar a descargos · ${props.summary.code}`}
      description="La diligencia debe ser al menos 3 días hábiles después de hoy."
      fields={[
        { key: 'hearing_on', label: 'Fecha de los descargos', type: 'date' },
        { key: 'citation_file_id', label: 'Identificador de la citación firmada (opcional)' },
      ]}
      schema={citeDisciplinarySchema}
      prepare={(values) => ({ ...values, citation_file_id: orNull(values['citation_file_id']) })}
      run={(body, csrfToken) => props.post('cite', body, csrfToken)}
      submitLabel="Citar"
    />
  );
}

function HearingStep(props: { readonly summary: DisciplinarySummary; readonly post: StepPost }) {
  return (
    <HrDialogForm
      allowed={props.summary.status === 'cited'}
      label="Registrar descargos"
      title={`Descargos · ${props.summary.code}`}
      description="Resuma lo que dijo el colaborador y adjunte el acta firmada."
      fields={[
        { key: 'statement', label: 'Resumen de los descargos' },
        { key: 'hearing_record_file_id', label: 'Identificador del acta firmada' },
      ]}
      schema={recordHearingSchema}
      run={(body, csrfToken) => props.post('hearing', body, csrfToken)}
      submitLabel="Registrar"
    />
  );
}

function DecideStep(props: { readonly summary: DisciplinarySummary; readonly post: StepPost }) {
  return (
    <HrDialogForm
      allowed={props.summary.status === 'heard'}
      label="Decidir"
      title={`Decisión motivada · ${props.summary.code}`}
      description="Los días solo aplican a la suspensión."
      fields={[
        { key: 'decision', label: 'Decisión', options: optionsOf(DISCIPLINARY_DECISIONS) },
        { key: 'suspension_days', label: 'Días de suspensión', type: 'number' },
        { key: 'reasoning', label: 'Motivación' },
      ]}
      schema={decideDisciplinarySchema}
      prepare={(values) => ({
        ...values,
        suspension_days:
          values['decision'] === 'suspension' ? Number(values['suspension_days']) : null,
        decision_file_id: null,
      })}
      run={(body, csrfToken) => props.post('decide', body, csrfToken)}
      submitLabel="Registrar decisión"
    />
  );
}

function Steps({ summary }: { readonly summary: DisciplinarySummary }): JSX.Element {
  const api = useApiClient();
  const path = `/v1/hr/disciplinary-cases/${summary.id}/actions`;
  const post: StepPost = (action, body, csrfToken) =>
    api.post(`${path}/${action}`, { body, csrfToken, version: summary.version });
  return (
    <div className="flex flex-wrap gap-2">
      <CiteStep summary={summary} post={post} />
      <HearingStep summary={summary} post={post} />
      <DecideStep summary={summary} post={post} />
    </div>
  );
}

function CaseRow({ summary }: { readonly summary: DisciplinarySummary }): JSX.Element {
  const api = useApiClient();
  const [detail, setDetail] = useState<DisciplinaryCase | null>(null);
  return (
    <>
      <span>
        <strong>{summary.code}</strong> · {summary.employee.name} ·{' '}
        {DISCIPLINARY_STATUS[summary.status]}
        {summary.hearing_on === null ? null : ` · descargos ${formatDate(summary.hearing_on)}`}
        {summary.decision === null ? null : ` · ${DISCIPLINARY_DECISIONS[summary.decision]}`}
      </span>
      <HrActionButton
        label="Ver el caso"
        pendingLabel="Abriendo…"
        ariaLabel={`Ver el caso ${summary.code}`}
        run={async (csrfToken) => {
          setDetail(
            await api.post(`/v1/hr/disciplinary-cases/${summary.id}/read`, {
              body: {},
              csrfToken,
              schema: disciplinaryCaseSchema,
            }),
          );
        }}
      />
      <Steps summary={summary} />
      {detail === null ? null : <CaseView detail={detail} />}
    </>
  );
}

export function DisciplineAdmin(): JSX.Element {
  const query = useHrQuery('/v1/hr/disciplinary-cases', disciplinaryListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Procesos disciplinarios"
        description="Información restringida: cada consulta del caso queda registrada."
      />
      <HrSection id="procesos" title="Procesos">
        <OpenCase />
        <QueryState query={query} loadingLabel="Cargando procesos">
          {({ data }) => (
            <HrList
              items={data}
              empty="No hay procesos disciplinarios."
              keyOf={(summary) => summary.id}
              render={(summary) => <CaseRow summary={summary} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
