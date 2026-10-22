'use client';

import {
  FORM_FIELD_TYPES,
  formFieldTypeSchema,
  TABLE_COLUMN_TYPES,
  tableColumnSchema,
} from '@arza/contracts';
import { Input, Label, Select, SelectField, Textarea } from '@arza/ui';
import type { JSX } from 'react';

import { CheckboxField, TextInput } from '../organization/record-dialog';
import type { DesignColumn, DesignField } from './design-model';
import { SmallButton } from './small-button';

// Un campo en el diseñador de formatos (B20): etiqueta, tipo, obligatorio, ayuda y, según el
// tipo, sus opciones, sus puntos de verificación o las columnas de su tabla.

const TYPE_OPTIONS = Object.entries(FORM_FIELD_TYPES).map(([value, label]) => ({ value, label }));
const COLUMN_OPTIONS = Object.entries(TABLE_COLUMN_TYPES).map(([value, label]) => ({
  value,
  label,
}));

interface FieldEditorProps {
  readonly field: DesignField;
  readonly position: string;
  readonly onChange: (field: DesignField) => void;
  readonly onLabel: (label: string) => void;
  readonly onMove: (offset: -1 | 1) => void;
  readonly onRemove: () => void;
}

function ColumnRow(props: {
  readonly column: DesignColumn;
  readonly number: string;
  readonly onChange: (change: Partial<DesignColumn>) => void;
  readonly onRemove: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        aria-label={`Nombre de la columna ${props.number}`}
        value={props.column.label}
        maxLength={80}
        onChange={(event) => {
          props.onChange({ label: event.target.value });
        }}
        className="min-w-40 flex-1"
      />
      <Select
        aria-label={`Tipo de la columna ${props.number}`}
        value={props.column.type}
        onChange={(event) => {
          props.onChange({ type: tableColumnSchema.shape.type.parse(event.target.value) });
        }}
        className="w-auto"
      >
        {COLUMN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <SmallButton label={`Quitar columna ${props.number}`} onClick={props.onRemove} />
    </div>
  );
}

function ColumnsEditor(props: {
  readonly id: string;
  readonly columns: readonly DesignColumn[];
  readonly onChange: (columns: DesignColumn[]) => void;
}): JSX.Element {
  const { columns, onChange } = props;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Columnas de la tabla</legend>
      {columns.map((column, index) => (
        <ColumnRow
          key={`${props.id}-${String(index)}`}
          column={column}
          number={String(index + 1)}
          onChange={(change) => {
            onChange(columns.map((c, at) => (at === index ? { ...c, ...change } : c)));
          }}
          onRemove={() => {
            onChange(columns.filter((_, at) => at !== index));
          }}
        />
      ))}
      <div>
        <SmallButton
          label="Agregar columna"
          onClick={() => {
            onChange([...columns, { label: '', type: 'text' }]);
          }}
        />
      </div>
    </fieldset>
  );
}

function LinesEditor(props: {
  readonly field: DesignField;
  readonly id: string;
  readonly onChange: (lines: string) => void;
}): JSX.Element {
  const checklist = props.field.type === 'checklist';
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>{checklist ? 'Puntos de verificación' : 'Opciones'}</Label>
      <Textarea
        id={props.id}
        rows={4}
        value={props.field.lines}
        aria-describedby={`${props.id}-ayuda`}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
      <p id={`${props.id}-ayuda`} className="text-xs text-muted-foreground">
        {checklist
          ? 'Uno por línea. Cada punto se responde Cumple, No cumple o No aplica, con su observación.'
          : 'Una por línea; al menos dos.'}
      </p>
    </div>
  );
}

function Extras({
  field,
  onChange,
}: Pick<FieldEditorProps, 'field' | 'onChange'>): JSX.Element | null {
  const id = `campo-${field.uid}`;
  if (field.type === 'select' || field.type === 'checklist') {
    const change = (lines: string) => {
      onChange({ ...field, lines });
    };
    return <LinesEditor field={field} id={`${id}-lineas`} onChange={change} />;
  }
  if (field.type !== 'table') return null;
  const change = (columns: DesignColumn[]) => {
    onChange({ ...field, columns });
  };
  return <ColumnsEditor id={id} columns={field.columns} onChange={change} />;
}

function Basics({ field, position, onChange, onLabel }: FieldEditorProps): JSX.Element {
  const id = `campo-${field.uid}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextInput
        id={`${id}-etiqueta`}
        label={`Campo ${position}`}
        hint={`Nombre interno: ${field.key}`}
        value={field.label}
        maxLength={120}
        onValue={onLabel}
      />
      <SelectField
        id={`${id}-tipo`}
        label="Tipo"
        value={field.type}
        options={TYPE_OPTIONS}
        onChange={(event) => {
          onChange({ ...field, type: formFieldTypeSchema.parse(event.target.value) });
        }}
      />
    </div>
  );
}

function MoveButtons(props: FieldEditorProps): JSX.Element {
  const { position } = props;
  return (
    <div className="flex flex-wrap gap-2">
      <SmallButton
        label={`Subir campo ${position}`}
        onClick={() => {
          props.onMove(-1);
        }}
      />
      <SmallButton
        label={`Bajar campo ${position}`}
        onClick={() => {
          props.onMove(1);
        }}
      />
      <SmallButton label={`Quitar campo ${position}`} onClick={props.onRemove} />
    </div>
  );
}

export function FieldEditor(props: FieldEditorProps): JSX.Element {
  const { field, onChange } = props;
  const id = `campo-${field.uid}`;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <Basics {...props} />
      <TextInput
        id={`${id}-ayuda-texto`}
        label="Ayuda (opcional)"
        value={field.help}
        maxLength={300}
        onValue={(help) => {
          onChange({ ...field, help });
        }}
      />
      <CheckboxField
        id={`${id}-obligatorio`}
        label="Obligatorio"
        checked={field.required}
        onChange={(required) => {
          onChange({ ...field, required });
        }}
      />
      <Extras field={field} onChange={onChange} />
      <MoveButtons {...props} />
    </div>
  );
}
