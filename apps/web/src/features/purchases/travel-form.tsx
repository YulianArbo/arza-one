'use client';

import {
  purchaseCreatedResponseSchema,
  saveTravelRequestSchema,
  type SaveTravelRequest,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { LedgerField, problemsOf, useValues } from '../finance/ledger-ui';
import { usePurchaseAction } from './purchase-ui';

// Nueva solicitud de viaje (B33, FT-ADM-003): destino, motivo, fechas y anticipo. Queda en borrador
// hasta que el viajero la envía a aprobación.

const FIELDS = [
  { field: 'destination', id: 'travel-destination', label: 'Destino' },
  { field: 'purpose', id: 'travel-purpose', label: 'Motivo' },
  { field: 'starts_on', id: 'travel-starts', label: 'Salida' },
  { field: 'ends_on', id: 'travel-ends', label: 'Regreso' },
  { field: 'advance_amount', id: 'travel-advance', label: 'Anticipo' },
];

const EMPTY = { destination: '', purpose: '', starts_on: '', ends_on: '', advance_amount: '0' };

type Problems = Record<string, string>;
type Values = ReturnType<typeof useValues<typeof EMPTY>>;

function useTravelForm(onDone: () => void) {
  const api = useApiClient();
  const form = useValues(EMPTY);
  const [problems, setProblems] = useState<Problems>({});
  const [key] = useState(() => crypto.randomUUID());
  const action = usePurchaseAction<SaveTravelRequest>(
    (body, csrfToken) =>
      api.post('/v1/travel-requests', {
        body,
        schema: purchaseCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onDone,
  );
  const submit = (): void => {
    const valid = saveTravelRequestSchema.safeParse({
      ...form.values,
      advance_amount: form.values.advance_amount.trim().replace(',', '.'),
    });
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  return { form, problems, action, submit };
}

export function TravelForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const { form, problems, action, submit } = useTravelForm(onDone);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormSummary problems={problems} fields={FIELDS} />
      <TravelPlaceFields form={form} problems={problems} />
      <TravelDateFields form={form} problems={problems} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Crear solicitud" pendingLabel="Creando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function TravelPlaceFields(props: {
  readonly form: Values;
  readonly problems: Problems;
}): JSX.Element {
  const { values, set } = props.form;
  return (
    <>
      <LedgerField
        id="travel-destination"
        label="Destino"
        value={values.destination}
        onChange={set('destination')}
        error={props.problems['destination']}
      />
      <LedgerField
        id="travel-purpose"
        label="Motivo"
        value={values.purpose}
        onChange={set('purpose')}
        error={props.problems['purpose']}
      />
    </>
  );
}

function TravelDateFields(props: {
  readonly form: Values;
  readonly problems: Problems;
}): JSX.Element {
  const { values, set } = props.form;
  const dateProblem = (field: string): string | undefined =>
    props.problems[field] === undefined || values[field as 'starts_on'] !== ''
      ? props.problems[field]
      : 'Escriba la fecha.';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <LedgerField
        id="travel-starts"
        label="Salida"
        type="date"
        value={values.starts_on}
        onChange={set('starts_on')}
        error={dateProblem('starts_on')}
      />
      <LedgerField
        id="travel-ends"
        label="Regreso"
        type="date"
        value={values.ends_on}
        onChange={set('ends_on')}
        error={dateProblem('ends_on')}
      />
      <LedgerField
        id="travel-advance"
        label="Anticipo"
        hint="En pesos. Escriba 0 si no necesita anticipo."
        decimal
        value={values.advance_amount}
        onChange={set('advance_amount')}
        error={props.problems['advance_amount']}
      />
    </div>
  );
}
