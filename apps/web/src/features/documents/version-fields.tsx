'use client';

import { Label, SelectField, Textarea } from '@arza/ui';
import type { JSX } from 'react';

import { usePositions } from '../organization/queries';
import { TextInput, idOrNull, optionsOf } from '../organization/record-dialog';
import { CLASSIFICATION_OPTIONS, classificationHint } from './labels';
import { SourceUpload } from './source-upload';

// Campos de una versión (B18): los datos que el documento toma al publicarla y su archivo fuente.

export interface VersionValues {
  readonly title: string;
  readonly classification: string;
  readonly owner_position_id: string | null;
  readonly source_file_id: string | null;
  readonly change_summary: string;
}

export const EMPTY_VERSION: VersionValues = {
  title: '',
  classification: 'internal',
  owner_position_id: null,
  source_file_id: null,
  change_summary: '',
};

/** Problemas de los campos, en español, antes de enviar. */
export function versionProblems(values: VersionValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = values.title.trim().length;
  if (title < 3 || title > 200) errors['title'] = 'Escriba un título de 3 a 200 caracteres.';
  if (values.source_file_id === null) {
    errors['source_file_id'] = 'Suba el archivo y espere a que el antivirus lo deje disponible.';
  }
  const summary = values.change_summary.trim().length;
  if (summary < 3 || summary > 1000) {
    errors['change_summary'] = 'Cuente en pocas palabras qué cambia (3 a 1000 caracteres).';
  }
  return errors;
}

interface VersionFieldsProps {
  readonly prefix: string;
  readonly values: VersionValues;
  readonly errors: Readonly<Record<string, string>>;
  readonly current: { readonly id: string; readonly fileName: string } | null;
  readonly onChange: (values: VersionValues) => void;
  readonly onSource: (fileId: string | null) => void;
}

function SummaryField(props: {
  readonly id: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const errorId = props.error === undefined ? undefined : `${props.id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>Qué cambia en esta versión</Label>
      <Textarea
        id={props.id}
        rows={3}
        maxLength={1000}
        value={props.value}
        aria-invalid={props.error === undefined ? undefined : true}
        aria-describedby={errorId}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
      {props.error === undefined ? null : (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {props.error}
        </p>
      )}
    </div>
  );
}

type DataProps = Pick<VersionFieldsProps, 'prefix' | 'values' | 'errors' | 'onChange'>;

/** Título, clasificación y cargo responsable que el documento toma al publicar la versión. */
function DataFields({ prefix, values, errors, onChange }: DataProps): JSX.Element {
  const positions = (usePositions().data?.data ?? []).filter((position) => position.is_active);
  return (
    <>
      <TextInput
        id={`${prefix}-titulo`}
        label="Título"
        value={values.title}
        maxLength={200}
        error={errors['title'] ?? null}
        onValue={(title) => {
          onChange({ ...values, title });
        }}
      />
      <SelectField
        id={`${prefix}-clasificacion`}
        label="Clasificación"
        hint={classificationHint(values.classification)}
        value={values.classification}
        options={CLASSIFICATION_OPTIONS}
        onChange={(event) => {
          onChange({ ...values, classification: event.target.value });
        }}
      />
      <SelectField
        id={`${prefix}-responsable`}
        label="Cargo responsable"
        value={values.owner_position_id ?? ''}
        options={optionsOf(
          positions.map((position) => ({ id: position.id, label: position.name })),
          'Sin cargo responsable',
        )}
        onChange={(event) => {
          onChange({ ...values, owner_position_id: idOrNull(event.target.value) });
        }}
      />
    </>
  );
}

export function VersionFields(props: VersionFieldsProps): JSX.Element {
  const { prefix, values, errors, onChange } = props;
  return (
    <>
      <DataFields prefix={prefix} values={values} errors={errors} onChange={onChange} />
      <SourceUpload
        current={props.current}
        onChange={props.onSource}
        error={errors['source_file_id']}
      />
      <SummaryField
        id={`${prefix}-cambios`}
        value={values.change_summary}
        error={errors['change_summary']}
        onChange={(change_summary) => {
          onChange({ ...values, change_summary });
        }}
      />
    </>
  );
}
