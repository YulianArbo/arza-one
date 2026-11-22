'use client';

import {
  QMS_RISK_KINDS,
  QMS_RISK_LEVELS,
  QMS_RISK_SCALE,
  QMS_RISK_STATUSES,
  QMS_RISK_TREATMENTS,
  qmsCreatedResponseSchema,
  qmsRiskListResponseSchema,
  saveQmsRiskSchema,
  type QmsRisk,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, optionsOf, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, useQmsPeople, useQmsProcesses, useQmsQuery } from './quality-queries';

// Riesgos y oportunidades (B38, decisión 9; FT-SGC-003). Probabilidad e impacto de 1 a 5; la
// plataforma calcula el valor y el nivel. Escala por validar con el formato.

const LEVEL_TONE = {
  critical: 'destructive',
  high: 'warning',
  moderate: 'info',
  low: 'success',
} as const;

const SCALE = Object.entries(QMS_RISK_SCALE).map(([value, label]) => ({
  value,
  label: `${value} · ${label}`,
}));

type Options = readonly { value: string; label: string }[];

/** Qué es y de quién: tipo, proceso, descripción, causas y responsable. */
function identityFields(processes: Options, people: Options, risk?: QmsRisk): HrField[] {
  return [
    { key: 'kind', label: 'Tipo', options: optionsOf(QMS_RISK_KINDS), value: risk?.kind ?? '' },
    { key: 'process_id', label: 'Proceso', options: processes, value: risk?.process.id ?? '' },
    { key: 'description', label: 'Descripción', value: risk?.description ?? '' },
    { key: 'causes', label: 'Causas (opcional)', value: risk?.causes ?? '' },
    { key: 'owner_id', label: 'Responsable', options: people, value: risk?.owner.id ?? '' },
  ];
}

/** Cómo se valora y se trata: probabilidad, impacto, tratamiento, revisión y estado. */
function ratingFields(risk?: QmsRisk): HrField[] {
  return [
    {
      key: 'probability',
      label: 'Probabilidad',
      options: SCALE,
      value: risk?.probability.toString() ?? '',
    },
    { key: 'impact', label: 'Impacto', options: SCALE, value: risk?.impact.toString() ?? '' },
    {
      key: 'treatment',
      label: 'Tratamiento (una oportunidad se aprovecha)',
      options: optionsOf(QMS_RISK_TREATMENTS),
      value: risk?.treatment ?? '',
    },
    {
      key: 'treatment_plan',
      label: 'Plan de tratamiento (opcional)',
      value: risk?.treatment_plan ?? '',
    },
    { key: 'review_on', label: 'Próxima revisión', type: 'date', value: risk?.review_on ?? '' },
    {
      key: 'status',
      label: 'Estado',
      options: optionsOf(QMS_RISK_STATUSES),
      value: risk?.status ?? 'active',
    },
  ];
}

function riskFields(processes: Options, people: Options, risk?: QmsRisk): HrField[] {
  return [...identityFields(processes, people, risk), ...ratingFields(risk)];
}

function riskBody(values: Record<string, string>) {
  return {
    ...values,
    causes: orNull(values['causes']),
    treatment_plan: orNull(values['treatment_plan']),
    probability: Number(values['probability']),
    impact: Number(values['impact']),
  };
}

function RiskForm({ risk }: { readonly risk?: QmsRisk }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('qms.risk.manage');
  const processes = useQmsProcesses(allowed);
  const people = useQmsPeople(allowed);
  const editing = risk !== undefined;
  return (
    <HrDialogForm
      allowed={allowed}
      label={editing ? 'Actualizar' : 'Registrar riesgo u oportunidad'}
      title={editing ? `Actualizar ${risk.code}` : 'Registrar un riesgo o una oportunidad'}
      description="Indique probabilidad e impacto de 1 a 5; la plataforma calcula el nivel."
      fields={riskFields(processes, people, risk)}
      schema={saveQmsRiskSchema}
      prepare={riskBody}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/qms/risks/${risk.id}`, { body, csrfToken, version: risk.version })
          : api.post('/v1/qms/risks', { body, csrfToken, schema: qmsCreatedResponseSchema })
      }
      submitLabel={editing ? 'Guardar' : 'Registrar'}
      refresh={QMS_REFRESH}
    />
  );
}

function RiskRow({ risk }: { readonly risk: QmsRisk }): JSX.Element {
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{risk.code}</strong> · {QMS_RISK_KINDS[risk.kind]} · {risk.process.name}
          {risk.status === 'retired' ? ' · retirado' : ''}
        </span>
        <span>{risk.description}</span>
        <span className="text-muted-foreground">
          {QMS_RISK_TREATMENTS[risk.treatment]} · {risk.owner.name} · revisión{' '}
          {formatDate(risk.review_on)}
          {risk.review_due ? ' (ya debía revisarse)' : ''}
        </span>
        <Badge tone={LEVEL_TONE[risk.level]}>
          {QMS_RISK_LEVELS[risk.level]} ({String(risk.probability)} × {String(risk.impact)} ={' '}
          {String(risk.score)})
        </Badge>
      </span>
      <RiskForm risk={risk} />
    </>
  );
}

export function QualityRisks(): JSX.Element {
  const query = useQmsQuery('/v1/qms/risks', qmsRiskListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Riesgos y oportunidades"
        description="Del valor más alto al más bajo. Bajo hasta 4, moderado hasta 9, alto hasta 16 y crítico desde 17 (por validar con FT-SGC-003)."
      />
      <div>
        <RiskForm />
      </div>
      <HrSection id="riesgos" title="Matriz de riesgos y oportunidades">
        <QueryState query={query} loadingLabel="Cargando la matriz">
          {({ data }) => (
            <HrList
              items={data}
              empty="Aún no hay riesgos ni oportunidades."
              keyOf={(item) => item.id}
              render={(item) => <RiskRow risk={item} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
