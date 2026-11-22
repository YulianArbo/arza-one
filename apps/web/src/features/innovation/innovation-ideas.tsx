'use client';

import {
  IDEA_STAGES,
  VIABILITY_CONCEPTS,
  ideaListResponseSchema,
  innCodeResponseSchema,
  saveIdeaSchema,
  type Idea,
  type IdeaStage,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { IdeaSteps } from './idea-steps';
import { INN_REFRESH, useInnQuery } from './innovation-queries';

// Banco de ideas (B40, ficha 17.16; FT-INN-005): todo colaborador propone; Calidad y la Dirección
// evalúan con el FT-INN-003 y deciden.

export const STAGE_TONE: Readonly<Record<IdeaStage, 'info' | 'warning' | 'success' | 'neutral'>> = {
  registered: 'info',
  evaluating: 'warning',
  approved: 'success',
  in_development: 'info',
  implemented: 'success',
  archived: 'neutral',
};

function ideaFields(idea?: Idea): HrField[] {
  return [
    { key: 'title', label: 'Nombre corto de la idea', value: idea?.title ?? '' },
    {
      key: 'description',
      label: 'Qué problema resuelve y qué propone',
      value: idea?.description ?? '',
    },
    {
      key: 'expected_benefit',
      label: 'Beneficio esperado (opcional)',
      value: idea?.expected_benefit ?? '',
    },
  ];
}

function ideaBody(values: Record<string, string>) {
  return {
    title: values['title'],
    description: values['description'],
    expected_benefit: orNull(values['expected_benefit']),
  };
}

/** Proponer una idea nueva, o corregir la propia mientras sigue inscrita. */
export function IdeaForm({ idea }: { readonly idea?: Idea }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  const editing = idea !== undefined;
  return (
    <HrDialogForm
      allowed={can('inn.idea.create') && (!editing || idea.stage === 'registered')}
      label={editing ? 'Corregir' : 'Proponer una idea'}
      title={editing ? `Corregir ${idea.code}` : 'Proponer una idea'}
      description="Cuente qué problema resuelve y qué propone. Calidad o la Dirección la evaluarán."
      fields={ideaFields(idea)}
      schema={saveIdeaSchema}
      prepare={ideaBody}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/innovation/ideas/${idea.id}`, { body, csrfToken, version: idea.version })
          : api.post('/v1/innovation/ideas', { body, csrfToken, schema: innCodeResponseSchema })
      }
      submitLabel={editing ? 'Guardar' : 'Proponer'}
      refresh={INN_REFRESH}
    />
  );
}

export function IdeaSummary({ idea }: { readonly idea: Idea }): JSX.Element {
  const viability = idea.viability;
  return (
    <span className="flex flex-col gap-1">
      <span>
        <strong>{idea.code}</strong> · {idea.title}
      </span>
      <span className="text-muted-foreground">
        Propuso {idea.proposer.name} el {formatDate(idea.proposed_on)}
        {idea.evaluator === null ? '' : ` · evalúa ${idea.evaluator.name}`}
      </span>
      <span>{idea.description}</span>
      {viability === null ? null : (
        <span className="text-muted-foreground">
          Viabilidad: {String(viability.total)} de 25 · {VIABILITY_CONCEPTS[viability.concept]}
          {viability.record_code === null ? '' : ` · ${viability.record_code}`}
        </span>
      )}
      {idea.decision_note === null ? null : (
        <span className="text-muted-foreground">Decisión: {idea.decision_note}</span>
      )}
      <Badge tone={STAGE_TONE[idea.stage]}>{IDEA_STAGES[idea.stage]}</Badge>
    </span>
  );
}

export function InnovationIdeas(): JSX.Element {
  const query = useInnQuery('/v1/innovation/ideas', ideaListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Banco de ideas"
        description="Inscrita → en evaluación → aprobada → en desarrollo → implementada, o archivada. Nadie evalúa ni decide su propia idea."
      />
      <div>
        <IdeaForm />
      </div>
      <HrSection id="ideas" title="Ideas, de la más reciente a la más antigua">
        <QueryState query={query} loadingLabel="Cargando el banco de ideas">
          {({ data }) => (
            <HrList
              items={data}
              empty="Aún no hay ideas inscritas."
              keyOf={(item) => item.id}
              render={(item) => (
                <>
                  <IdeaSummary idea={item} />
                  <IdeaSteps idea={item} />
                </>
              )}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
