'use client';

import { DEFAULT_LABOR_RULES, laborRulesSchema, type LaborRules } from '@arza/contracts';
import { DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { TextInput } from './record-dialog';
import { tomorrowInBogota, useSaveVersion } from './schedule-form';

// Reglas laborales de Talento humano (B36, decisiones 4, 5 y 8): jornada semanal, topes de horas
// extras, días de vacaciones por año y días hábiles mínimos entre la citación y los descargos.
// Como todo parámetro, el cambio es una vigencia nueva y la anterior queda en el historial.

const FIELDS: readonly { readonly key: keyof LaborRules; readonly label: string }[] = [
  { key: 'weekly_hours', label: 'Horas de la jornada semanal' },
  { key: 'overtime_daily_max', label: 'Tope de horas extras por día' },
  { key: 'overtime_weekly_max', label: 'Tope de horas extras por semana' },
  { key: 'vacation_days_per_year', label: 'Días hábiles de vacaciones por año' },
  { key: 'disciplinary_notice_days', label: 'Días hábiles entre citación y descargos' },
];

/** «Jornada de 40 h · horas extras hasta 2 al día y 12 a la semana · …». */
export function describeLaborRules(rules: LaborRules): string {
  return [
    `Jornada de ${String(rules.weekly_hours)} horas a la semana`,
    `horas extras hasta ${String(rules.overtime_daily_max)} al día y ${String(rules.overtime_weekly_max)} a la semana`,
    `${String(rules.vacation_days_per_year)} días hábiles de vacaciones por año`,
    `${String(rules.disciplinary_notice_days)} días hábiles entre citación y descargos.`,
  ].join(' · ');
}

type Texts = Readonly<Record<keyof LaborRules, string>>;

function textsOf(rules: LaborRules | null): Texts {
  const base = rules ?? DEFAULT_LABOR_RULES;
  return Object.fromEntries(FIELDS.map(({ key }) => [key, String(base[key])])) as Record<
    keyof LaborRules,
    string
  >;
}

function useLaborRulesForm(parameterKey: string, initial: LaborRules | null, onSaved: () => void) {
  const [texts, setTexts] = useState<Texts>(textsOf(initial));
  const [validFrom, setValidFrom] = useState(tomorrowInBogota());
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});
  const save = useSaveVersion(parameterKey, onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(texts[key])]));
    const valid = laborRulesSchema.safeParse(value);
    const found: Record<string, string> = {};
    if (!valid.success) {
      for (const issue of valid.error.issues) found[String(issue.path[0])] ??= issue.message;
    }
    setProblems(found);
    if (valid.success) save.execute({ value: valid.data, validFrom });
  };
  return { texts, setTexts, validFrom, setValidFrom, problems, save, submit };
}

function RuleInputs(props: { readonly form: ReturnType<typeof useLaborRulesForm> }): JSX.Element {
  const { form } = props;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIELDS.map((field) => (
        <TextInput
          key={field.key}
          id={`reglas-laborales-${field.key}`}
          label={field.label}
          value={form.texts[field.key]}
          error={form.problems[field.key] ?? null}
          inputMode="numeric"
          onValue={(value) => {
            form.setTexts({ ...form.texts, [field.key]: value });
          }}
        />
      ))}
    </div>
  );
}

export function LaborRulesForm(props: {
  readonly parameterKey: string;
  readonly initial: LaborRules | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const form = useLaborRulesForm(props.parameterKey, props.initial, props.onSaved);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <RuleInputs form={form} />
      <TextInput
        id="reglas-laborales-desde"
        label="Rige desde"
        type="date"
        hint="Hoy o más adelante. Valide los valores con Talento humano y el Reglamento Interno."
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
