'use client';

import {
  SST_INCIDENT_KINDS,
  SST_INCIDENT_STATUS,
  UNSAFE_REPORT_STATUS,
  attendUnsafeReportSchema,
  closeIncidentSchema,
  investigationPlanSchema,
  reportToArlSchema,
  sstIncidentDetailSchema,
  sstIncidentListResponseSchema,
  startInvestigationSchema,
  unsafeReportListResponseSchema,
  type SstIncidentDetail,
  type SstIncidentSummary,
  type UnsafeReport,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrActionButton, HrDialogForm, HrList, HrSection, optionsOf } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { useSstPeople } from './sst-options';
import { useSstQuery } from './sst-queries';

// Incidentes, accidentes e investigación; actos y condiciones inseguras (B37, decisiones 5 y 6).
// El accidente muestra su plazo para la ARL y se marca en rojo si ya venció sin reporte.

type Post = (action: string, body: object, csrfToken: string) => Promise<unknown>;
interface StepProps {
  readonly summary: SstIncidentSummary;
  readonly post: Post;
}
const ACTION_SLOTS = ['1', '2', '3'] as const;

function actionsOf(values: Record<string, string>) {
  return ACTION_SLOTS.flatMap((slot) => {
    const description = values[`description_${slot}`] ?? '';
    if (description.trim() === '') return [];
    const responsible = values[`responsible_${slot}`] ?? '';
    return [{ description, responsible_id: responsible, due_on: values[`due_${slot}`] ?? '' }];
  });
}

function planFields(people: readonly { value: string; label: string }[]) {
  return [
    { key: 'immediate_causes', label: 'Causas inmediatas' },
    { key: 'root_causes', label: 'Causas básicas o raíz' },
    ...ACTION_SLOTS.flatMap((slot) => [
      { key: `description_${slot}`, label: `Acción ${slot}` },
      { key: `responsible_${slot}`, label: `Responsable ${slot}`, options: people },
      { key: `due_${slot}`, label: `Fecha límite ${slot}`, type: 'date' as const },
    ]),
  ];
}

function PlanStep(props: StepProps): JSX.Element | null {
  const people = useSstPeople(props.summary.status === 'investigating');
  return (
    <HrDialogForm
      allowed={props.summary.status === 'investigating'}
      label="Registrar plan"
      title={`Causas y plan de acción · ${props.summary.code}`}
      description="Registre hasta tres acciones; cada responsable recibirá el aviso."
      fields={planFields(people)}
      schema={investigationPlanSchema}
      prepare={(values) => ({
        immediate_causes: values['immediate_causes'],
        root_causes: values['root_causes'],
        actions: actionsOf(values),
      })}
      run={(body, csrfToken) => props.post('plan', body, csrfToken)}
      submitLabel="Registrar plan"
    />
  );
}

function ArlStep(props: StepProps): JSX.Element | null {
  const { summary } = props;
  return (
    <HrDialogForm
      allowed={summary.kind === 'accident' && summary.arl_reported_on === null}
      label="Registrar reporte a la ARL"
      title={`Reporte a la ARL · ${summary.code}`}
      description={`Fecha límite: ${formatDate(summary.arl_due_on)}.`}
      fields={[
        { key: 'reported_on', label: 'Fecha del reporte', type: 'date' },
        { key: 'filing_number', label: 'Número de radicado del FURAT' },
      ]}
      schema={reportToArlSchema}
      run={(body, csrfToken) => props.post('report-arl', body, csrfToken)}
      submitLabel="Registrar"
    />
  );
}

function InvestigateStep(props: StepProps): JSX.Element | null {
  return (
    <HrDialogForm
      allowed={props.summary.status === 'reported'}
      label="Investigar"
      title={`Abrir la investigación · ${props.summary.code}`}
      description="Indique quiénes investigan: jefe inmediato, COPASST y SST."
      fields={[{ key: 'team', label: 'Equipo investigador' }]}
      schema={startInvestigationSchema}
      prepare={(values) => ({ ...values, affected_employee_id: null })}
      run={(body, csrfToken) => props.post('investigate', body, csrfToken)}
      submitLabel="Abrir investigación"
    />
  );
}

function CloseStep(props: StepProps): JSX.Element | null {
  return (
    <HrDialogForm
      allowed={props.summary.status === 'action_plan'}
      label="Cerrar"
      title={`Cerrar el incidente · ${props.summary.code}`}
      description="Se cierra con todas las acciones hechas y, si es accidente, reportado a la ARL."
      fields={[{ key: 'conclusion', label: 'Conclusión y lecciones aprendidas' }]}
      schema={closeIncidentSchema}
      run={(body, csrfToken) => props.post('close', body, csrfToken)}
      submitLabel="Cerrar incidente"
    />
  );
}

function Steps({ summary }: { readonly summary: SstIncidentSummary }): JSX.Element {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const post: Post = (action, body, csrfToken) =>
    api.post(`/v1/sst/incidents/${summary.id}/actions/${action}`, {
      body,
      csrfToken,
      version: summary.version,
    });
  const investigates = canAll('sst.incident.investigate');
  return (
    <div className="flex flex-wrap gap-2">
      {investigates ? <ArlStep summary={summary} post={post} /> : null}
      {investigates ? <InvestigateStep summary={summary} post={post} /> : null}
      {investigates ? <PlanStep summary={summary} post={post} /> : null}
      {canAll('sst.incident.close') ? <CloseStep summary={summary} post={post} /> : null}
    </div>
  );
}

function Detail({ detail }: { readonly detail: SstIncidentDetail }): JSX.Element {
  return (
    <div className="flex w-full flex-col gap-1 rounded-md bg-muted p-3">
      <span>Qué pasó: {detail.description}</span>
      {detail.arl_filing_number === null ? null : (
        <span>Radicado ARL: {detail.arl_filing_number}</span>
      )}
      {detail.team === null ? null : <span>Equipo: {detail.team}</span>}
      {detail.root_causes === null ? null : <span>Causas raíz: {detail.root_causes}</span>}
      {detail.actions.map((action) => (
        <span key={action.id}>
          Acción: {action.description} · {action.responsible.name} · vence{' '}
          {formatDate(action.due_on)} ·{' '}
          {action.done_on === null ? 'pendiente' : `hecha el ${formatDate(action.done_on)}`}
        </span>
      ))}
      {detail.conclusion === null ? null : <span>Conclusión: {detail.conclusion}</span>}
    </div>
  );
}

function ArlBadge({ summary }: { readonly summary: SstIncidentSummary }): JSX.Element | null {
  if (summary.kind !== 'accident') return null;
  if (summary.arl_reported_on !== null) {
    return <Badge tone="success">ARL: reportado el {formatDate(summary.arl_reported_on)}</Badge>;
  }
  return (
    <Badge tone={summary.arl_overdue ? 'destructive' : 'warning'}>
      ARL: reportar a más tardar el {formatDate(summary.arl_due_on)}
    </Badge>
  );
}

function IncidentRow({ summary }: { readonly summary: SstIncidentSummary }): JSX.Element {
  const api = useApiClient();
  const [detail, setDetail] = useState<SstIncidentDetail | null>(null);
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{summary.code}</strong> · {SST_INCIDENT_KINDS[summary.kind]} ·{' '}
          {SST_INCIDENT_STATUS[summary.status]} · {formatDateTime(summary.occurred_at)} ·{' '}
          {summary.location}
        </span>
        <ArlBadge summary={summary} />
      </span>
      <HrActionButton
        label="Ver detalle"
        pendingLabel="Abriendo…"
        ariaLabel={`Ver el detalle de ${summary.code}`}
        run={async () => {
          const path = `/v1/sst/incidents/${summary.id}`;
          setDetail(await api.get(path, { schema: sstIncidentDetailSchema }));
        }}
      />
      <Steps summary={summary} />
      {detail === null ? null : <Detail detail={detail} />}
    </>
  );
}

function AttendDialog({ item }: { readonly item: UnsafeReport }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  return (
    <HrDialogForm
      allowed={canAll('sst.incident.investigate') && item.status !== 'closed'}
      label="Atender"
      title={`Atender ${item.code}`}
      description={item.description}
      fields={[
        {
          key: 'status',
          label: 'Estado',
          options: optionsOf({ in_progress: 'En atención', closed: 'Atendido' }),
        },
        { key: 'response', label: 'Qué se hizo o qué se hará' },
      ]}
      schema={attendUnsafeReportSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/sst/unsafe-reports/${item.id}/actions/attend`, {
          body,
          csrfToken,
          version: item.version,
        })
      }
      submitLabel="Guardar"
    />
  );
}

function UnsafeRow({ item }: { readonly item: UnsafeReport }): JSX.Element {
  return (
    <>
      <span className="flex flex-col">
        <span>
          <strong>{item.code}</strong> · {UNSAFE_REPORT_STATUS[item.status]} · {item.location} ·{' '}
          {item.reported_by.name}
        </span>
        <span className="text-muted-foreground">{item.description}</span>
        {item.response === null ? null : <span>Respuesta: {item.response}</span>}
      </span>
      <AttendDialog item={item} />
    </>
  );
}

function UnsafeReports(): JSX.Element {
  const query = useSstQuery('/v1/sst/unsafe-reports', unsafeReportListResponseSchema);
  return (
    <HrSection id="actos-condiciones" title="Actos y condiciones inseguras">
      <QueryState query={query} loadingLabel="Cargando reportes">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay reportes."
            keyOf={(item) => item.id}
            render={(item) => <UnsafeRow item={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function SstIncidents(): JSX.Element {
  const query = useSstQuery('/v1/sst/incidents', sstIncidentListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Incidentes y reportes"
        description="Los accidentes se reportan a la ARL dentro de los dos días hábiles siguientes."
      />
      <HrSection id="incidentes" title="Incidentes y accidentes">
        <QueryState query={query} loadingLabel="Cargando incidentes">
          {({ data }) => (
            <HrList
              items={data}
              empty="No hay incidentes reportados."
              keyOf={(item) => item.id}
              render={(item) => <IncidentRow summary={item} />}
            />
          )}
        </QueryState>
      </HrSection>
      <UnsafeReports />
    </div>
  );
}
