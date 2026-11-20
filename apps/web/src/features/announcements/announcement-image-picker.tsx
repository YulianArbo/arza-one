'use client';

import { Button } from '@arza/ui';
import Image from 'next/image';
import { ImageUp, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type JSX, type Ref } from 'react';

import { FormError } from '../access/form-alert';
import { imageProblem } from '../media/image-upload';
import { useImageUrl } from '../media/media-queries';
import { ANNOUNCEMENTS_PATH } from './announcement-queries';
import { useAnnouncementImage } from './announcement-save';

// Imagen opcional del comunicado (B36A): PNG o JPG de hasta 2 MB. Se sube al elegirla y el
// antivirus la revisa mientras se termina el formulario.

/** Vista previa del archivo elegido en este equipo, sin pedirlo otra vez a la API. */
function useLocalPreview(file: File | null): string | null {
  const url = useMemo(() => (file === null ? null : URL.createObjectURL(file)), [file]);
  useEffect(
    () => () => {
      if (url !== null) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

interface PickerProps {
  /** El comunicado que se edita, para mostrar la imagen que ya tiene. */
  readonly announcementId: string | null;
  readonly fileId: string | null;
  readonly onChange: (fileId: string | null) => void;
}

function usePicker(props: PickerProps) {
  const upload = useAnnouncementImage();
  const [chosen, setChosen] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const local = useLocalPreview(chosen);
  const savedPath =
    chosen === null && props.fileId !== null && props.announcementId !== null
      ? `${ANNOUNCEMENTS_PATH}/${props.announcementId}/image`
      : null;
  const saved = useImageUrl(savedPath);
  const choose = (file: File | undefined): void => {
    if (file === undefined) return;
    const found = imageProblem(file);
    setProblem(found);
    if (found !== null) return;
    setChosen(file);
    upload.mutate(file, { onSuccess: props.onChange });
  };
  const remove = (): void => {
    setChosen(null);
    upload.reset();
    props.onChange(null);
  };
  return { upload, problem, preview: local ?? saved, choose, remove };
}

type Picker = ReturnType<typeof usePicker>;

function HiddenFileInput({
  ref,
  onFile,
}: {
  readonly ref: Ref<HTMLInputElement>;
  readonly onFile: (file: File | undefined) => void;
}): JSX.Element {
  const inputId = useId();
  return (
    <input
      ref={ref}
      id={inputId}
      type="file"
      accept="image/png,image/jpeg"
      hidden
      aria-label="Elegir la imagen del comunicado"
      onChange={(event) => {
        onFile(event.target.files?.[0]);
        event.target.value = '';
      }}
    />
  );
}

/** Elegir, cambiar o quitar la imagen; el campo de archivo queda oculto tras el botón. */
function PickerButtons(props: {
  readonly picker: Picker;
  readonly hasImage: boolean;
}): JSX.Element {
  const { picker, hasImage } = props;
  const input = useRef<HTMLInputElement>(null);
  const busy = picker.upload.isPending;
  return (
    <div className="flex flex-wrap gap-2">
      <HiddenFileInput ref={input} onFile={picker.choose} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => {
          input.current?.click();
        }}
      >
        <ImageUp aria-hidden="true" />
        {busy ? 'Subiendo…' : hasImage ? 'Cambiar imagen' : 'Elegir imagen'}
      </Button>
      {hasImage ? (
        <Button type="button" variant="outline" size="sm" onClick={picker.remove}>
          <Trash2 aria-hidden="true" />
          Quitar imagen
        </Button>
      ) : null}
    </div>
  );
}

export function AnnouncementImagePicker(props: PickerProps): JSX.Element {
  const picker = usePicker(props);
  const hasImage = props.fileId !== null || picker.upload.isPending;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Imagen (opcional)</legend>
      <p className="text-xs text-muted-foreground">PNG o JPG de hasta 2 MB.</p>
      {picker.preview === null ? null : (
        <Image
          src={picker.preview}
          alt=""
          width={480}
          height={320}
          unoptimized
          className="h-auto max-h-40 w-auto self-start rounded-lg border"
        />
      )}
      <PickerButtons picker={picker} hasImage={hasImage} />
      {picker.problem === null ? null : (
        <p className="text-sm text-destructive">{picker.problem}</p>
      )}
      {picker.upload.error === null ? null : <FormError error={picker.upload.error} />}
    </fieldset>
  );
}
