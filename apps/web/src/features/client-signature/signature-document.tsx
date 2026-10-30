'use client';

import { Button, LoadingState } from '@arza/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { save } from '../audit/audit-export-button';

// El documento por firmar en la página de firma (B25, numeral 16.3): completo y visible en la página,
// y descargable antes de firmar (numeral 19.4). Pedirlo exige el código validado.

export const DOCUMENT_KEY = ['firma-cliente', 'documento'] as const;

interface Ticketed {
  readonly token: string;
  readonly ticket: string;
}

/** El PDF por firmar, para leerlo en la página. */
export function DocumentViewer(props: Ticketed & { readonly title: string }): JSX.Element {
  const api = useApiClient();
  const pdf = useQuery({
    queryKey: [...DOCUMENT_KEY, props.ticket],
    queryFn: () =>
      api.download('/v1/public/signatures/document', {
        body: { token: props.token, ticket: props.ticket, document: 'original' },
      }),
    retry: false,
    staleTime: Infinity,
  });
  const content = pdf.data?.content;
  const url = useMemo(
    () => (content === undefined ? null : URL.createObjectURL(content)),
    [content],
  );
  useEffect(
    () => () => {
      if (url !== null) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (pdf.isError) return <FormError error={pdf.error} />;
  if (url === null) return <LoadingState label="Cargando el documento" />;
  return <iframe title={props.title} src={url} className="h-[70vh] w-full rounded-md border" />;
}

export function DownloadOriginal(props: Ticketed): JSX.Element {
  const api = useApiClient();
  const download = useMutation({
    mutationFn: () =>
      api.download('/v1/public/signatures/document', {
        body: {
          token: props.token,
          ticket: props.ticket,
          document: 'original',
          disposition: 'attachment',
        },
      }),
    onSuccess: save,
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={download.isPending}
        onClick={() => {
          download.mutate();
        }}
      >
        Descargar el documento
      </Button>
      {download.isError ? <FormError error={download.error} /> : null}
    </div>
  );
}
