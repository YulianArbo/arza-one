'use client';

import {
  IDEA_DECISIONS,
  VIABILITY_CONCEPTS,
  VIABILITY_CRITERIA,
  downloadLinkResponseSchema,
  ideaDecisionSchema,
  submitViabilitySchema,
  type Idea,
} from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { HrActionButton, HrDialogForm, optionsOf, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { useSession } from '../session/session-provider';
import { INN_REFRESH } from './innovation-queries';

// Los pasos de una idea (B40, ficha 17.16): iniciar la evaluación, diligenciar el FT-INN-003,
// aprobar o archivar y avanzar a desarrollo e implementada. Cada botón aparece solo en el estado
// que lo admite, con el permiso que lo exige, y nunca a quien propuso la idea (decisión 3).

const SCALE = ['1', '2', '3', '4', '5'].map((value) => ({ value, label: value }));

function usePost(idea: Idea) {
  const api = useApiClient();
  return (step: string, body: object, csrfToken: string) =>
    api.post(`/v1/innovation/ideas/${idea.id}/${step}`, {
      body,
      csrfToken,
      version: idea.version,
    });
}

function viabilityFields(): HrField[] {
  return [
    ...Object.entries(VIABILITY_CRITERIA).map(([key, label]) => ({ key, label, options: SCALE })),
    { key: 'concept', label: 'Concepto', options: optionsOf(VIABILITY_CONCEPTS) },
    { key: 'observations', label: 'Observaciones (opcional)' },
  ];
}

function viabilityBody(values: Record<string, string>) {
  const scores = Object.fromEntries(
    Object.keys(VIABILITY_CRITERIA).map((key) => [key, Number(values[key])]),
  );
  return { scores, concept: values['concept'], observations: orNull(values['observations']) };
}

function ViabilityStep({ idea }: { readonly idea: Idea }): JSX.Element | null {
  const post = usePost(idea);
  return (
    <HrDialogForm
      allowed={idea.stage === 'evaluating'}
      label={idea.viability === null ? 'Evaluar viabilidad' : 'Evaluar de nuevo'}
      title={`Evaluación de viabilidad de ${idea.code} (FT-INN-003)`}
      description="Califique cada criterio de 1 (muy bajo) a 5 (muy alto). En riesgos, 5 significa riesgo bajo."
      fields={viabilityFields()}
      schema={submitViabilitySchema}
      prepare={viabilityBody}
      run={(body, csrfToken) => post('viability', body, csrfToken)}
      submitLabel="Guardar evaluación"
      refresh={INN_REFRESH}
    />
  );
}

function DecisionStep({ idea }: { readonly idea: Idea }): JSX.Element | null {
  const post = usePost(idea);
  const open = ['registered', 'evaluating', 'approved', 'in_development'].includes(idea.stage);
  return (
    <HrDialogForm
      allowed={open}
      label="Aprobar o archivar"
      title={`Decidir sobre ${idea.code}`}
      description="Para aprobar, la idea debe tener su evaluación de viabilidad con un concepto distinto de «No viable»."
      fields={[
        { key: 'decision', label: 'Decisión', options: optionsOf(IDEA_DECISIONS) },
        { key: 'note', label: 'Por qué' },
      ]}
      schema={ideaDecisionSchema}
      run={(body, csrfToken) => post('decision', body, csrfToken)}
      submitLabel="Registrar decisión"
      refresh={INN_REFRESH}
    />
  );
}

function ProgressStep({ idea }: { readonly idea: Idea }): JSX.Element | null {
  const post = usePost(idea);
  const next = idea.stage === 'approved' ? 'in_development' : 'implemented';
  if (idea.stage !== 'approved' && idea.stage !== 'in_development') return null;
  const label = next === 'in_development' ? 'Pasar a desarrollo' : 'Marcar implementada';
  return (
    <HrActionButton
      label={label}
      pendingLabel="Guardando…"
      ariaLabel={`${label}: ${idea.code}`}
      run={(csrfToken) => post('progress', { stage: next }, csrfToken)}
      refresh={INN_REFRESH}
    />
  );
}

export function ViabilityPdf({ idea }: { readonly idea: Idea }): JSX.Element | null {
  const api = useApiClient();
  if ((idea.viability?.record_code ?? null) === null) return null;
  return (
    <HrActionButton
      label="Descargar evaluación (PDF)"
      pendingLabel="Preparando…"
      ariaLabel={`Descargar la evaluación de ${idea.code}`}
      run={async (csrfToken) => {
        const link = await api.post(`/v1/innovation/ideas/${idea.id}/viability/download-link`, {
          body: {},
          csrfToken,
          schema: downloadLinkResponseSchema,
        });
        window.open(link.url, '_self');
      }}
    />
  );
}

/** Los pasos que la persona puede dar sobre la idea, según su estado y sus permisos. */
export function IdeaSteps({ idea }: { readonly idea: Idea }): JSX.Element {
  const { canAll } = usePermissions();
  const { session } = useSession();
  const post = usePost(idea);
  const own = idea.proposer.id === session.user.id;
  const evaluates = canAll('inn.idea.evaluate') && !own;
  const decides = canAll('inn.idea.approve') && !own;
  return (
    <div className="flex flex-wrap gap-2">
      {evaluates && idea.stage === 'registered' ? (
        <HrActionButton
          label="Iniciar evaluación"
          pendingLabel="Guardando…"
          ariaLabel={`Iniciar la evaluación de ${idea.code}`}
          run={(csrfToken) => post('evaluation', {}, csrfToken)}
          refresh={INN_REFRESH}
        />
      ) : null}
      {evaluates ? <ViabilityStep idea={idea} /> : null}
      {decides ? <DecisionStep idea={idea} /> : null}
      {canAll('inn.idea.approve') ? <ProgressStep idea={idea} /> : null}
      {canAll('inn.read') ? <ViabilityPdf idea={idea} /> : null}
    </div>
  );
}
