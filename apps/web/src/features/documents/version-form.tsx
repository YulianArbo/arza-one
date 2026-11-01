'use client';

import {
  classificationSchema,
  type UpdateVersionRequest,
  type Document,
  type Version,
} from '@arza/contracts';
import { Alert, AlertDescription } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { FormSummary } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { documentPath } from './labels';
import { useDocument, useSaveVersion, useVersions } from './queries';
import { RequestSelect } from './request-select';
import {
  VersionFields,
  versionProblems,
  versionSummaryFields,
  type VersionValues,
} from './version-fields';

const SUMMARY_FIELDS = [
  {
    field: 'change_request_id',
    id: 'version-solicitud',
    label: 'Solicitud de Acción Documental aprobada',
  },
  ...versionSummaryFields('version'),
];

// Versión nueva o corrección del borrador propio (B18). Una versión vigente no se modifica: los
// cambios van en una versión nueva, que se publica cuando la aprueba otra persona. Desde B19 la
// versión nueva de un documento del SGC lleva su Solicitud de Acción Documental aprobada.

function initialValues(document: Document, draft: Version | undefined): VersionValues {
  return {
    title: draft?.title ?? document.title,
    classification: draft?.classification ?? document.classification,
    owner_position_id: draft?.owner_position?.id ?? document.owner_position?.id ?? null,
    source_file_id: draft?.source_file?.id ?? null,
    change_summary: draft?.change_summary ?? '',
  };
}

interface FormProps {
  readonly document: Document;
  readonly draft: Version | undefined;
}

/** Lo que se guarda; corregir el borrador no cambia su solicitud, así que no la lleva. */
function bodyOf(values: VersionValues, sourceFileId: string): UpdateVersionRequest {
  return {
    title: values.title.trim(),
    classification: classificationSchema.parse(values.classification),
    owner_position_id: values.owner_position_id,
    source_file_id: sourceFileId,
    change_summary: values.change_summary.trim(),
  };
}

/** Valores, problemas y guardado; sin archivo nuevo se conserva el del borrador. */
function useVersionForm({ document, draft }: FormProps) {
  const router = useRouter();
  const [values, setValues] = useState(() => initialValues(document, draft));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [requestId, setRequestId] = useState<string | null>(null);
  const needsRequest = draft === undefined && document.is_controlled;
  const save = useSaveVersion(document.id, () => {
    router.push(documentPath(document.id));
  });
  const original = draft?.source_file?.id ?? null;
  const onSource = useCallback(
    (fileId: string | null) => {
      setValues((previous) => ({ ...previous, source_file_id: fileId ?? original }));
    },
    [original],
  );
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = versionProblems(values);
    if (needsRequest && requestId === null) {
      found['change_request_id'] = 'Elija la solicitud de modificación aprobada.';
    }
    setErrors(found);
    if (Object.keys(found).length > 0 || values.source_file_id === null) return;
    const body = bodyOf(values, values.source_file_id);
    save.execute(
      draft === undefined
        ? { versionId: null, body: { ...body, change_request_id: requestId } }
        : { versionId: draft.id, version: draft.version, body },
    );
  };
  const request = { needed: needsRequest, value: requestId, onChange: setRequestId };
  return { values, setValues, errors, save, onSource, submit, request };
}

function VersionFormBody(props: FormProps): JSX.Element {
  const { values, setValues, errors, save, onSource, submit, request } = useVersionForm(props);
  const source = props.draft?.source_file ?? null;
  const current = source === null ? null : { id: source.id, fileName: source.file_name };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex max-w-2xl flex-col gap-4"
      aria-label="Versión del documento"
    >
      {save.error === null ? null : <FormError error={save.error} />}
      <FormSummary problems={errors} fields={SUMMARY_FIELDS} />
      {request.needed ? (
        <RequestSelect
          id="version-solicitud"
          action="update"
          documentId={props.document.id}
          value={request.value}
          error={errors['change_request_id']}
          onChange={request.onChange}
        />
      ) : null}
      <VersionFields
        prefix="version"
        values={values}
        errors={errors}
        current={current}
        onChange={setValues}
        onSource={onSource}
      />
      <SubmitButton
        label={props.draft === undefined ? 'Crear versión' : 'Guardar borrador'}
        pendingLabel="Guardando…"
        pending={save.pending}
      />
      {save.dialog}
    </form>
  );
}

function VersionPage({ document }: { readonly document: Document }): JSX.Element {
  const versions = useVersions(document.id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Versión de ${document.code}`}
        description="La versión vigente sigue rigiendo hasta que esta se apruebe y se publique."
      />
      <QueryState query={versions} loadingLabel="Cargando las versiones">
        {(data) => {
          const draft = data.data.find((version) => version.actions.includes('edit'));
          if (draft === undefined && document.open_version !== null) {
            return (
              <Alert>
                <AlertDescription>
                  Este documento ya tiene una versión en trámite. Termínela antes de crear otra.
                </AlertDescription>
              </Alert>
            );
          }
          return <VersionFormBody document={document} draft={draft} />;
        }}
      </QueryState>
    </div>
  );
}

export function VersionForm({ id }: { readonly id: string }): JSX.Element {
  const document = useDocument(id);
  return (
    <QueryState query={document} loadingLabel="Cargando el documento">
      {(data) => <VersionPage document={data} />}
    </QueryState>
  );
}
