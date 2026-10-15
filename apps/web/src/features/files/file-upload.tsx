'use client';

import { FILE_ERROR_CODES } from '@arza/contracts';
import { Label } from '@arza/ui';
import { useId, useState, type JSX, type SubmitEvent } from 'react';

import { ApiError } from '../../lib/api/api-error';
import { FormError, FormSuccess } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { ACCEPT, ALLOWED_HINT, formatSize, uploadProblem } from './labels';
import { useUploadFile } from './queries';

const RECEIVED =
  'Recibido. El archivo queda «En análisis» mientras el antivirus lo revisa; la lista se actualiza sola.';

/** Selector nativo: se elige con el botón o se arrastra el archivo encima. */
function FilePicker(props: {
  readonly file: File | null;
  readonly onChoose: (file: File | undefined) => void;
}): JSX.Element {
  const inputId = useId();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-6">
      <Label htmlFor={inputId}>Elija un archivo o arrástrelo aquí</Label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        aria-describedby={`${inputId}-ayuda`}
        onChange={(event) => {
          props.onChoose(event.target.files?.[0]);
        }}
        className="text-sm"
      />
      <p id={`${inputId}-ayuda`} className="text-xs text-muted-foreground">
        {ALLOWED_HINT}
      </p>
      {props.file === null ? null : (
        <p className="text-sm">
          {props.file.name} · {formatSize(props.file.size)}
        </p>
      )}
    </div>
  );
}

/**
 * Componente de carga (B14): revisa la lista blanca y el tamaño antes de enviar y sube el archivo
 * por su enlace temporal. La API y el worker vuelven a revisar todo.
 */
export function FileUpload(): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const upload = useUploadFile();
  const choose = (chosen: File | undefined): void => {
    upload.reset();
    setFile(chosen ?? null);
    setProblem(chosen === undefined ? null : uploadProblem(chosen));
  };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (file === null || problem !== null) return;
    upload.mutate(file, {
      onSuccess: () => {
        setFile(null);
      },
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Subir un archivo">
      <FilePicker file={file} onChoose={choose} />
      {problem === null ? null : (
        <FormError error={new ApiError(FILE_ERROR_CODES.typeNotAllowed, problem, 0)} />
      )}
      {upload.isError ? <FormError error={upload.error} /> : null}
      {upload.isSuccess ? <FormSuccess message={RECEIVED} /> : null}
      <SubmitButton
        label="Subir archivo"
        pendingLabel="Subiendo…"
        pending={upload.isPending}
        done={file === null || problem !== null}
        className="self-start"
      />
    </form>
  );
}
