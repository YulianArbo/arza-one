'use client';

import {
  WATCH_RELEVANCE,
  competitorListResponseSchema,
  innCreatedResponseSchema,
  saveCompetitorSchema,
  saveWatchEntrySchema,
  watchListResponseSchema,
  type Competitor,
  type WatchEntry,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, optionsOf, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { INN_REFRESH, bogotaToday, useInnQuery } from './innovation-queries';

// Vigilancia tecnológica (FT-INN-006) y análisis de competencia (RE-INN-002) (B40, ficha 17.16).

const RELEVANCE_TONE = { high: 'warning', medium: 'info', low: 'neutral' } as const;

function watchFields(entry?: WatchEntry): HrField[] {
  return [
    { key: 'topic', label: 'Tema vigilado', value: entry?.topic ?? '' },
    { key: 'source', label: 'Fuente', value: entry?.source ?? '' },
    { key: 'finding', label: 'Hallazgo', value: entry?.finding ?? '' },
    {
      key: 'relevance',
      label: 'Relevancia',
      options: optionsOf(WATCH_RELEVANCE),
      value: entry?.relevance ?? '',
    },
    {
      key: 'observed_on',
      label: 'Fecha del hallazgo',
      type: 'date',
      value: entry?.observed_on ?? bogotaToday(),
    },
  ];
}

function competitorFields(rival?: Competitor): HrField[] {
  return [
    { key: 'name', label: 'Nombre', value: rival?.name ?? '' },
    { key: 'segment', label: 'Segmento', value: rival?.segment ?? '' },
    { key: 'website', label: 'Sitio web (opcional)', value: rival?.website ?? '' },
    { key: 'strengths', label: 'Fortalezas', value: rival?.strengths ?? '' },
    { key: 'weaknesses', label: 'Debilidades', value: rival?.weaknesses ?? '' },
    {
      key: 'updated_on',
      label: 'Fecha del análisis',
      type: 'date',
      value: rival?.updated_on ?? bogotaToday(),
    },
  ];
}

function WatchForm({ entry }: { readonly entry?: WatchEntry }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const editing = entry !== undefined;
  return (
    <HrDialogForm
      allowed={canAll('inn.watch.manage')}
      label={editing ? 'Actualizar' : 'Registrar hallazgo'}
      title={editing ? `Actualizar «${entry.topic}»` : 'Registrar un hallazgo de vigilancia'}
      description="Anote qué se encontró, dónde y qué significa para la empresa."
      fields={watchFields(entry)}
      schema={saveWatchEntrySchema}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/innovation/watch/${entry.id}`, {
              body,
              csrfToken,
              version: entry.version,
            })
          : api.post('/v1/innovation/watch', { body, csrfToken, schema: innCreatedResponseSchema })
      }
      submitLabel={editing ? 'Guardar' : 'Registrar'}
      refresh={INN_REFRESH}
    />
  );
}

function CompetitorForm({ rival }: { readonly rival?: Competitor }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const editing = rival !== undefined;
  return (
    <HrDialogForm
      allowed={canAll('inn.watch.manage')}
      label={editing ? 'Actualizar' : 'Registrar competidor'}
      title={editing ? `Actualizar ${rival.name}` : 'Registrar un competidor'}
      description="Fortalezas y debilidades frente a la oferta de la empresa."
      fields={competitorFields(rival)}
      schema={saveCompetitorSchema}
      prepare={(values) => ({ ...values, website: orNull(values['website']) })}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/innovation/competitors/${rival.id}`, {
              body,
              csrfToken,
              version: rival.version,
            })
          : api.post('/v1/innovation/competitors', {
              body,
              csrfToken,
              schema: innCreatedResponseSchema,
            })
      }
      submitLabel={editing ? 'Guardar' : 'Registrar'}
      refresh={INN_REFRESH}
    />
  );
}

function WatchSection(): JSX.Element {
  const query = useInnQuery('/v1/innovation/watch', watchListResponseSchema);
  return (
    <HrSection id="vigilancia" title="Vigilancia tecnológica (FT-INN-006)">
      <div>
        <WatchForm />
      </div>
      <QueryState query={query} loadingLabel="Cargando la vigilancia">
        {({ data }) => (
          <HrList
            items={data}
            empty="Aún no hay hallazgos registrados."
            keyOf={(item) => item.id}
            render={(item) => (
              <>
                <span className="flex flex-col gap-1">
                  <strong>{item.topic}</strong>
                  <span>{item.finding}</span>
                  <span className="text-muted-foreground">
                    {item.source} · {formatDate(item.observed_on)} · {item.recorded_by.name}
                  </span>
                  <Badge tone={RELEVANCE_TONE[item.relevance]}>
                    Relevancia {WATCH_RELEVANCE[item.relevance].toLowerCase()}
                  </Badge>
                </span>
                <WatchForm entry={item} />
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function CompetitorSection(): JSX.Element {
  const query = useInnQuery('/v1/innovation/competitors', competitorListResponseSchema);
  return (
    <HrSection id="competencia" title="Análisis de competencia (RE-INN-002)">
      <div>
        <CompetitorForm />
      </div>
      <QueryState query={query} loadingLabel="Cargando la competencia">
        {({ data }) => (
          <HrList
            items={data}
            empty="Aún no hay competidores registrados."
            keyOf={(item) => item.id}
            render={(item) => (
              <>
                <span className="flex flex-col gap-1">
                  <strong>
                    {item.name} · {item.segment}
                  </strong>
                  <span>Fortalezas: {item.strengths}</span>
                  <span>Debilidades: {item.weaknesses}</span>
                  <span className="text-muted-foreground">
                    Análisis del {formatDate(item.updated_on)}
                    {item.website === null ? '' : ` · ${item.website}`}
                  </span>
                </span>
                <CompetitorForm rival={item} />
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function InnovationWatch(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Vigilancia y competencia"
        description="Hallazgos tecnológicos y análisis de los competidores de la empresa."
      />
      <WatchSection />
      <CompetitorSection />
    </div>
  );
}
