'use client';

import type { ProjectItem } from '@arza/contracts';
import {
  Alert,
  AlertDescription,
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

// Terminar un ítem (ficha 17.8): «no pasa a terminado sin revisión de código y pruebas
// registradas». Desde el B27, la revisión es la Lista de Revisión de Código FT-TEC-002: si la última
// no está aprobada, el diálogo lo dice y lleva a revisarlo; con ella, pide qué pruebas se hicieron.

export interface Evidence {
  readonly test_note: string;
}

const FIELDS: readonly FieldSpec<keyof Evidence>[] = [
  {
    key: 'test_note',
    field: 'test_note',
    id: 'terminar-pruebas',
    label: 'Pruebas hechas',
    multiline: true,
  },
];

function EvidenceForm(props: {
  readonly item: ProjectItem;
  readonly onConfirm: (item: ProjectItem, evidence: Evidence) => void;
  readonly onClose: () => void;
}): JSX.Element {
  const [values, setValues] = useState<Evidence>({ test_note: props.item.test_note ?? '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found: Record<string, string> =
      values.test_note.trim().length < 3 ? { test_note: 'Cuente qué pruebas se hicieron.' } : {};
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    props.onConfirm(props.item, { test_note: values.test_note.trim() });
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

function ReviewFirst(props: {
  readonly item: ProjectItem;
  readonly onReview: (item: ProjectItem) => void;
  readonly onClose: () => void;
}): JSX.Element {
  const requested = props.item.last_review === 'changes_requested';
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning">
        <AlertDescription>
          {requested
            ? 'La última revisión de código pidió cambios. Corríjalos y pida una revisión nueva.'
            : 'Este ítem aún no tiene una revisión de código aprobada (FT-TEC-002).'}
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={props.onClose}>
          Cerrar
        </Button>
        <Button
          type="button"
          onClick={() => {
            props.onReview(props.item);
          }}
        >
          Revisar el código
        </Button>
      </DialogFooter>
    </div>
  );
}

export function DoneDialog(props: {
  readonly item: ProjectItem | null;
  readonly onConfirm: (item: ProjectItem, evidence: Evidence) => void;
  readonly onReview: (item: ProjectItem) => void;
  readonly onClose: () => void;
}): JSX.Element {
  const { item } = props;
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminar {item === null ? '' : itemLabel(item)}</DialogTitle>
          <DialogDescription>
            Un ítem pasa a terminado con su revisión de código aprobada y sus pruebas registradas.
          </DialogDescription>
        </DialogHeader>
        {item === null ? null : item.last_review === 'approved' ? (
          <EvidenceForm item={item} onConfirm={props.onConfirm} onClose={props.onClose} />
        ) : (
          <ReviewFirst item={item} onReview={props.onReview} onClose={props.onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
