'use client';

import { SelectField } from '@arza/ui';
import {
  CHANGE_REQUEST_ACTIONS,
  changeRequestActionSchema,
  processProblem,
  type ChangeRequestAction,
  type CreateChangeRequest,
} from '@arza/contracts';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useCatalog, useOrgUnits } from '../organization/queries';
import { TextInput, idOrNull, optionsOf } from '../organization/record-dialog';
import { CommentField } from '../workflows/workflow-actions';
import { requestPath } from './labels';
import { useCreateChangeRequest, useMasterList } from './sgc-queries';

// Radicar una Solicitud de Acción Documental (B19, FT-SGC-001): crear un documento del SGC (con su
// tipo, proceso y nombre) o modificar o eliminar uno vigente, con la justificación.

interface RequestValues {
  readonly action: ChangeRequestAction;
  readonly document_id: string | null;
  readonly doc_type: string;
  readonly process_id: string | null;
  readonly title: string;
  readonly justification: string;
}

interface FieldsProps {
  readonly values: RequestValues;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (values: RequestValues) => void;
}

const SUMMARY_FIELDS = [
  { field: 'doc_type', id: 'solicitud-tipo', label: 'Tipo de documento' },
  { field: 'process_id', id: 'solicitud-proceso', label: 'Proceso' },
  { field: 'title', id: 'solicitud-nombre', label: 'Nombre del documento' },
  { field: 'document_id', id: 'solicitud-documento', label: 'Documento vigente' },
  { field: 'justification', id: 'solicitud-justificacion', label: 'Justificación' },
];

const ACTION_OPTIONS = Object.entries(CHANGE_REQUEST_ACTIONS).map(([value, label]) => ({
  value,
  label,
}));

function problemsOf(values: RequestValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.action === 'create') {
    if (values.doc_type === '') errors['doc_type'] = 'Elija el tipo de documento.';
    const process =
      values.doc_type === '' ? null : processProblem(values.doc_type, values.process_id);
    if (process !== null) errors['process_id'] = process;
    if (values.title.trim().length < 3) errors['title'] = 'Escriba el nombre del documento.';
  } else if (values.document_id === null) {
    errors['document_id'] = 'Elija el documento.';
  }
  const length = values.justification.trim().length;
  if (length < 10 || length > 2000) {
    errors['justification'] = 'Explique por qué (10 a 2000 caracteres).';
  }
  return errors;
}

function requestOf(values: RequestValues): CreateChangeRequest {
  const creates = values.action === 'create';
  return {
    action: values.action,
    document_id: creates ? null : values.document_id,
    doc_type: creates ? values.doc_type : null,
    process_id: creates ? values.process_id : null,
    title: creates ? values.title.trim() : null,
    justification: values.justification.trim(),
  };
}

/** Tipo y proceso del documento nuevo (el RIT no lleva proceso). */
function TypeAndProcess({ values, errors, onChange }: FieldsProps): JSX.Element {
  const types = (useCatalog('document_types').data?.items ?? []).filter((item) => item.is_active);
  const processes = (useOrgUnits().data?.data ?? []).filter(
    (unit) => unit.kind === 'process' && unit.is_active,
  );
  return (
    <>
      <SelectField
        id="solicitud-tipo"
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
      <SelectField
        id="solicitud-proceso"
        label="Proceso"
        hint="El Reglamento Interno de Trabajo (RIT) no lleva proceso."
        value={values.process_id ?? ''}
        error={errors['process_id']}
        options={optionsOf(
          processes.map((unit) => ({ id: unit.id, label: `${unit.code} · ${unit.name}` })),
          'Sin proceso',
        )}
        onChange={(event) => {
          onChange({ ...values, process_id: idOrNull(event.target.value) });
        }}
      />
    </>
  );
}

/** Lo que se pide crear: tipo, proceso y nombre. */
function NewDocumentFields(props: FieldsProps): JSX.Element {
  const { values, errors, onChange } = props;
  return (
    <>
      <TypeAndProcess {...props} />
      <TextInput
        id="solicitud-nombre"
        label="Nombre del documento"
        value={values.title}
        maxLength={200}
        error={errors['title'] ?? null}
        onValue={(title) => {
          onChange({ ...values, title });
        }}
      />
    </>
  );
}

/** El documento vigente del SGC que se modifica o se elimina. */
function DocumentField({ values, errors, onChange }: FieldsProps): JSX.Element {
  const documents = useMasterList({ status: 'current' }).data?.data ?? [];
  return (
    <SelectField
      id="solicitud-documento"
      label="Documento vigente"
      value={values.document_id ?? ''}
      error={errors['document_id']}
      options={optionsOf(
        documents.map((entry) => ({
          id: entry.document_id,
          label: `${entry.code} · ${entry.title}`,
        })),
        'Elija el documento',
      )}
      onChange={(event) => {
        onChange({ ...values, document_id: idOrNull(event.target.value) });
      }}
    />
  );
}

function Justification({ values, errors, onChange }: FieldsProps): JSX.Element {
  return (
    <CommentField
      id="solicitud-justificacion"
      label="Justificación"
      hint={errors['justification'] ?? 'Por qué se necesita el cambio. Lo lee quien la decide.'}
      value={values.justification}
      onChange={(justification) => {
        onChange({ ...values, justification });
      }}
    />
  );
}

function useRequestForm(initial: Pick<RequestValues, 'action' | 'document_id'>) {
  const router = useRouter();
  const [values, setValues] = useState<RequestValues>({
    ...initial,
    doc_type: '',
    process_id: null,
    title: '',
    justification: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useCreateChangeRequest((id) => {
    router.push(requestPath(id));
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setErrors(found);
    if (Object.keys(found).length === 0) save.execute(requestOf(values));
  };
  return { values, setValues, errors, save, submit };
}

export function ChangeRequestForm(props: {
  readonly documentId: string | null;
  readonly action: string | null;
}): JSX.Element {
  const parsed = changeRequestActionSchema.safeParse(props.action);
  const action = parsed.success ? parsed.data : 'create';
  const { values, setValues, errors, save, submit } = useRequestForm({
    action,
    document_id: props.documentId,
  });
  const fields = { values, errors, onChange: setValues };
  const Target = values.action === 'create' ? NewDocumentFields : DocumentField;
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex max-w-2xl flex-col gap-4"
      aria-label="Nueva solicitud de acción documental"
    >
      {save.error === null ? null : <FormError error={save.error} />}
      <FormSummary problems={errors} fields={SUMMARY_FIELDS} />
      <SelectField
        id="solicitud-accion"
        label="Qué pide"
        value={values.action}
        options={ACTION_OPTIONS}
        onChange={(event) => {
          const chosen = changeRequestActionSchema.safeParse(event.target.value);
          if (chosen.success) setValues({ ...values, action: chosen.data });
        }}
      />
      <Target {...fields} />
      <Justification {...fields} />
      <SubmitButton label="Radicar" pendingLabel="Radicando…" pending={save.pending} />
      {save.dialog}
    </form>
  );
}
