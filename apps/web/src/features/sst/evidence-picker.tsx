'use client';

import { fileListResponseSchema, uploadLinkResponseSchema, type FileStatus } from '@arza/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { STATUS_LABELS } from '../files/labels';
import { useSession } from '../session/session-provider';

// Adjuntar una foto o una evidencia sin salir del formulario (B37). El archivo se sube, el
// antivirus lo revisa y solo cuando queda «Disponible» se puede usar: mientras tanto el formulario
// muestra el estado. Si se rechaza, se informa y se puede elegir otro.

const POLL_MS = 2000;
const UPLOAD_FAILED =
  'No se pudo subir el archivo. Revise que sea una imagen o un PDF permitido y vuelva a intentarlo.';

export interface EvidenceState {
  readonly fileId: string | null;
  readonly busy: boolean;
}

function useFileStatus(fileId: string | null) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['files', 'sst-evidence', fileId],
    queryFn: ({ signal }) => api.get('/v1/files', { schema: fileListResponseSchema, signal }),
    enabled: fileId !== null,
    select: (list): FileStatus =>
      list.data.find((file) => file.id === fileId)?.status ?? 'pending_upload',
    refetchInterval: (query) => {
      const status = query.state.data?.data.find((file) => file.id === fileId)?.status;
      return status === 'available' || status === 'rejected' ? false : POLL_MS;
    },
  });
}

/** Sube el archivo por el enlace de un solo uso y entrega su identificador. */
function useUpload(onUploaded: (id: string) => void, onError: (message: string | null) => void) {
  const api = useApiClient();
  const { session } = useSession();
  return async (file: File) => {
    onError(null);
    try {
      const link = await api.post('/v1/files', {
        body: { file_name: file.name, mime_type: file.type, size_bytes: file.size },
        schema: uploadLinkResponseSchema,
        csrfToken: session.csrf_token,
      });
      await api.putFile(link.upload_url, file);
      onUploaded(link.id);
    } catch {
      onError(UPLOAD_FAILED);
    }
  };
}

function StatusLine(props: { readonly status: FileStatus | null; readonly error: string | null }) {
  return (
    <>
      {props.status === null ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          {props.status === 'rejected'
            ? 'El archivo fue rechazado. Elija otro.'
            : STATUS_LABELS[props.status]}
        </p>
      )}
      {props.error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      )}
    </>
  );
}

export function EvidencePicker(props: {
  readonly id: string;
  readonly label: string;
  readonly accept: string;
  readonly onChange: (state: EvidenceState) => void;
}): JSX.Element {
  const [fileId, setFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = useFileStatus(fileId).data ?? null;
  const { onChange } = props;
  useEffect(() => {
    const done = status === 'available' || status === 'rejected';
    onChange({ fileId: status === 'available' ? fileId : null, busy: fileId !== null && !done });
  }, [fileId, status, onChange]);
  const upload = useUpload(setFileId, setError);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      <input
        id={props.id}
        type="file"
        accept={props.accept}
        className="min-h-11 text-sm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void upload(file);
        }}
      />
      <StatusLine status={status} error={error} />
    </div>
  );
}
