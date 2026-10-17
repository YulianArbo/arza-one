'use client';

import {
  classificationSchema,
  processProblem,
  type ChangeRequest,
  type CreateDocumentRequest,
} from '@arza/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { SelectField } from '../administration/select-field';
import { useCatalog, useOrgUnits } from '../organization/queries';
import { CheckboxField, idOrNull, optionsOf } from '../organization/record-dialog';
import { documentPath } from './labels';
import { useCreateDocument, useFolders } from './queries';
import { RequestSelect } from './request-select';
import {
  EMPTY_VERSION,
  VersionFields,
  versionProblems,
  type VersionValues,
} from './version-fields';

// Documento nuevo (B18): nace con su versión 00 en borrador. El código lo pone el sistema al
// guardar: TIPO-PROCESO-NNN en el SGC, sin saltos (PR-SGC-001). Desde B19 un documento del SGC se
// crea con una Solicitud de Acción Documental de creación aprobada para ese tipo y proceso.

interface DocumentValues extends VersionValues {
  readonly folder_id: string;
  readonly doc_type: string;
  readonly is_controlled: boolean;
  readonly process_id: string | null;
  readonly change_request_id: string | null;
}

interface FieldsProps {
  readonly values: DocumentValues;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (values: DocumentValues) => void;
}

function problemsOf(values: DocumentValues): Record<string, string> {
  const errors = versionProblems(values);
  if (values.folder_id === '') errors['folder_id'] = 'Elija la carpeta del documento.';
  if (values.doc_type === '') errors['doc_type'] = 'Elija el tipo de documento.';
  const process = values.is_controlled ? processProblem(values.doc_type, values.process_id) : null;
  if (process !== null) errors['process_id'] = process;
  if (values.is_controlled && values.change_request_id === null) {
    errors['change_request_id'] = 'Elija la solicitud de creación aprobada.';
  }
  return errors;
}

function requestOf(values: DocumentValues, sourceFileId: string): CreateDocumentRequest {
  return {
    folder_id: values.folder_id,
    doc_type: values.doc_type,
    is_controlled: values.is_controlled,
    process_id: values.process_id,
    change_request_id: values.is_controlled ? values.change_request_id : null,
    title: values.title.trim(),
    classification: classificationSchema.parse(values.classification),
    owner_position_id: values.owner_position_id,
    source_file_id: sourceFileId,
    change_summary: values.change_summary.trim(),
  };
}

/** Carpeta y tipo de documento (catálogo «Tipos de documento»). */
function PlacementFields({ values, errors, onChange }: FieldsProps): JSX.Element {
  const folders = useFolders().data?.data ?? [];
  const types = (useCatalog('document_types').data?.items ?? []).filter((item) => item.is_active);
  return (
    <>
      <SelectField
        id="documento-carpeta"
        label="Carpeta"
        value={values.folder_id}
        error={errors['folder_id']}
        options={optionsOf(
          folders.map((f) => ({ id: f.id, label: f.name })),
          'Elija una carpeta',
        )}
        onChange={(event) => {
          onChange({ ...values, folder_id: event.target.value });
        }}
      />
      <SelectField
        id="documento-tipo"
        label="Tipo de documento"
        value={values.doc_type}
        error={errors['doc_type']}
        options={[
          { value: '', label: 'Elija un tipo' },
          ...types.map((item) => ({ value: item.code, label: `${item.code} · ${item.label}` })),
        ]}
        onChange={(event) => {
          onChange({ ...values, doc_type: event.target.value });
        }}
      />
    </>
  );
}

/** Si es del SGC (con el código de PR-SGC-001) y el proceso al que pertenece. */
function ControlFields({ values, errors, onChange }: FieldsProps): JSX.Element {
  const processes = (useOrgUnits().data?.data ?? []).filter(
    (unit) => unit.kind === 'process' && unit.is_active,
  );
  return (
    <>
      <CheckboxField
        id="documento-sgc"
        label="Documento controlado del SGC"
        hint="Lleva el código de PR-SGC-001 (por ejemplo PR-SGC-001). Desmárquelo para un soporte de expediente."
        checked={values.is_controlled}
        onChange={(is_controlled) => {
          onChange({ ...values, is_controlled });
        }}
      />
      <SelectField
        id="documento-proceso"
        label="Proceso"
        value={values.process_id ?? ''}
        error={errors['process_id']}
        options={optionsOf(
          processes.map((unit) => ({ id: unit.id, label: `${unit.code} · ${unit.name}` })),
          values.is_controlled ? 'Elija un proceso' : 'Sin proceso',
        )}
        onChange={(event) => {
          onChange({ ...values, process_id: idOrNull(event.target.value) });
        }}
      />
    </>
  );
}

/** La solicitud de creación aprobada para este tipo y proceso (B19); solo en el SGC. */
function CreationRequest({ values, errors, onChange }: FieldsProps): JSX.Element | null {
  if (!values.is_controlled) return null;
  return (
    <RequestSelect
      id="documento-solicitud"
      action="create"
      documentId={null}
      matches={(request: ChangeRequest) =>
        request.doc_type === values.doc_type && (request.process?.id ?? null) === values.process_id
      }
      value={values.change_request_id}
      error={errors['change_request_id']}
      onChange={(change_request_id) => {
        onChange({ ...values, change_request_id });
      }}
    />
  );
}

/** Valores, problemas y guardado; al guardar abre la ficha del documento. */
function useDocumentForm(folderId: string | null) {
  const router = useRouter();
  const [values, setValues] = useState<DocumentValues>({
    ...EMPTY_VERSION,
    folder_id: folderId ?? '',
    doc_type: '',
    is_controlled: true,
    process_id: null,
    change_request_id: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useCreateDocument((id) => {
    router.push(documentPath(id));
  });
  const onSource = useCallback((source_file_id: string | null) => {
    setValues((previous) => ({ ...previous, source_file_id }));
  }, []);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setErrors(found);
    if (Object.keys(found).length > 0 || values.source_file_id === null) return;
    save.execute(requestOf(values, values.source_file_id));
  };
  return { values, setValues, errors, save, onSource, submit };
}

export function DocumentForm({ folderId }: { readonly folderId: string | null }): JSX.Element {
  const { values, setValues, errors, save, onSource, submit } = useDocumentForm(folderId);
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex max-w-2xl flex-col gap-4"
      aria-label="Nuevo documento"
    >
      {save.error === null ? null : <FormError error={save.error} />}
      <PlacementFields values={values} errors={errors} onChange={setValues} />
      <ControlFields values={values} errors={errors} onChange={setValues} />
      <CreationRequest values={values} errors={errors} onChange={setValues} />
      <VersionFields
        prefix="documento"
        values={values}
        errors={errors}
        current={null}
        onChange={(version) => {
          setValues({ ...values, ...version });
        }}
        onSource={onSource}
      />
      <SubmitButton label="Crear documento" pendingLabel="Creando…" pending={save.pending} />
      {save.dialog}
    </form>
  );
}
