'use client';

import { discountCapSchema, type DiscountCap } from '@arza/contracts';
import { DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { TextInput } from './record-dialog';
import { tomorrowInBogota, useSaveVersion } from './schedule-form';

// Tope de descuento sin aprobación (B23, ficha 17.6): el mayor descuento por ítem que una
// cotización lleva sin la aprobación de la Dirección. Como todo parámetro, el cambio es una
// vigencia nueva y la anterior queda en el historial.

function useDiscountCapForm(
  parameterKey: string,
  initial: DiscountCap | null,
  onSaved: () => void,
) {
  const [percent, setPercent] = useState(initial?.percent ?? '10');
  const [validFrom, setValidFrom] = useState(tomorrowInBogota());
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveVersion(parameterKey, onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = { percent: percent.trim().replace(',', '.') };
    const valid = discountCapSchema.safeParse(value);
    setProblem(valid.success ? null : (valid.error.issues[0]?.message ?? 'Revise el porcentaje.'));
    if (valid.success) save.execute({ value, validFrom });
  };
  return { percent, setPercent, validFrom, setValidFrom, problem, save, submit };
}

export function DiscountCapForm(props: {
  readonly parameterKey: string;
  readonly initial: DiscountCap | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const form = useDiscountCapForm(props.parameterKey, props.initial, props.onSaved);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <TextInput
        id="tope-descuento"
        label="Tope de descuento por ítem, en %"
        value={form.percent}
        error={form.problem}
        inputMode="decimal"
        onValue={form.setPercent}
      />
      <TextInput
        id="tope-desde"
        label="Rige desde"
        type="date"
        hint="Hoy o más adelante; después del último cambio programado."
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
