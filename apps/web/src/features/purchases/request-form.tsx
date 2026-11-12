'use client';

import {
  minQuotesOf,
  purchaseCreatedResponseSchema,
  purchaseTierOf,
  savePurchaseRequestSchema,
  type PurchaseOptions,
  type SavePurchaseRequest,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { LedgerChoice, LedgerField, problemsOf, useValues } from '../finance/ledger-ui';
import { TIER_LABELS, quotesText } from './labels';
import { usePurchaseAction, usePurchaseOptions } from './purchase-ui';

// Nueva solicitud de compra (B33): centro de costo, descripción y valor estimado. Queda en borrador
// hasta que la persona la envía a aprobación.

const FIELDS = [
  { field: 'cost_center_id', id: 'request-center', label: 'Centro de costo' },
  { field: 'description', id: 'request-description', label: 'Descripción' },
  { field: 'estimated_amount', id: 'request-amount', label: 'Valor estimado' },
];

const EMPTY = { cost_center_id: '', description: '', estimated_amount: '' };

/** Lo que el valor escrito exige, según los topes vigentes; null si aún no se puede saber. */
export function tierHint(amount: string, options: PurchaseOptions | undefined): string | null {
  const tiers = options?.tiers;
  const value = amount.trim().replace(',', '.');
  if (tiers === undefined || tiers === null || !/^\d{1,16}(\.\d{1,2})?$/u.test(value)) return null;
  if (Number(value) === 0) return null;
  const tier = purchaseTierOf(value, tiers);
  return `${TIER_LABELS[tier]}: exige ${quotesText(minQuotesOf(tier, tiers))}.`;
}

function useRequestForm(onDone: () => void) {
  const api = useApiClient();
  const form = useValues(EMPTY);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [key] = useState(() => crypto.randomUUID());
  const action = usePurchaseAction<SavePurchaseRequest>(
    (body, csrfToken) =>
      api.post('/v1/purchase-requests', {
        body,
        schema: purchaseCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onDone,
  );
  const submit = (): void => {
    const valid = savePurchaseRequestSchema.safeParse({
      ...form.values,
      estimated_amount: form.values.estimated_amount.trim().replace(',', '.'),
    });
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  return { form, problems, action, submit };
}

export function RequestForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const { form, problems, action, submit } = useRequestForm(onDone);
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
      <RequestFields form={form} problems={problems} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Crear solicitud" pendingLabel="Creando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function RequestFields(props: {
  readonly form: ReturnType<typeof useRequestForm>['form'];
  readonly problems: Record<string, string>;
}): JSX.Element {
  const options = usePurchaseOptions();
  const { values, set } = props.form;
  const hint = tierHint(values.estimated_amount, options);
  const centers = (options?.cost_centers ?? []).map((center) => ({
    value: center.id,
    label: `${center.code} · ${center.name}`,
  }));
  const centerProblem = props.problems['cost_center_id'];
  return (
    <>
      <LedgerChoice
        id="request-center"
        label="Centro de costo"
        value={values.cost_center_id}
        onChange={set('cost_center_id')}
        error={centerProblem === undefined ? undefined : 'Elija un centro de costo.'}
        options={centers}
      />
      <DescriptionField
        value={values.description}
        onChange={set('description')}
        problem={props.problems['description']}
      />
      <LedgerField
        id="request-amount"
        label="Valor estimado"
        decimal
        {...(hint === null ? {} : { hint })}
        value={values.estimated_amount}
        onChange={set('estimated_amount')}
        error={props.problems['estimated_amount']}
      />
    </>
  );
}

function DescriptionField(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly problem: string | undefined;
}): JSX.Element {
  return (
    <LedgerField
      id="request-description"
      label="Descripción"
      hint="Qué necesita comprar y para qué."
      value={props.value}
      onChange={props.onChange}
      error={props.problem}
    />
  );
}
