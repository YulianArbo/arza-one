'use client';

import {
  addSelectionEvaluationSchema,
  advanceCandidateSchema,
  CANDIDATE_SOURCES,
  discardCandidateSchema,
  hrCreatedResponseSchema,
  NEXT_STAGE,
  noticeListResponseSchema,
  OPEN_CANDIDATE_STAGES,
  registerCandidateSchema,
  SELECTION_EVALUATION_KINDS,
  vacancyListResponseSchema,
  type Candidate,
  type Vacancy,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { NewRecord } from '../finance/ledger-ui';
import { ConsentFields } from '../privacy/consent-fields';
import { consentBody, EMPTY_CONSENT } from '../privacy/consent-values';
import { HrForm, type HrField } from './hr-form';
import { PrepareHiring } from './hiring-form';
import { useHrQuery } from './hr-queries';

/** Campos del registro de candidatura, con las vacantes abiertas como opciones. */
function candidateFields(vacancies: readonly Vacancy[]): readonly HrField[] {
  return [
    {
      key: 'vacancy_id',
      label: 'Vacante',
      options: vacancies.map(({ id, code, position }) => ({
        value: id,
        label: `${code} · ${position.name}`,
      })),
    },
    {
      key: 'source',
      label: 'Origen',
      options: Object.entries(CANDIDATE_SOURCES).map(([value, label]) => ({ value, label })),
    },
    { key: 'applied_on', label: 'Fecha de postulación', type: 'date', value: bogotaToday() },
    { key: 'first_name', label: 'Nombres' },
    { key: 'last_name', label: 'Apellidos' },
    { key: 'id_type', label: 'Código del tipo de documento', value: 'CC' },
    { key: 'id_number', label: 'Número de documento' },
    { key: 'email', label: 'Correo', type: 'email' },
    { key: 'phone', label: 'Teléfono' },
  ];
}

/** Cuerpo del registro: el teléfono vacío viaja como nulo. */
function registrationBody(
  values: Record<string, string>,
  consent: Parameters<typeof consentBody>[0],
) {
  const { vacancy_id, source, applied_on, phone, ...person } = values;
  return {
    vacancy_id,
    source,
    applied_on,
    person: { ...person, phone: phone === '' ? null : phone },
    consent: consentBody(consent),
  };
}

export function NewCandidate(): JSX.Element {
  return (
    <NewRecord
      allowed
      label="Registrar candidatura"
      title="Registrar candidatura"
      description="Registre los datos y la autorización de selección."
    >
      {(close) => <NewCandidateForm onDone={close} />}
    </NewRecord>
  );
}

function NewCandidateForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const notices = useHrQuery('/v1/hr/candidates/authorization-notices', noticeListResponseSchema);
  const vacancies = useHrQuery('/v1/hr/vacancies', vacancyListResponseSchema);
  return (
    <QueryState query={vacancies} loadingLabel="Cargando vacantes abiertas">
      {({ data }) => (
        <QueryState query={notices} loadingLabel="Cargando autorización">
          {(result) => (
            <CandidateRegistration
              vacancies={data.filter(({ status }) => status === 'open')}
              notices={result.data}
              onDone={onDone}
            />
          )}
        </QueryState>
      )}
    </QueryState>
  );
}

function CandidateRegistration({
  vacancies,
  notices,
  onDone,
}: {
  readonly vacancies: readonly Vacancy[];
  readonly notices: Parameters<typeof ConsentFields>[0]['notices'];
  readonly onDone: () => void;
}): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const [consent, setConsent] = useState(EMPTY_CONSENT);
  return (
    <HrForm
      fields={candidateFields(vacancies)}
      schema={registerCandidateSchema}
      prepare={(values) => registrationBody(values, consent)}
      run={(body, csrfToken) =>
        api.post('/v1/hr/candidates', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      label="Registrar candidatura"
      onDone={onDone}
    >
      <ConsentFields
        notices={notices}
        values={consent}
        errors={{}}
        onChange={setConsent}
        idPrefix="hr-candidate-consent"
      />
    </HrForm>
  );
}

/** Avance a la siguiente etapa, con la versión que el listado conoce. */
function AdvanceRecord({ candidate }: { readonly candidate: Candidate }): JSX.Element {
  const api = useApiClient();
  return (
    <NewRecord
      allowed={NEXT_STAGE[candidate.stage] !== undefined}
      label="Avanzar"
      title="Avanzar candidatura"
      description={`Confirme el avance de ${candidate.name} a la siguiente etapa.`}
    >
      {(close) => (
        <HrForm
          fields={[]}
          schema={advanceCandidateSchema}
          run={(body, csrfToken) =>
            api.post(`/v1/hr/candidates/${candidate.id}/actions/advance`, {
              body,
              csrfToken,
              version: candidate.version,
            })
          }
          label="Confirmar avance"
          onDone={close}
        />
      )}
    </NewRecord>
  );
}

/** Registro de la evaluación, solo en la etapa de evaluación. */
function EvaluateRecord({ candidate }: { readonly candidate: Candidate }): JSX.Element {
  return (
    <NewRecord
      allowed={candidate.stage === 'evaluating'}
      label="Evaluar"
      title="Registrar evaluación"
      description={candidate.name}
    >
      {(close) => <Evaluation candidateId={candidate.id} onDone={close} />}
    </NewRecord>
  );
}

/** Descarte con motivo, mientras la candidatura siga abierta y sin colaborador. */
function DiscardRecord({ candidate }: { readonly candidate: Candidate }): JSX.Element {
  const api = useApiClient();
  return (
    <NewRecord
      allowed={OPEN_CANDIDATE_STAGES.includes(candidate.stage) && candidate.employee_id === null}
      label="Descartar"
      title="Descartar candidatura"
      description={candidate.name}
    >
      {(close) => (
        <HrForm
          fields={[{ key: 'reason', label: 'Motivo del descarte' }]}
          schema={discardCandidateSchema}
          run={(body, csrfToken) =>
            api.post(`/v1/hr/candidates/${candidate.id}/actions/discard`, {
              body,
              csrfToken,
              version: candidate.version,
            })
          }
          label="Descartar candidatura"
          onDone={close}
        />
      )}
    </NewRecord>
  );
}

export function CandidateActions({ candidate }: { readonly candidate: Candidate }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <PrepareHiring candidate={candidate} />
      <AdvanceRecord candidate={candidate} />
      <EvaluateRecord candidate={candidate} />
      <DiscardRecord candidate={candidate} />
    </div>
  );
}

function evaluationFields(): readonly HrField[] {
  return [
    {
      key: 'kind',
      label: 'Tipo',
      options: Object.entries(SELECTION_EVALUATION_KINDS).map(([value, label]) => ({
        value,
        label,
      })),
    },
    { key: 'evaluated_on', label: 'Fecha de evaluación', type: 'date', value: bogotaToday() },
    { key: 'score', label: 'Puntaje de 0 a 100', type: 'number' },
    { key: 'note', label: 'Observación' },
  ];
}

/** El puntaje vacío no se envía y la observación vacía viaja como nula. */
function evaluationBody(values: Record<string, string>) {
  const score = values['score'];
  const note = values['note'];
  return {
    ...values,
    score: score === '' ? undefined : Number(score),
    note: note === '' ? null : note,
  };
}

function Evaluation({
  candidateId,
  onDone,
}: {
  readonly candidateId: string;
  readonly onDone: () => void;
}): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <HrForm
      fields={evaluationFields()}
      schema={addSelectionEvaluationSchema}
      prepare={evaluationBody}
      run={(body, csrfToken) =>
        api.post(`/v1/hr/candidates/${candidateId}/evaluations`, {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      label="Guardar evaluación"
      onDone={onDone}
    />
  );
}
