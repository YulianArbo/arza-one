'use client';

import {
  classificationSchema,
  type CreateVersionRequest,
  type Document,
  type Version,
} from '@arza/contracts';
import { Alert, AlertDescription } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { documentPath } from './labels';
import { useDocument, useSaveVersion, useVersions } from './queries';
import { VersionFields, versionProblems, type VersionValues } from './version-fields';

// Versión nueva o corrección del borrador propio (B18). Una versión vigente no se modifica: los
// cambios van en una versión nueva, que se publica cuando la aprueba otra persona.

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

function bodyOf(values: VersionValues, sourceFileId: string): CreateVersionRequest {
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
    setErrors(found);
    if (Object.keys(found).length > 0 || values.source_file_id === null) return;
    const body = bodyOf(values, values.source_file_id);
    save.execute(
      draft === undefined
        ? { versionId: null, body }
        : { versionId: draft.id, version: draft.version, body },
    );
  };
  return { values, setValues, errors, save, onSource, submit };
}

function VersionFormBody(props: FormProps): JSX.Element {
  const { values, setValues, errors, save, onSource, submit } = useVersionForm(props);
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
