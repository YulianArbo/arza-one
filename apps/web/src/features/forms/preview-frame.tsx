'use client';

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
import { useState, type JSX } from 'react';

import { FormError } from '../access/form-alert';
import { usePreview } from './queries';

// Vista previa de un formato o de una plantilla de salida (B20): la primera hoja como se verá en
// el PDF, con el encabezado y el pie institucionales. Va en un marco aislado, sin scripts.

function Frame(props: {
  readonly kind: 'form-templates' | 'output-templates';
  readonly id: string;
  readonly title: string;
}): JSX.Element {
  const preview = usePreview(props.kind, props.id);
  if (preview.isError) return <FormError error={preview.error} />;
  if (preview.data === undefined) return <LoadingState label="Preparando la vista previa" />;
  return (
    <iframe
      sandbox=""
      srcDoc={preview.data.html}
      title={`Vista previa: ${props.title}`}
      className="h-[70vh] w-full rounded border bg-white"
    />
  );
}

export function PreviewButton(props: {
  readonly kind: 'form-templates' | 'output-templates';
  readonly id: string;
  readonly title: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Vista previa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Vista previa: {props.title}</DialogTitle>
          <DialogDescription>
            Así se verá la primera hoja del PDF, con el encabezado y el pie institucionales.
          </DialogDescription>
        </DialogHeader>
        {open ? <Frame {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}
