'use client';

import {
  CHECK_RESULTS,
  checklistAnswerSchema,
  type CheckResult,
  type FormField,
  type TableColumn,
} from '@arza/contracts';
import { FormField as TextField, Label, Radio, SelectField, Textarea } from '@arza/ui';
import type { JSX } from 'react';

import { CheckboxField } from '../organization/record-dialog';
import { SmallButton } from './small-button';

// Un campo de un formato digital para diligenciarlo (B20): texto, texto largo, número, fecha, sí o
// no, lista, verificación (Cumple, No cumple, No aplica y observación) y tabla con filas. Cada
// control tiene su etiqueta visible y su error asociado (numeral 16.6).

export type ChecklistValue = { result: CheckResult | null; note: string }[];

const checkResultSchema = checklistAnswerSchema.shape.result.unwrap();
export type TableValue = Record<string, string>[];

export interface FieldInputProps {
  readonly field: FormField;
  readonly id: string;
  readonly value: unknown;
  readonly error: string | undefined;
  readonly onChange: (value: unknown) => void;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function hintOf(field: FormField): string | undefined {
  const parts = [field.required ? 'Obligatorio.' : null, field.help].filter(Boolean);
  return parts.length === 0 ? undefined : parts.join(' ');
}

export function checklistOf(field: FormField, value: unknown): ChecklistValue {
  const answers = Array.isArray(value) ? (value as ChecklistValue) : [];
  return field.items.map((_, index) => answers[index] ?? { result: null, note: '' });
}

export function tableOf(value: unknown): TableValue {
  return Array.isArray(value) ? (value as TableValue) : [];
}

function LongText({ field, id, value, error, onChange }: FieldInputProps): JSX.Element {
  const hint = hintOf(field);
  const describedBy = [
    hint === undefined ? null : `${id}-ayuda`,
    error === undefined ? null : `${id}-error`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Textarea
        id={id}
        rows={4}
        maxLength={5000}
        value={textOf(value)}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {hint === undefined ? null : (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type Answer = ChecklistValue[number];

function ChecklistItem(props: {
  readonly item: string;
  readonly name: string;
  readonly answer: Answer | undefined;
  readonly onChange: (change: Partial<Answer>) => void;
}): JSX.Element {
  const { item, answer } = props;
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0">
      <p className="text-sm">{item}</p>
      <div role="radiogroup" aria-label={item} className="flex flex-wrap gap-4">
        {Object.entries(CHECK_RESULTS).map(([result, label]) => (
          <label key={result} className="flex items-center gap-2 text-sm">
            <Radio
              name={props.name}
              checked={answer?.result === result}
              onChange={() => {
                props.onChange({ result: checkResultSchema.parse(result) });
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <input
        aria-label={`Observación: ${item}`}
        maxLength={500}
        value={answer?.note ?? ''}
        onChange={(event) => {
          props.onChange({ note: event.target.value });
        }}
        className="h-9 rounded-md border border-input bg-card px-3 text-sm"
      />
    </div>
  );
}

function FieldError({ error }: { readonly error: string | undefined }): JSX.Element | null {
  if (error === undefined) return null;
  return <p className="text-xs font-medium text-destructive">{error}</p>;
}

function ChecklistInput({ field, id, value, error, onChange }: FieldInputProps): JSX.Element {
  const answers = checklistOf(field, value);
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">{field.label}</legend>
      {field.items.map((item, index) => (
        <ChecklistItem
          key={item}
          item={item}
          name={`${id}-${String(index)}`}
          answer={answers[index]}
          onChange={(change) => {
            onChange(answers.map((a, at) => (at === index ? { ...a, ...change } : a)));
          }}
        />
      ))}
      <FieldError error={error} />
    </fieldset>
  );
}

function TableRowInputs(props: {
  readonly columns: readonly TableColumn[];
  readonly row: Record<string, string>;
  readonly number: string;
  readonly onCell: (key: string, cell: string) => void;
  readonly onRemove: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {props.columns.map((column) => (
        <input
          key={column.key}
          type={column.type === 'date' ? 'date' : 'text'}
          inputMode={column.type === 'number' ? 'decimal' : undefined}
          aria-label={`${column.label}, fila ${props.number}`}
          placeholder={column.label}
          maxLength={500}
          value={props.row[column.key] ?? ''}
          onChange={(event) => {
            props.onCell(column.key, event.target.value);
          }}
          className="h-9 min-w-40 flex-1 rounded-md border border-input bg-card px-3 text-sm"
        />
      ))}
      <SmallButton label={`Quitar fila ${props.number}`} onClick={props.onRemove} />
    </div>
  );
}

function TableInput({ field, id, value, error, onChange }: FieldInputProps): JSX.Element {
  const rows = tableOf(value);
  const empty = Object.fromEntries(field.columns.map((column) => [column.key, '']));
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">{field.label}</legend>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin filas todavía.</p>
      ) : null}
      {rows.map((row, index) => (
        <TableRowInputs
          key={`${id}-${String(index)}`}
          columns={field.columns}
          row={row}
          number={String(index + 1)}
          onCell={(key, cell) => {
            onChange(rows.map((r, at) => (at === index ? { ...r, [key]: cell } : r)));
          }}
          onRemove={() => {
            onChange(rows.filter((_, at) => at !== index));
          }}
        />
      ))}
      <div>
        <SmallButton
          label={`Agregar fila a «${field.label}»`}
          onClick={() => {
            onChange([...rows, empty]);
          }}
        />
      </div>
      <FieldError error={error} />
    </fieldset>
  );
}

function SimpleInput({ field, id, value, error, onChange }: FieldInputProps): JSX.Element {
  const hint = hintOf(field);
  if (field.type === 'select') {
    const options = [
      { value: '', label: 'Elija una opción' },
      ...field.options.map((o) => ({ value: o, label: o })),
    ];
    return (
      <SelectField
        id={id}
        label={field.label}
        hint={hint}
        error={error}
        value={textOf(value)}
        options={options}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    );
  }
  return (
    <TextField
      id={id}
      label={field.label}
      {...(hint === undefined ? {} : { hint })}
      error={error ?? null}
      type={field.type === 'date' ? 'date' : 'text'}
      {...(field.type === 'number' ? { inputMode: 'decimal' as const } : {})}
      {...(field.type === 'text' ? { maxLength: 500 } : {})}
      value={textOf(value)}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

export function FieldInput(props: FieldInputProps): JSX.Element {
  const { field } = props;
  if (field.type === 'textarea') return <LongText {...props} />;
  if (field.type === 'checklist') return <ChecklistInput {...props} />;
  if (field.type === 'table') return <TableInput {...props} />;
  if (field.type === 'boolean') {
    const hint = hintOf(field);
    return (
      <CheckboxField
        id={props.id}
        label={field.label}
        checked={props.value === true}
        {...(hint === undefined ? {} : { hint })}
        onChange={props.onChange}
      />
    );
  }
  return <SimpleInput {...props} />;
}
