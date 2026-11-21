'use client';

import {
  ACTION_STATUSES,
  ANALYSIS_METHODS,
  ISHIKAWA_CATEGORIES,
  NONCONFORMITY_CLASSES,
  NONCONFORMITY_SOURCES,
  NONCONFORMITY_STATUSES,
  nonconformityDetailResponseSchema,
  nonconformityListResponseSchema,
  type IshikawaCategory,
  type NonconformityAnalysis,
  type NonconformityDetailResponse,
  type NonconformitySummary,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrActionButton, HrList, HrSection } from '../hr/hr-dialog';
import { NonconformitySteps } from './nonconformity-steps';
import { ReportNonconformity } from './quality-home';
import { useQmsQuery } from './quality-queries';

// No conformidades y salidas no conformes (B38, ficha 17.15): la lista con su origen enlazado
// (queja procedente, incidente de SST), los pasos del flujo y el detalle con sus acciones.

const STATUS_TONE = {
  detected: 'destructive',
  contained: 'warning',
  analyzing: 'warning',
  planned: 'info',
  verified: 'info',
  closed: 'success',
  reopened: 'destructive',
} as const;

function AnalysisView({ analysis }: { readonly analysis: NonconformityAnalysis }): JSX.Element {
  if (analysis.method === 'five_whys') {
    return (
      <ol className="ms-5 list-decimal">
        {analysis.whys.map((why) => (
          <li key={why}>{why}</li>
        ))}
      </ol>
    );
  }
  const categories = Object.entries(analysis.causes) as [IshikawaCategory, string[]][];
  return (
    <ul className="ms-5 list-disc">
      {categories
        .filter(([, causes]) => causes.length > 0)
        .map(([key, causes]) => (
          <li key={key}>
            {ISHIKAWA_CATEGORIES[key]}: {causes.join('; ')}
          </li>
        ))}
    </ul>
  );
}

function Detail({ detail }: { readonly detail: NonconformityDetailResponse }): JSX.Element {
  const nc = detail.nonconformity;
  return (
    <div className="flex w-full flex-col gap-1 rounded-md bg-muted p-3">
      <span>Qué se detectó: {nc.description}</span>
      {nc.containment === null ? null : (
        <span>
          Corrección inmediata ({formatDate(nc.contained_on)}): {nc.containment}
        </span>
      )}
      {nc.analysis === null ? null : (
        <span>
          Análisis ({ANALYSIS_METHODS[nc.analysis.method]}):
          <AnalysisView analysis={nc.analysis} />
        </span>
      )}
      {nc.root_cause === null ? null : <span>Causa raíz: {nc.root_cause}</span>}
      {nc.reopen_reason === null ? null : <span>Reabierta: {nc.reopen_reason}</span>}
      {detail.actions.map((action) => (
        <span key={action.id}>
          {action.code}: {action.description} · {action.responsible.name} · compromiso{' '}
          {formatDate(action.due_on)} · {ACTION_STATUSES[action.status]}
        </span>
      ))}
      {nc.closed_on === null ? null : <span>Cerrada el {formatDate(nc.closed_on)}</span>}
    </div>
  );
}

function OriginLine({ item }: { readonly item: NonconformitySummary }): JSX.Element {
  const origin = item.origin === null ? '' : ` ${item.origin.code}`;
  return (
    <span className="text-muted-foreground">
      Origen: {NONCONFORMITY_SOURCES[item.source]}
      {origin} · reportó {item.reported_by.name} · {formatDate(item.detected_on)}
    </span>
  );
}

function NonconformityRow({ item }: { readonly item: NonconformitySummary }): JSX.Element {
  const api = useApiClient();
  const [detail, setDetail] = useState<NonconformityDetailResponse | null>(null);
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{item.code}</strong>
          {item.classification === null ? '' : ` · ${NONCONFORMITY_CLASSES[item.classification]}`}
          {item.process === null ? '' : ` · ${item.process.name}`}
        </span>
        <span>{item.description}</span>
        <OriginLine item={item} />
        <Badge tone={STATUS_TONE[item.status]}>{NONCONFORMITY_STATUSES[item.status]}</Badge>
      </span>
      <HrActionButton
        label="Ver detalle"
        pendingLabel="Abriendo…"
        ariaLabel={`Ver el detalle de ${item.code}`}
        run={async () => {
          const path = `/v1/qms/nonconformities/${item.id}`;
          setDetail(await api.get(path, { schema: nonconformityDetailResponseSchema }));
        }}
      />
      <NonconformitySteps item={item} />
      {detail === null ? null : <Detail detail={detail} />}
    </>
  );
}

export function QualityNonconformities(): JSX.Element {
  const query = useQmsQuery('/v1/qms/nonconformities', nonconformityListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="No conformidades"
        description="Detectada → contenida → en análisis → con plan → verificada → cerrada eficaz o reabierta."
      />
      <div>
        <ReportNonconformity />
      </div>
      <HrSection id="no-conformidades" title="No conformidades y salidas no conformes">
        <QueryState query={query} loadingLabel="Cargando no conformidades">
          {({ data }) => (
            <HrList
              items={data}
              empty="No hay no conformidades registradas."
              keyOf={(item) => item.id}
              render={(item) => <NonconformityRow item={item} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
