'use client';

import {
  NONCONFORMITY_STATUSES,
  nonconformityListResponseSchema,
  qmsActionListResponseSchema,
  qmsCodeResponseSchema,
  qmsRiskListResponseSchema,
  reportNonconformitySchema,
  sstIncidentListResponseSchema,
  type NonconformitySummary,
} from '@arza/contracts';
import { Badge, PageHeader, QuickLinks, StatCard } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, bogotaToday, useQmsProcesses, useQmsQuery } from './quality-queries';

// Portada de Calidad (B38): todo colaborador reporta una no conformidad y ve las que reportó;
// quien lee Calidad ve además lo abierto y entra a cada parte del sistema de gestión.

const QUALITY_LINKS = [
  { href: '/app/calidad/no-conformidades', label: 'No conformidades' },
  { href: '/app/calidad/acciones', label: 'Bitácora de acciones' },
  { href: '/app/calidad/riesgos', label: 'Riesgos y oportunidades' },
  { href: '/app/calidad/procesos', label: 'Mapa de procesos' },
  { href: '/app/calidad/contexto', label: 'Contexto y partes interesadas' },
  { href: '/app/calidad/lecciones', label: 'Lecciones aprendidas' },
  { href: '/app/calidad/auditorias', label: 'Programa y auditorías' },
  { href: '/app/calidad/indicadores', label: 'Indicadores' },
  { href: '/app/calidad/revision-direccion', label: 'Revisión por la dirección' },
] as const;

function useIncidentOptions(enabled: boolean) {
  const query = useQmsQuery('/v1/sst/incidents', sstIncidentListResponseSchema, enabled);
  return (query.data?.data ?? []).map((item) => ({ value: item.id, label: item.code }));
}

function reportFields(
  processes: readonly { value: string; label: string }[],
  incidents: readonly { value: string; label: string }[] | null,
) {
  return [
    { key: 'description', label: 'Qué se detectó' },
    {
      key: 'detected_on',
      label: 'Fecha de detección',
      type: 'date' as const,
      value: bogotaToday(),
    },
    { key: 'process_id', label: 'Proceso (opcional)', options: processes },
    ...(incidents === null
      ? []
      : [
          {
            key: 'sst_incident_id',
            label: 'Incidente de SST que la origina (opcional)',
            options: incidents,
          },
        ]),
  ];
}

export function ReportNonconformity(): JSX.Element | null {
  const api = useApiClient();
  const { can, canAll } = usePermissions();
  const linksIncidents = canAll('qms.nonconformity.manage') && canAll('sst.read');
  const processes = useQmsProcesses();
  const incidents = useIncidentOptions(linksIncidents);
  return (
    <HrDialogForm
      allowed={can('qms.nonconformity.create')}
      label="Reportar una no conformidad"
      title="Reportar una no conformidad"
      description="Cuente qué se detectó. Calidad aplicará la corrección inmediata y analizará la causa."
      fields={reportFields(processes, linksIncidents ? incidents : null)}
      schema={reportNonconformitySchema}
      prepare={(values) => ({
        description: values['description'],
        detected_on: values['detected_on'],
        process_id: orNull(values['process_id']),
        sst_incident_id: orNull(values['sst_incident_id']),
      })}
      run={(body, csrfToken) =>
        api.post('/v1/qms/nonconformities', { body, csrfToken, schema: qmsCodeResponseSchema })
      }
      submitLabel="Reportar"
      refresh={QMS_REFRESH}
    />
  );
}

function Indicators(): JSX.Element {
  const ncs = useQmsQuery('/v1/qms/nonconformities', nonconformityListResponseSchema);
  const actions = useQmsQuery('/v1/qms/actions', qmsActionListResponseSchema);
  const risks = useQmsQuery('/v1/qms/risks', qmsRiskListResponseSchema);
  const wait = (ready: boolean, value: number) => (ready ? String(value) : '…');
  const open = (ncs.data?.data ?? []).filter((nc) => nc.status !== 'closed').length;
  const list = actions.data?.data ?? [];
  const highRisks = (risks.data?.data ?? []).filter(
    (risk) => risk.status === 'active' && (risk.level === 'high' || risk.level === 'critical'),
  ).length;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="No conformidades abiertas" value={wait(ncs.isSuccess, open)} />
      <StatCard
        label="Acciones vencidas"
        value={wait(actions.isSuccess, list.filter((action) => action.overdue).length)}
        note="Escalan a la Dirección"
      />
      <StatCard
        label="Acciones por verificar"
        value={wait(
          actions.isSuccess,
          list.filter((action) => action.status === 'executed').length,
        )}
      />
      <StatCard label="Riesgos altos o críticos" value={wait(risks.isSuccess, highRisks)} />
    </div>
  );
}

function MyReportRow({ item }: { readonly item: NonconformitySummary }): JSX.Element {
  return (
    <>
      <span className="flex flex-col">
        <span>
          <strong>{item.code}</strong> · detectada el {formatDate(item.detected_on)}
        </span>
        <span className="text-muted-foreground">{item.description}</span>
      </span>
      <Badge tone={item.status === 'closed' ? 'success' : 'info'}>
        {NONCONFORMITY_STATUSES[item.status]}
      </Badge>
    </>
  );
}

function MyReports(): JSX.Element {
  const query = useQmsQuery('/v1/qms/my/nonconformities', nonconformityListResponseSchema);
  return (
    <HrSection id="mis-reportes" title="No conformidades que reporté">
      <QueryState query={query} loadingLabel="Cargando sus reportes">
        {({ data }) => (
          <HrList
            items={data}
            empty="Aún no ha reportado no conformidades."
            keyOf={(item) => item.id}
            render={(item) => <MyReportRow item={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function QualityHome(): JSX.Element {
  const { can, canAll } = usePermissions();
  const reads = canAll('qms.read');
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Calidad y mejora continua"
        description="Procesos, riesgos, no conformidades, acciones, auditorías, indicadores y revisión por la dirección."
      />
      <div>
        <ReportNonconformity />
      </div>
      {reads ? <Indicators /> : null}
      {reads ? <QuickLinks title="Partes del sistema" links={QUALITY_LINKS} linkAs={Link} /> : null}
      {can('qms.nonconformity.create') ? <MyReports /> : null}
    </div>
  );
}
