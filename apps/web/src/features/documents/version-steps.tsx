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
import { RequestSelect } from './request-select';
import { VersionChecklist } from '../forms/version-checklist';

// Botones de los pasos de una versión (B18): solo los que la API dice que la persona puede dar.
// Desde B19 son los pasos de su trámite (revisión de Calidad, aprobación de Dirección y
// publicación) y declarar obsoleto un documento del SGC exige su solicitud de eliminación.

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
    title: 'Aprobar',
    description:
      'Aprueba el paso que usted atiende (la revisión de Calidad o la aprobación de Dirección). Quien elaboró la versión no puede aprobarla.',
  },
};

/** Lo que lleva cada paso: el motivo al devolver o declarar obsoleta, la fecha al publicar. */
function stepBody(step: Step, text: string, requestId: string | null): object {
  if (step === 'publish') return text === '' ? {} : { effective_date: text };
  if (step === 'reject') return { note: text.trim() };
  return { reason: text.trim(), change_request_id: requestId };
}

type StepFormProps = StepsProps & { readonly step: Step; readonly onDone: () => void };

function useStepForm(props: StepFormProps) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestProblem, setRequestProblem] = useState<string | undefined>(undefined);
  const needsRequest = props.step === 'obsolete' && props.document.is_controlled;
  const action = useVersionStep(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const length = text.trim().length;
    const invalid = props.step !== 'publish' && (length < 5 || length > 1000);
    setProblem(invalid ? 'Escriba el motivo (5 a 1000 caracteres).' : null);
    const missing = needsRequest && requestId === null;
    setRequestProblem(missing ? 'Elija la solicitud de eliminación aprobada.' : undefined);
    if (invalid || missing) return;
    const { id, version } = props.version;
    const body = stepBody(props.step, text, requestId);
    action.execute({ versionId: id, version, step: props.step, body });
  };
  const request = {
    needed: needsRequest,
    value: requestId,
    problem: requestProblem,
    onChange: setRequestId,
  };
  return { text, setText, problem, action, submit, request };
}

/** Paso con un texto obligatorio (devolver, declarar obsoleta) o la fecha de vigencia (publicar). */
function StepForm(props: StepFormProps): JSX.Element {
  const { text, setText, problem, action, submit, request } = useStepForm(props);
  const publishing = props.step === 'publish';
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {action.error === null ? null : <FormError error={action.error} />}
      {request.needed ? (
        <RequestSelect
          id="paso-solicitud"
          action="obsolete"
          documentId={props.document.id}
          value={request.value}
          error={request.problem}
          onChange={request.onChange}
        />
      ) : null}
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
      {props.version.status === 'in_review' && actions.includes('approve') ? (
        <VersionChecklist versionId={props.version.id} />
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
