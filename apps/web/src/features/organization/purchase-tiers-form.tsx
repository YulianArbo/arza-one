'use client';

import { purchaseTiersSchema, type PurchaseTiers } from '@arza/contracts';
import { DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { formatPesos } from '../crm/labels';
import { TextInput } from './record-dialog';
import { tomorrowInBogota, useSaveVersion } from './schedule-form';

// Topes de aprobación de compras (B33, decisión 2): hasta el tope bajo, hasta el tope medio y por
// encima. Cada tramo exige un número de cotizaciones; el tramo alto lo aprueba la Dirección. Como
// todo parámetro, el cambio es una vigencia nueva y la anterior queda en el historial.

const FIELDS: readonly {
  readonly key: keyof PurchaseTiers;
  readonly label: string;
  readonly money: boolean;
}[] = [
  { key: 'low_limit', label: 'Tope del tramo bajo, en pesos', money: true },
  { key: 'quotes_low', label: 'Cotizaciones del tramo bajo', money: false },
  { key: 'mid_limit', label: 'Tope del tramo medio, en pesos', money: true },
  { key: 'quotes_mid', label: 'Cotizaciones del tramo medio', money: false },
  { key: 'quotes_high', label: 'Cotizaciones del tramo alto', money: false },
];

function plural(count: number): string {
  return count === 1 ? '1 cotización' : `${String(count)} cotizaciones`;
}

/** «Hasta $ 1.000.000: 1 cotización · Hasta $ 10.000.000: 2 · Por encima: 3 y aprueba la Dirección.» */
export function describePurchaseTiers(tiers: PurchaseTiers): string {
  return [
    `Hasta ${formatPesos(tiers.low_limit)}: ${plural(tiers.quotes_low)}`,
    `Hasta ${formatPesos(tiers.mid_limit)}: ${plural(tiers.quotes_mid)}`,
    `Por encima: ${plural(tiers.quotes_high)} y aprueba la Dirección.`,
  ].join(' · ');
}

type Texts = Readonly<Record<keyof PurchaseTiers, string>>;

function textsOf(tiers: PurchaseTiers | null): Texts {
  return {
    low_limit: tiers?.low_limit ?? '1000000',
    mid_limit: tiers?.mid_limit ?? '10000000',
    quotes_low: String(tiers?.quotes_low ?? 1),
    quotes_mid: String(tiers?.quotes_mid ?? 2),
    quotes_high: String(tiers?.quotes_high ?? 3),
  };
}

function valueOf(texts: Texts): unknown {
  return {
    low_limit: texts.low_limit.trim().replace(',', '.'),
    mid_limit: texts.mid_limit.trim().replace(',', '.'),
    quotes_low: Number(texts.quotes_low),
    quotes_mid: Number(texts.quotes_mid),
    quotes_high: Number(texts.quotes_high),
  };
}

function usePurchaseTiersForm(
  parameterKey: string,
  initial: PurchaseTiers | null,
  onSaved: () => void,
) {
  const [texts, setTexts] = useState<Texts>(textsOf(initial));
  const [validFrom, setValidFrom] = useState(tomorrowInBogota());
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});
  const save = useSaveVersion(parameterKey, onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const valid = purchaseTiersSchema.safeParse(valueOf(texts));
    const found: Record<string, string> = {};
    if (!valid.success) {
      for (const issue of valid.error.issues) found[String(issue.path[0])] ??= issue.message;
    }
    setProblems(found);
    if (valid.success) save.execute({ value: valid.data, validFrom });
  };
  return { texts, setTexts, validFrom, setValidFrom, problems, save, submit };
}

function TierInputs(props: {
  readonly form: ReturnType<typeof usePurchaseTiersForm>;
}): JSX.Element {
  const { form } = props;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIELDS.map((field) => (
        <TextInput
          key={field.key}
          id={`tope-compras-${field.key}`}
          label={field.label}
          value={form.texts[field.key]}
          error={form.problems[field.key] ?? null}
          inputMode={field.money ? 'decimal' : 'numeric'}
          onValue={(value) => {
            form.setTexts({ ...form.texts, [field.key]: value });
          }}
        />
      ))}
    </div>
  );
}

export function PurchaseTiersForm(props: {
  readonly parameterKey: string;
  readonly initial: PurchaseTiers | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const form = usePurchaseTiersForm(props.parameterKey, props.initial, props.onSaved);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <TierInputs form={form} />
      <TextInput
        id="tope-compras-desde"
        label="Rige desde"
        type="date"
        hint="Hoy o más adelante. Por encima del tope medio aprueba la Dirección."
        value={form.validFrom}
        onValue={form.setValidFrom}
      />
      <DialogFooter>
        <SubmitButton
          label="Programar el cambio"
          pendingLabel="Guardando…"
          pending={form.save.pending}
        />
      </DialogFooter>
      {form.save.dialog}
    </form>
  );
}
