'use client';

import type { ProjectItem } from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { Fields, summaryOf, type FieldSpec } from './form-bits';
import { itemLabel } from './labels';

// Terminar un ítem (B26, ficha 17.8): «no pasa a terminado sin revisión de código y pruebas
// registradas». Mientras llega la lista de revisión FT-TEC-002 (B27), se registran el enlace a la
// revisión de código y qué pruebas se hicieron.

export interface Evidence {
  readonly review_url: string;
  readonly test_note: string;
}

const FIELDS: readonly FieldSpec<keyof Evidence>[] = [
  {
    key: 'review_url',
    field: 'review_url',
    id: 'terminar-revision',
    label: 'Enlace a la revisión de código',
    hint: 'La solicitud de cambios revisada en el repositorio del cliente.',
    type: 'url',
  },
  {
    key: 'test_note',
    field: 'test_note',
    id: 'terminar-pruebas',
    label: 'Pruebas hechas',
    multiline: true,
  },
];

function problemsOf(evidence: Evidence): Record<string, string> {
  const found: Record<string, string> = {};
  if (!/^https:\/\/\S+$/u.test(evidence.review_url.trim())) {
    found['review_url'] = 'Pegue el enlace completo, que empiece por https://';
  }
  if (evidence.test_note.trim().length < 3) found['test_note'] = 'Cuente qué pruebas se hicieron.';
  return found;
}

function EvidenceForm(props: {
  readonly item: ProjectItem;
  readonly onConfirm: (item: ProjectItem, evidence: Evidence) => void;
  readonly onClose: () => void;
}): JSX.Element {
  const [values, setValues] = useState<Evidence>({
    review_url: props.item.review_url ?? '',
    test_note: props.item.test_note ?? '',
  });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    props.onConfirm(props.item, {
      review_url: values.review_url.trim(),
      test_note: values.test_note.trim(),
    });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormSummary problems={problems} fields={summaryOf(FIELDS)} />
      <Fields
        specs={FIELDS}
        values={values}
        problems={problems}
        onChange={(key, value) => {
          setValues({ ...values, [key]: value });
        }}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={props.onClose}>
          Cancelar
        </Button>
        <Button type="submit">Terminar</Button>
      </DialogFooter>
    </form>
  );
}

export function DoneDialog(props: {
  readonly item: ProjectItem | null;
  readonly onConfirm: (item: ProjectItem, evidence: Evidence) => void;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <Dialog
      open={props.item !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminar {props.item === null ? '' : itemLabel(props.item)}</DialogTitle>
          <DialogDescription>
            Un ítem pasa a terminado con su revisión de código y sus pruebas registradas.
          </DialogDescription>
        </DialogHeader>
        {props.item === null ? null : (
          <EvidenceForm item={props.item} onConfirm={props.onConfirm} onClose={props.onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
