'use client';

import type { FileView } from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  LoadingState,
} from '@arza/ui';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { useEffect, useMemo, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useDownloadLink } from './queries';

/** Dirección blob: del contenido, válida mientras se muestra; al quitarla se libera la memoria. */
function useObjectUrl(blob: Blob | undefined): string | null {
  const url = useMemo(() => (blob === undefined ? null : URL.createObjectURL(blob)), [blob]);
  useEffect(
    () => () => {
      if (url !== null) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

/**
 * Trae el archivo por un enlace de cinco minutos y lo muestra desde la memoria del navegador
 * (blob:), sin abrir la API dentro de la página. Se trae de nuevo en cada apertura y no se guarda.
 */
function PreviewBody({ file }: { readonly file: FileView }): JSX.Element {
  const api = useApiClient();
  const requestLink = useDownloadLink();
  const content = useQuery({
    queryKey: ['files', file.id, 'preview'],
    queryFn: async () => api.fetchFile((await requestLink(file.id)).url),
    gcTime: 0,
    retry: false,
  });
  const url = useObjectUrl(content.data);
  if (content.isError) return <FormError error={content.error} />;
  if (url === null) return <LoadingState label="Cargando la vista previa" />;
  const label = `Vista previa de ${file.file_name}`;
  return file.mime_type === 'application/pdf' ? (
    <iframe src={url} title={label} className="h-[70vh] w-full rounded border" />
  ) : (
    // Sin optimizar: es una dirección blob: del navegador, no una imagen del servidor.
    <Image
      src={url}
      alt={label}
      width={1200}
      height={900}
      unoptimized
      className="h-auto max-h-[70vh] w-full object-contain"
    />
  );
}

/** Componente de vista previa (B14) de un PDF o una imagen disponible. */
export function FilePreview({ file }: { readonly file: FileView }): JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Vista previa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{file.file_name}</DialogTitle>
          <DialogDescription>
            Copia para consultar. Para guardarla en su equipo, use «Descargar».
          </DialogDescription>
        </DialogHeader>
        <PreviewBody file={file} />
      </DialogContent>
    </Dialog>
  );
}
