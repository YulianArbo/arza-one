'use client';

import {
  CONTEXT_KINDS,
  IMPACT_LEVELS,
  PESTEL_FACTORS,
  STAKEHOLDER_TYPES,
  contextItemListResponseSchema,
  qmsCreatedResponseSchema,
  saveContextItemSchema,
  saveStakeholderSchema,
  stakeholderListResponseSchema,
  type ContextItem,
  type ContextKind,
  type Stakeholder,
} from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, optionsOf, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { currentYear } from '../sst/sst-options';
import { QMS_REFRESH, useQmsQuery } from './quality-queries';

// Contexto de la organización (FT-DG-001, matriz DOFA-PESTEL) y partes interesadas (FT-DG-002)
// (B38, ficha 17.15).

const KINDS = Object.keys(CONTEXT_KINDS) as ContextKind[];

function NewContextItem({ year }: { readonly year: number }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  return (
    <HrDialogForm
      allowed={canAll('qms.process.manage')}
      label="Agregar factor"
      title={`Agregar un factor de contexto ${String(year)}`}
      description="El factor PESTEL se indica solo en oportunidades y amenazas."
      fields={[
        { key: 'kind', label: 'Tipo', options: optionsOf(CONTEXT_KINDS) },
        {
          key: 'pestel_factor',
          label: 'Factor PESTEL (opcional)',
          options: optionsOf(PESTEL_FACTORS),
        },
        { key: 'description', label: 'Descripción' },
        { key: 'impact', label: 'Impacto', options: optionsOf(IMPACT_LEVELS) },
      ]}
      schema={saveContextItemSchema}
      prepare={(values) => ({
        ...values,
        pestel_factor: orNull(values['pestel_factor']),
        year,
      })}
      run={(body, csrfToken) =>
        api.post('/v1/qms/context', { body, csrfToken, schema: qmsCreatedResponseSchema })
      }
      submitLabel="Agregar"
      refresh={QMS_REFRESH}
    />
  );
}

function ContextMatrix({ items }: { readonly items: readonly ContextItem[] }): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {KINDS.map((kind) => {
        const list = items.filter((item) => item.kind === kind);
        return (
          <section key={kind} aria-label={CONTEXT_KINDS[kind]} className="rounded-md border p-3">
            <h3 className="font-semibold">{CONTEXT_KINDS[kind]}</h3>
            {list.length === 0 ? (
              <p className="text-muted-foreground">Sin factores.</p>
            ) : (
              <ul className="ms-5 list-disc">
                {list.map((item) => (
                  <li key={item.id}>
                    {item.description} · impacto {IMPACT_LEVELS[item.impact].toLowerCase()}
                    {item.pestel_factor === null ? '' : ` · ${PESTEL_FACTORS[item.pestel_factor]}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function NewStakeholder(): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  return (
    <HrDialogForm
      allowed={canAll('qms.process.manage')}
      label="Agregar parte interesada"
      title="Agregar una parte interesada"
      description="Sus necesidades, expectativas y cómo se les hace seguimiento."
      fields={[
        { key: 'name', label: 'Parte interesada' },
        { key: 'stakeholder_type', label: 'Tipo', options: optionsOf(STAKEHOLDER_TYPES) },
        { key: 'needs', label: 'Necesidades' },
        { key: 'expectations', label: 'Expectativas' },
        { key: 'monitoring', label: 'Seguimiento (opcional)' },
      ]}
      schema={saveStakeholderSchema}
      prepare={(values) => ({ ...values, monitoring: orNull(values['monitoring']) })}
      run={(body, csrfToken) =>
        api.post('/v1/qms/stakeholders', { body, csrfToken, schema: qmsCreatedResponseSchema })
      }
      submitLabel="Agregar"
      refresh={QMS_REFRESH}
    />
  );
}

function StakeholderRow({ item }: { readonly item: Stakeholder }): JSX.Element {
  return (
    <span className="flex flex-col">
      <span>
        <strong>{item.name}</strong> · {STAKEHOLDER_TYPES[item.stakeholder_type]}
      </span>
      <span>Necesidades: {item.needs}</span>
      <span>Expectativas: {item.expectations}</span>
      {item.monitoring === null ? null : (
        <span className="text-muted-foreground">Seguimiento: {item.monitoring}</span>
      )}
    </span>
  );
}

export function QualityContext(): JSX.Element {
  const year = currentYear();
  const context = useQmsQuery(
    `/v1/qms/context?year=${String(year)}`,
    contextItemListResponseSchema,
  );
  const parties = useQmsQuery('/v1/qms/stakeholders', stakeholderListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Contexto y partes interesadas"
        description="Matriz DOFA-PESTEL del año y partes interesadas del sistema de gestión."
      />
      <HrSection id="dofa" title={`Matriz DOFA-PESTEL ${String(year)}`}>
        <NewContextItem year={year} />
        <QueryState query={context} loadingLabel="Cargando la matriz">
          {({ data }) => <ContextMatrix items={data} />}
        </QueryState>
      </HrSection>
      <HrSection id="partes" title="Partes interesadas">
        <NewStakeholder />
        <QueryState query={parties} loadingLabel="Cargando las partes interesadas">
          {({ data }) => (
            <HrList
              items={data}
              empty="Aún no hay partes interesadas."
              keyOf={(item) => item.id}
              render={(item) => <StakeholderRow item={item} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
