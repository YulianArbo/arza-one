'use client';

import {
  CHECK_RESULTS,
  formDataSchema,
  type FormDataMode,
  type FormDefinition,
  type FormField,
} from '@arza/contracts';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { checklistOf, FieldInput, tableOf } from './form-inputs';

// El formato completo, sección por sección (B20): para diligenciarlo o, ya enviado, para leerlo.
// La validación es la misma de la API, con los campos de la versión del formato del registro.

export type FormValues = Record<string, unknown>;

/** Problemas de los datos por nombre interno del campo; vacío si todo está bien. */
export function problemsOf(
  definition: FormDefinition,
  values: FormValues,
  mode: FormDataMode,
): Record<string, string> {
  const parsed = formDataSchema(definition, mode).safeParse(values);
  if (parsed.success) return {};
  const problems: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? '');
    problems[key] ??= issue.code === 'custom' ? issue.message : 'Revise este campo.';
  }
  return problems;
}

interface FormSheetProps {
  readonly definition: FormDefinition;
  readonly values: FormValues;
  readonly problems: Readonly<Record<string, string>>;
  readonly onChange: (values: FormValues) => void;
}

/** El formato para diligenciar. */
export function FormSheet({ definition, values, problems, onChange }: FormSheetProps): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {definition.sections.map((section) => (
        <section
          key={section.key}
          aria-labelledby={`seccion-${section.key}`}
          className="flex flex-col gap-4"
        >
          <h2 id={`seccion-${section.key}`} className="text-base font-semibold">
            {section.title}
          </h2>
          {section.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              id={`campo-${field.key}`}
              value={values[field.key]}
              error={problems[field.key]}
              onChange={(value) => {
                onChange({ ...values, [field.key]: value });
              }}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function plain(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'date' && typeof value === 'string') return formatDate(value);
  return typeof value === 'string' ? value : '—';
}

function ChecklistView({
  field,
  value,
}: {
  readonly field: FormField;
  readonly value: unknown;
}): JSX.Element {
  const answers = checklistOf(field, value);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{field.label}</caption>
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1">Punto</th>
          <th className="py-1">Resultado</th>
          <th className="py-1">Observación</th>
        </tr>
      </thead>
      <tbody>
        {field.items.map((item, index) => {
          const result = answers[index]?.result;
          return (
            <tr key={item} className="border-t border-border">
              <td className="py-1 pr-2">{item}</td>
              <td className="py-1 pr-2">
                {result === null || result === undefined ? '—' : CHECK_RESULTS[result]}
              </td>
              <td className="py-1">{answers[index]?.note === '' ? '—' : answers[index]?.note}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TableView({
  field,
  value,
}: {
  readonly field: FormField;
  readonly value: unknown;
}): JSX.Element {
  const rows = tableOf(value);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin filas.</p>;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{field.label}</caption>
      <thead>
        <tr className="text-left text-muted-foreground">
          {field.columns.map((column) => (
            <th key={column.key} className="py-1 pr-2">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${field.key}-${String(index)}`} className="border-t border-border">
            {field.columns.map((column) => (
              <td key={column.key} className="py-1 pr-2">
                {column.type === 'date' && row[column.key]
                  ? formatDate(row[column.key] ?? '')
                  : (row[column.key] ?? '') || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** El formato ya diligenciado, para leerlo. */
export function FormReadout({
  definition,
  values,
}: {
  readonly definition: FormDefinition;
  readonly values: FormValues;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {definition.sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{section.title}</h2>
          <dl className="flex flex-col gap-3">
            {section.fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{field.label}</dt>
                <dd className="text-sm font-medium">
                  {field.type === 'checklist' ? (
                    <ChecklistView field={field} value={values[field.key]} />
                  ) : field.type === 'table' ? (
                    <TableView field={field} value={values[field.key]} />
                  ) : (
                    <span className="whitespace-pre-line">{plain(field, values[field.key])}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
