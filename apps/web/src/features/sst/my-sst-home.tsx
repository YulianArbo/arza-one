'use client';

import {
  INSPECTION_CHECK_RESULTS,
  answerHomeInspectionSchema,
  type PendingHomeInspection,
} from '@arza/contracts';
import { FormField, Radio } from '@arza/ui';
import { useState, type SubmitEvent, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { problemsOf } from '../finance/ledger-ui';
import { useSstAction } from './sst-queries';

// Autoinspección del puesto de trabajo en casa (B37, decisión 11): el colaborador responde cada
// punto de la lista de chequeo; SST la revisa después.

type Result = keyof typeof INSPECTION_CHECK_RESULTS;

export function ItemChoice(props: {
  readonly prefix: string;
  readonly code: string;
  readonly label: string;
}): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-1 rounded-xl border p-3">
      <legend className="px-1 text-sm font-medium">{props.label}</legend>
      <div className="flex flex-wrap gap-4">
        {(Object.keys(INSPECTION_CHECK_RESULTS) as Result[]).map((result) => {
          const id = `${props.prefix}-${props.code}-${result}`;
          return (
            <div key={result} className="flex min-h-11 items-center gap-2">
              <Radio id={id} name={`item:${props.code}`} value={result} />
              <label htmlFor={id}>{INSPECTION_CHECK_RESULTS[result]}</label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Respuestas de la lista de chequeo: cada campo «item:CÓDIGO» del formulario. */
export function checklistAnswers(
  form: FormData,
  codes: readonly string[],
): { code: string; result: string; note: null }[] {
  return codes.map((code) => {
    const value = form.get(`item:${code}`);
    return { code, result: typeof value === 'string' ? value : '', note: null };
  });
}

function parseAnswers(form: FormData, inspection: PendingHomeInspection) {
  const answers = checklistAnswers(
    form,
    inspection.checklist.map((item) => item.code),
  );
  if (answers.some((answer) => answer.result === '')) {
    return { problems: { answers: 'Responda cada punto de la lista.' } } as const;
  }
  const place = form.get('place');
  const parsed = answerHomeInspectionSchema.safeParse({
    place: typeof place === 'string' ? place : '',
    answers,
  });
  return parsed.success
    ? ({ data: parsed.data } as const)
    : ({ problems: problemsOf(parsed.error) } as const);
}

function useAnswerAction(inspection: PendingHomeInspection) {
  const api = useApiClient();
  return useSstAction((body: object, csrfToken: string) =>
    api.post(`/v1/sst/me/inspections/${inspection.id}/answers`, {
      body,
      csrfToken,
      version: inspection.version,
    }),
  );
}

function HomeFields(props: {
  readonly inspection: PendingHomeInspection;
  readonly problems: Record<string, string>;
}): JSX.Element {
  const { inspection } = props;
  const placeId = `casa-lugar-${inspection.id}`;
  return (
    <>
      <FormSummary
        problems={props.problems}
        fields={[{ field: 'place', id: placeId, label: 'Ciudad y barrio' }]}
      />
      <FormField
        id={placeId}
        name="place"
        label="Ciudad y barrio"
        error={props.problems['place'] ?? null}
      />
      {inspection.checklist.map((item) => (
        <ItemChoice
          key={item.code}
          prefix={`casa-${inspection.id}`}
          code={item.code}
          label={item.label}
        />
      ))}
    </>
  );
}

export function HomeInspectionForm(props: {
  readonly inspection: PendingHomeInspection;
}): JSX.Element {
  const { inspection } = props;
  const [problems, setProblems] = useState<Record<string, string>>({});
  const action = useAnswerAction(inspection);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parseAnswers(new FormData(event.currentTarget), inspection);
    setProblems('problems' in result ? result.problems : {});
    if ('data' in result) action.execute(result.data);
  };
  return (
    <form
      noValidate
      aria-label="Autoinspección del puesto de trabajo en casa"
      className="flex w-full flex-col gap-3"
      onSubmit={submit}
    >
      <p>Responda antes del {formatDate(inspection.due_on)}. Sin la dirección exacta.</p>
      <HomeFields inspection={inspection} problems={problems} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton
        label="Enviar autoinspección"
        pendingLabel="Enviando…"
        pending={action.pending}
      />
      {action.dialog}
    </form>
  );
}
