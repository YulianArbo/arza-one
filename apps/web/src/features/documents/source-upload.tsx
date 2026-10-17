'use client';

import { FILE_ERROR_CODES } from '@arza/contracts';
import { Badge, Button, Label } from '@arza/ui';
import { useEffect, useId, useState, type JSX } from 'react';

import { ApiError } from '../../lib/api/api-error';
import { FormError } from '../access/form-alert';
import {
  REJECTION_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  formatSize,
  uploadProblem,
} from '../files/labels';
import { SOURCE_ACCEPT, SOURCE_HINT, isSourceType } from './labels';
import { useSourceFile, useUploadSource } from './queries';

// Archivo fuente de una versión (B18): se sube por el enlace temporal de B14, pasa por el antivirus
// y solo cuando queda disponible se puede guardar la versión.

const NOT_SOURCE = 'Use un PDF, un Word (.docx) o un Excel (.xlsx).';

function problemOf(file: File): string | null {
  return isSourceType(file.type) ? uploadProblem(file) : NOT_SOURCE;
}

interface SourceUploadProps {
  /** Archivo que ya tiene la versión (al corregir un borrador). */
  readonly current: { readonly id: string; readonly fileName: string } | null;
  /** Identificador del archivo listo para usar, o null mientras no hay uno. */
  readonly onChange: (fileId: string | null) => void;
  readonly error?: string | undefined;
}

function UploadedStatus({ fileId }: { readonly fileId: string }): JSX.Element {
  const file = useSourceFile(fileId);
  if (file.isError) return <FormError error={file.error} />;
  if (file.data === undefined) return <p className="text-sm">Revisando el archivo…</p>;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
      {file.data.file_name}
      <Badge tone={STATUS_TONES[file.data.status]}>{STATUS_LABELS[file.data.status]}</Badge>
      {file.data.rejection === null ? null : (
        <span className="text-destructive">{REJECTION_LABELS[file.data.rejection]}</span>
      )}
    </p>
  );
}

/** Archivo elegido, su subida y su análisis; avisa el archivo cuando queda disponible. */
function useSourceUpload(onChange: (fileId: string | null) => void) {
  const [chosen, setChosen] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const upload = useUploadSource();
  const status = useSourceFile(uploadedId).data?.status;
  useEffect(() => {
    if (uploadedId !== null) onChange(status === 'available' ? uploadedId : null);
  }, [uploadedId, status, onChange]);
  const choose = (file: File | undefined): void => {
    upload.reset();
    setUploadedId(null);
    setChosen(file ?? null);
    setProblem(file === undefined ? null : problemOf(file));
    if (file !== undefined) onChange(null);
  };
  const send = (): void => {
    if (chosen === null || problem !== null) return;
    upload.mutate(chosen, { onSuccess: setUploadedId });
  };
  return { chosen, problem, uploadedId, upload, choose, send };
}

function ChosenFile(props: {
  readonly file: File;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSend: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">
        {props.file.name} · {formatSize(props.file.size)}
      </span>
      <Button size="sm" variant="outline" onClick={props.onSend} disabled={props.disabled}>
        {props.pending ? 'Subiendo…' : 'Subir archivo'}
      </Button>
    </div>
  );
}

/** Archivo elegido, su problema, el error de la subida y el resultado del análisis. */
function UploadMessages({
  state,
}: {
  readonly state: ReturnType<typeof useSourceUpload>;
}): JSX.Element {
  return (
    <>
      {state.chosen === null || state.uploadedId !== null ? null : (
        <ChosenFile
          file={state.chosen}
          disabled={state.problem !== null || state.upload.isPending}
          pending={state.upload.isPending}
          onSend={state.send}
        />
      )}
      {state.problem === null ? null : (
        <FormError error={new ApiError(FILE_ERROR_CODES.typeNotAllowed, state.problem, 0)} />
      )}
      {state.upload.isError ? <FormError error={state.upload.error} /> : null}
      {state.uploadedId === null ? null : <UploadedStatus fileId={state.uploadedId} />}
    </>
  );
}

export function SourceUpload({ current, onChange, error }: SourceUploadProps): JSX.Element {
  const inputId = useId();
  const state = useSourceUpload(onChange);
  const errorId = error === undefined ? '' : ` ${inputId}-error`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-4">
      <Label htmlFor={inputId}>Archivo fuente</Label>
      {current === null || state.uploadedId !== null ? null : (
        <p className="text-sm">
          Archivo actual: {current.fileName}. Para reemplazarlo, elija otro.
        </p>
      )}
      <input
        id={inputId}
        type="file"
        accept={SOURCE_ACCEPT}
        aria-describedby={`${inputId}-ayuda${errorId}`}
        onChange={(event) => {
          state.choose(event.target.files?.[0]);
        }}
        className="text-sm"
      />
      <p id={`${inputId}-ayuda`} className="text-xs text-muted-foreground">
        {SOURCE_HINT}
      </p>
      <UploadMessages state={state} />
      {error === undefined ? null : (
        <p id={`${inputId}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
