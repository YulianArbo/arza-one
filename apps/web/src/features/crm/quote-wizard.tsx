'use client';

import {
  createdResponseSchema,
  type QuoteDetail,
  type QuoteOptions,
  type QuoteTotals,
} from '@arza/contracts';
import { Button, Card, CardContent, FormField, TextareaField, cn } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type ReactNode, type SubmitEvent } from 'react';

import { FormSummary, type SummaryField } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { useCrmAction } from './crm-action';
import { CRM_PATHS, formatPesos, formatRate } from './labels';
import {
  draftBody,
  initialValues,
  liveTotals,
  needsApproval,
  problemsOf,
  stepProblems,
  type QuoteValues,
} from './quote-form-values';
import { QuoteItemsStep, itemSummaryFields } from './quote-items-step';
import { useQuoteOptions } from './queries';

// Asistente de cotización (B23, ficha 17.6): 1) cliente y vigencia, 2) ítems con los totales en
// vivo, 3) condiciones y revisión. Guarda el borrador completo; pedir el envío se hace en la ficha.

type Step = 1 | 2 | 3;

const STEPS: readonly { step: Step; label: string }[] = [
  { step: 1, label: 'Cliente y vigencia' },
  { step: 2, label: 'Ítems' },
  { step: 3, label: 'Condiciones y revisión' },
];

const VALIDITY_FIELDS: readonly SummaryField[] = [
  { field: 'valid_until', id: 'cotizacion-vigencia', label: 'Válida hasta' },
];

const CONDITION_FIELDS: readonly SummaryField[] = [
  { field: 'payment_terms', id: 'cotizacion-pago', label: 'Forma de pago' },
  { field: 'delivery_terms', id: 'cotizacion-entrega', label: 'Plazo de entrega' },
  { field: 'warranty', id: 'cotizacion-garantia', label: 'Garantía' },
  { field: 'notes', id: 'cotizacion-notas', label: 'Notas' },
];

/** A quién va la cotización: el cliente y la oportunidad. */
export interface QuoteTarget {
  readonly opportunityId: string;
  readonly clientName: string;
  readonly opportunityTitle: string;
}

function StepList({ current }: { readonly current: Step }): JSX.Element {
  return (
    <ol aria-label="Pasos de la cotización" className="flex flex-wrap gap-2 text-sm">
      {STEPS.map(({ step, label }) => (
        <li
          key={step}
          aria-current={step === current ? 'step' : undefined}
          className={cn(
            'rounded-full border px-3 py-1',
            step === current ? 'border-primary font-medium' : 'text-muted-foreground',
          )}
        >
          {step}. {label}
        </li>
      ))}
    </ol>
  );
}

function TotalsBox({ totals }: { readonly totals: QuoteTotals | null }): JSX.Element {
  if (totals === null) {
    return <p className="text-sm text-muted-foreground">Complete los ítems para ver el total.</p>;
  }
  const rows: [string, string][] = [
    ['Subtotal', formatPesos(totals.subtotal)],
    ['Descuentos', formatPesos(totals.discount_total)],
    ...totals.taxes.map((tax): [string, string] => [
      `IVA ${formatRate(tax.tax_rate)}`,
      formatPesos(tax.tax),
    ]),
    ['Total', formatPesos(totals.total)],
  ];
  return (
    <dl aria-label="Totales de la cotización" className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
      {rows.map(([label, value], index) => (
        <div key={label} className={cn('contents', index === rows.length - 1 && 'font-semibold')}>
          <dt>{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type ConditionKey = 'paymentTerms' | 'deliveryTerms' | 'warranty' | 'notes';

const CONDITION_INPUTS: readonly [ConditionKey, string, string, string][] = [
  ['paymentTerms', 'cotizacion-pago', 'Forma de pago', 'payment_terms'],
  ['deliveryTerms', 'cotizacion-entrega', 'Plazo de entrega', 'delivery_terms'],
  ['warranty', 'cotizacion-garantia', 'Garantía (opcional)', 'warranty'],
  ['notes', 'cotizacion-notas', 'Notas para el cliente (opcional)', 'notes'],
];

function ConditionsStep(props: {
  readonly values: QuoteValues;
  readonly problems: Readonly<Record<string, string>>;
  readonly set: (key: keyof QuoteValues, text: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {CONDITION_INPUTS.map(([key, id, label, problem]) => (
        <TextareaField
          key={key}
          id={id}
          label={label}
          rows={2}
          value={props.values[key]}
          error={props.problems[problem] ?? null}
          onChange={(event) => {
            props.set(key, event.target.value);
          }}
        />
      ))}
    </div>
  );
}

function useQuoteWizard(target: QuoteTarget, quote: QuoteDetail | null) {
  const api = useApiClient();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<QuoteValues>(() => initialValues(quote));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useCrmAction<QuoteValues, string>(
    async (current, csrfToken) => {
      const body = draftBody(current);
      if (quote === null) {
        const created = await api.post('/v1/crm/quotes', {
          body: { opportunity_id: target.opportunityId, ...body },
          schema: createdResponseSchema,
          csrfToken,
        });
        return created.id;
      }
      await api.put(`/v1/crm/quotes/${quote.id}`, { body, version: quote.version, csrfToken });
      return quote.id;
    },
    (id) => {
      router.push(CRM_PATHS.quote(id));
    },
  );
  const advance = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = stepProblems(problemsOf(values), step);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    if (step === 3) save.execute(values);
    else setStep(step === 1 ? 2 : 3);
  };
  const back = (): void => {
    setProblems({});
    setStep(step === 3 ? 2 : 1);
  };
  return { step, values, setValues, problems, save, advance, back };
}

function ValidityStep(props: {
  readonly wizard: ReturnType<typeof useQuoteWizard>;
  readonly target: QuoteTarget;
}): JSX.Element {
  const { wizard, target } = props;
  return (
    <div className="flex flex-col gap-4">
      <p>
        <span className="font-medium">Cliente: </span>
        {target.clientName}
        <span className="block text-sm text-muted-foreground">{target.opportunityTitle}</span>
      </p>
      <FormField
        id="cotizacion-vigencia"
        label="Válida hasta (último día en que el cliente puede aceptarla)"
        type="date"
        value={wizard.values.validUntil}
        error={wizard.problems['valid_until'] ?? null}
        onChange={(event) => {
          wizard.setValues({ ...wizard.values, validUntil: event.target.value });
        }}
      />
    </div>
  );
}

function StepBody(props: {
  readonly wizard: ReturnType<typeof useQuoteWizard>;
  readonly target: QuoteTarget;
  readonly options: QuoteOptions;
  readonly totals: QuoteTotals | null;
}): ReactNode {
  const { wizard, options } = props;
  if (wizard.step === 1) return <ValidityStep wizard={wizard} target={props.target} />;
  if (wizard.step === 3) {
    const set = (key: keyof QuoteValues, text: string): void => {
      wizard.setValues({ ...wizard.values, [key]: text });
    };
    return <ConditionsStep values={wizard.values} problems={wizard.problems} set={set} />;
  }
  return (
    <QuoteItemsStep
      items={wizard.values.items}
      options={options}
      totals={props.totals}
      approvalNeeded={needsApproval(wizard.values, options.discount_cap)}
      problems={wizard.problems}
      onChange={(items) => {
        wizard.setValues({ ...wizard.values, items });
      }}
    />
  );
}

function summaryFields(step: Step, count: number): readonly SummaryField[] {
  if (step === 1) return VALIDITY_FIELDS;
  return step === 2 ? itemSummaryFields(count) : CONDITION_FIELDS;
}

function WizardButtons(props: { readonly wizard: ReturnType<typeof useQuoteWizard> }): JSX.Element {
  const { wizard } = props;
  return (
    <div className="flex flex-wrap justify-between gap-3">
      <Button type="button" variant="outline" disabled={wizard.step === 1} onClick={wizard.back}>
        Anterior
      </Button>
      {wizard.step === 3 ? (
        <SubmitButton
          label="Guardar borrador"
          pendingLabel="Guardando…"
          pending={wizard.save.pending}
        />
      ) : (
        <Button type="submit">Siguiente</Button>
      )}
    </div>
  );
}

function WizardForm(props: {
  readonly target: QuoteTarget;
  readonly quote: QuoteDetail | null;
  readonly options: QuoteOptions;
}): JSX.Element {
  const wizard = useQuoteWizard(props.target, props.quote);
  const totals = liveTotals(wizard.values, props.options);
  return (
    <form noValidate onSubmit={wizard.advance} className="flex flex-col gap-4">
      <StepList current={wizard.step} />
      {wizard.save.error === null ? null : <FormError error={wizard.save.error} />}
      <FormSummary
        problems={wizard.problems}
        fields={summaryFields(wizard.step, wizard.values.items.length)}
      />
      <StepBody wizard={wizard} target={props.target} options={props.options} totals={totals} />
      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <TotalsBox totals={totals} />
          <p className="text-xs text-muted-foreground">
            Vigencia hasta el {formatDate(wizard.values.validUntil)}. Los impuestos usan las tarifas
            vigentes hoy.
          </p>
        </CardContent>
      </Card>
      <WizardButtons wizard={wizard} />
      {wizard.save.dialog}
    </form>
  );
}

/** El asistente, cuando ya llegaron las opciones (servicios, impuestos y tope). */
export function QuoteWizard(props: {
  readonly target: QuoteTarget;
  readonly quote: QuoteDetail | null;
}): JSX.Element {
  const options = useQuoteOptions();
  return (
    <QueryState query={options} loadingLabel="Cargando el portafolio y los impuestos">
      {(data) => <WizardForm target={props.target} quote={props.quote} options={data} />}
    </QueryState>
  );
}
