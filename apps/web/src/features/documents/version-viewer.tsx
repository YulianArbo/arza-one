'use client';

import type { Version } from '@arza/contracts';
import { LoadingState } from '@arza/ui';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { DownloadButton } from '../files/file-list';
import { useObjectUrl } from '../files/file-preview';
import { RENDER_LABELS } from './labels';
import { useVersionLink } from './queries';

// Visor del documento (B18, numeral 16.4): el PDF de la versión dentro de la ficha, traído por un
// enlace de cinco minutos que verifica la huella y mostrado desde la memoria del navegador.

function PdfFrame({ version }: { readonly version: Version }): JSX.Element {
  const api = useApiClient();
  const requestLink = useVersionLink();
  const content = useQuery({
    queryKey: ['documents', 'versions', version.id, 'pdf'],
    queryFn: async () => api.fetchFile((await requestLink(version.id, 'pdf')).url),
    gcTime: 0,
    retry: false,
  });
  const url = useObjectUrl(content.data);
  if (content.isError) return <FormError error={content.error} />;
  if (url === null) return <LoadingState label="Cargando el documento" />;
  return (
    <iframe
      src={url}
      title={`Versión ${version.label}: ${version.title}`}
      className="h-[75vh] w-full rounded border"
    />
  );
}

/** El PDF de la versión y sus descargas: el fuente solo para quien edita documentos. */
export function VersionViewer({ version }: { readonly version: Version }): JSX.Element {
  const requestLink = useVersionLink();
  if (version.render_status !== 'ready') {
    return <p className="text-sm text-muted-foreground">{RENDER_LABELS[version.render_status]}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <DownloadButton
          label="Descargar PDF"
          requestLink={async () => requestLink(version.id, 'pdf')}
        />
        {version.source_file === null ? null : (
          <DownloadButton
            label="Descargar archivo fuente"
            requestLink={async () => requestLink(version.id, 'source')}
          />
        )}
      </div>
      <PdfFrame version={version} />
    </div>
  );
}
