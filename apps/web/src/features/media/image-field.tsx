'use client';

import { IMAGE_ERROR_CODES } from '@arza/contracts';
import { Avatar, Button } from '@arza/ui';
import { ImageUp, Trash2 } from 'lucide-react';
import { useId, useRef, useState, type JSX } from 'react';

import { ApiError } from '../../lib/api/api-error';
import { FormError } from '../access/form-alert';
import { imageProblem, useImageRemoval, useImageUpload, type ImageTarget } from './image-upload';
import { useImageUrl } from './media-queries';

// Foto o logo con su vista previa (B22A): elegir una imagen, que se sube, pasa por el antivirus y
// queda guardada; o quitarla para volver a las iniciales.

interface ImageFieldProps {
  readonly target: ImageTarget;
  /** Nombre de la persona o de la empresa: sus iniciales cuando no hay imagen. */
  readonly name: string;
  readonly hasImage: boolean;
  /** «foto» o «logo», para los textos. */
  readonly noun: 'foto' | 'logo';
  readonly editable: boolean;
}

function useImageField(target: ImageTarget) {
  const upload = useImageUpload(target);
  const removal = useImageRemoval(target);
  const [problem, setProblem] = useState<string | null>(null);
  const choose = (file: File | undefined): void => {
    if (file === undefined) return;
    const found = imageProblem(file);
    setProblem(found);
    removal.reset();
    if (found === null) upload.mutate(file);
  };
  const error =
    problem === null
      ? (upload.error ?? removal.error)
      : new ApiError(IMAGE_ERROR_CODES.invalid, problem, 0);
  return { upload, removal, choose, error };
}

type FieldState = ReturnType<typeof useImageField>;

/** Botón que abre el selector de archivos del equipo; el campo de archivo queda oculto. */
function ChooseButton(props: {
  readonly noun: 'foto' | 'logo';
  readonly state: FieldState;
  readonly busy: boolean;
}): JSX.Element {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg"
        // Oculto del todo: se usa con el botón visible, que es el único control para el teclado.
        hidden
        aria-label={`Elegir ${props.noun === 'foto' ? 'la foto' : 'el logo'}`}
        onChange={(event) => {
          props.state.choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={props.busy}
        onClick={() => {
          input.current?.click();
        }}
      >
        <ImageUp aria-hidden="true" />
        {props.state.upload.isPending ? 'Subiendo y revisando…' : `Elegir ${props.noun}`}
      </Button>
    </>
  );
}

function Actions(props: ImageFieldProps & { readonly state: FieldState }): JSX.Element {
  const { upload, removal } = props.state;
  const busy = upload.isPending || removal.isPending;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ChooseButton noun={props.noun} state={props.state} busy={busy} />
      {props.hasImage ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            removal.mutate();
          }}
        >
          <Trash2 aria-hidden="true" />
          Quitar
        </Button>
      ) : null}
    </div>
  );
}

const SAVED = { foto: 'Foto guardada.', logo: 'Logo guardado.' } as const;

export function ImageField(props: ImageFieldProps): JSX.Element {
  const src = useImageUrl(props.hasImage ? props.target.image : null);
  const state = useImageField(props.target);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar name={props.name} src={src} size="lg" />
        <p className="text-sm text-muted-foreground">
          {props.hasImage
            ? `Así se ve su ${props.noun}.`
            : `Todavía no hay ${props.noun}; se muestran las iniciales.`}
          {props.editable
            ? ' PNG o JPG de hasta 2 MB; pasa por el antivirus antes de usarse.'
            : null}
        </p>
      </div>
      {props.editable ? <Actions {...props} state={state} /> : null}
      {props.editable && state.error !== null ? <FormError error={state.error} /> : null}
      <p role="status" className="sr-only">
        {state.upload.isSuccess ? SAVED[props.noun] : ''}
      </p>
    </div>
  );
}
