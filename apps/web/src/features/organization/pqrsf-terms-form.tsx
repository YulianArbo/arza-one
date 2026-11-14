'use client';

import { pqrsfTermsSchema, type PqrsfTerms } from '@arza/contracts';
import { DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { TextInput } from './record-dialog';
import { tomorrowInBogota, useSaveVersion } from './schedule-form';

// Plazos de respuesta de PQRSF en días hábiles (B29, decisión 2): por tipo según PR-SAC-002 y, si
// trata de datos personales, los de la Ley 1581. Como todo parámetro, el cambio es una vigencia
// nueva y la anterior queda en el historial; cada PQRSF conserva el plazo con que se radicó.

const TERMS: readonly { readonly key: keyof PqrsfTerms; readonly label: string }[] = [
  { key: 'petition', label: 'Petición' },
  { key: 'complaint', label: 'Queja' },
  { key: 'claim', label: 'Reclamo' },
  { key: 'suggestion', label: 'Sugerencia' },
  { key: 'compliment', label: 'Felicitación' },
  { key: 'privacy_inquiry', label: 'Consulta sobre datos personales' },
  { key: 'privacy_claim', label: 'Reclamo sobre datos personales' },
];

/** «Petición 15, Queja 15, … días hábiles.» */
export function describePqrsfTerms(terms: PqrsfTerms): string {
  return `${TERMS.map((term) => `${term.label}: ${String(terms[term.key])}`).join(' · ')} días hábiles.`;
}

type Texts = Readonly<Record<keyof PqrsfTerms, string>>;

function textsOf(terms: PqrsfTerms | null): Texts {
  const base = terms ?? {
    petition: 15,
    complaint: 15,
    claim: 15,
    suggestion: 30,
    compliment: 30,
    privacy_inquiry: 10,
    privacy_claim: 15,
  };
  return Object.fromEntries(TERMS.map((term) => [term.key, String(base[term.key])])) as Texts;
}

function usePqrsfTermsForm(parameterKey: string, initial: PqrsfTerms | null, onSaved: () => void) {
  const [texts, setTexts] = useState<Texts>(textsOf(initial));
  const [validFrom, setValidFrom] = useState(tomorrowInBogota());
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});
  const save = useSaveVersion(parameterKey, onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = Object.fromEntries(TERMS.map((term) => [term.key, Number(texts[term.key])]));
    const valid = pqrsfTermsSchema.safeParse(value);
    const found: Record<string, string> = {};
    if (!valid.success) {
      for (const issue of valid.error.issues) found[String(issue.path[0])] = issue.message;
    }
    setProblems(found);
    if (valid.success) save.execute({ value: valid.data, validFrom });
  };
  return { texts, setTexts, validFrom, setValidFrom, problems, save, submit };
}

function TermInputs(props: { readonly form: ReturnType<typeof usePqrsfTermsForm> }): JSX.Element {
  const { form } = props;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TERMS.map((term) => (
        <TextInput
          key={term.key}
          id={`plazo-${term.key}`}
          label={`${term.label} (días hábiles)`}
          value={form.texts[term.key]}
          error={form.problems[term.key] ?? null}
          inputMode="numeric"
          onValue={(value) => {
            form.setTexts({ ...form.texts, [term.key]: value });
          }}
        />
      ))}
    </div>
  );
}

export function PqrsfTermsForm(props: {
  readonly parameterKey: string;
  readonly initial: PqrsfTerms | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const form = usePqrsfTermsForm(props.parameterKey, props.initial, props.onSaved);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <TermInputs form={form} />
      <TextInput
        id="plazos-desde"
        label="Rige desde"
        type="date"
        hint="Hoy o más adelante. Las PQRSF ya radicadas conservan su plazo."
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
