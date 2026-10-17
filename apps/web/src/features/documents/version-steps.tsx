'use client';

import type { Document, Version } from '@arza/contracts';
import { buttonVariants } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { RecordDialog, TextInput } from '../organization/record-dialog';
import { ACTION_LABELS, versionFormPath } from './labels';
import { useVersionStep, type StepRequest } from './queries';

// Botones de los pasos de una versión (B18): solo los que la API dice que la persona puede dar. En
// B19 los dará la Solicitud de Acción Documental con su flujo.

interface StepsProps {
  readonly document: Document;
  readonly version: Version;
}

type Step = StepRequest['step'];

const CONFIRMS: Readonly<Record<'submit' | 'approve', { title: string; description: string }>> = {
  submit: {
    title: 'Enviar a revisión',
    description: 'Mientras esté en revisión no podrá cambiarla. Quien la revise podrá devolverla.',
  },
  approve: {
    title: 'Aprobar la versión',
    description: 'Queda aprobada y lista para publicar. Usted no podrá ser quien la elaboró.',
  },
};

/** Lo que lleva cada paso: el motivo al devolver o declarar obsoleta, la fecha al publicar. */
function stepBody(step: Step, text: string): object {
  if (step === 'publish') return text === '' ? {} : { effective_date: text };
  return step === 'reject' ? { note: text.trim() } : { reason: text.trim() };
}

type StepFormProps = StepsProps & { readonly step: Step; readonly onDone: () => void };

function useStepForm(props: StepFormProps) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useVersionStep(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const length = text.trim().length;
    const invalid = props.step !== 'publish' && (length < 5 || length > 1000);
    setProblem(invalid ? 'Escriba el motivo (5 a 1000 caracteres).' : null);
    if (invalid) return;
    const { id, version } = props.version;
    action.execute({ versionId: id, version, step: props.step, body: stepBody(props.step, text) });
  };
  return { text, setText, problem, action, submit };
}

/** Paso con un texto obligatorio (devolver, declarar obsoleta) o la fecha de vigencia (publicar). */
function StepForm(props: StepFormProps): JSX.Element {
  const { text, setText, problem, action, submit } = useStepForm(props);
  const publishing = props.step === 'publish';
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {action.error === null ? null : <FormError error={action.error} />}
      <TextInput
        id={`paso-${props.step}`}
        type={publishing ? 'date' : 'text'}
        label={publishing ? 'Rige desde (vacío: hoy)' : 'Motivo'}
        value={text}
        maxLength={1000}
        error={problem}
        onValue={setText}
      />
      <SubmitButton
        label={ACTION_LABELS[props.step]}
        pendingLabel="Guardando…"
        pending={action.pending}
      />
      {action.dialog}
    </form>
  );
}

const DIALOG_TEXTS: Readonly<Record<'reject' | 'publish' | 'obsolete', string>> = {
  reject: 'Vuelve al borrador para que quien la elaboró la corrija.',
  publish: 'Queda vigente y la versión vigente anterior pasa a obsoleta.',
  obsolete: 'El documento deja de regir y los usuarios ya no podrán descargarlo.',
};

function ConfirmStep(props: StepsProps & { readonly step: 'submit' | 'approve' }): JSX.Element {
  const action = useVersionStep(() => undefined);
  const texts = CONFIRMS[props.step];
  return (
    <div className="flex flex-col gap-1">
      <ConfirmActionButton
        label={ACTION_LABELS[props.step]}
        title={`${texts.title}: ${props.document.code} versión ${props.version.label}`}
        description={texts.description}
        confirmLabel={`Sí, ${ACTION_LABELS[props.step].toLowerCase()}`}
        disabled={action.pending}
        onConfirm={() => {
          action.execute({
            versionId: props.version.id,
            version: props.version.version,
            step: props.step,
            body: {},
          });
        }}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

export function VersionSteps(props: StepsProps): JSX.Element | null {
  const { actions } = props.version;
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {actions.includes('edit') ? (
        <Link
          href={versionFormPath(props.document.id)}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Editar borrador
        </Link>
      ) : null}
      {(['submit', 'approve'] as const)
        .filter((step) => actions.includes(step))
        .map((step) => (
          <ConfirmStep key={step} {...props} step={step} />
        ))}
      {(['reject', 'publish', 'obsolete'] as const)
        .filter((step) => actions.includes(step))
        .map((step) => (
          <RecordDialog
            key={step}
            triggerLabel={ACTION_LABELS[step]}
            variant="outline"
            title={`${ACTION_LABELS[step]}: ${props.document.code} versión ${props.version.label}`}
            description={DIALOG_TEXTS[step]}
          >
            {(close) => <StepForm {...props} step={step} onDone={close} />}
          </RecordDialog>
        ))}
    </div>
  );
}
