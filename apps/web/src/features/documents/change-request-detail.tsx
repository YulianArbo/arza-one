'use client';

import {
  CHANGE_REQUEST_ACTIONS,
  CHANGE_REQUEST_STATUSES,
  type ChangeRequest,
} from '@arza/contracts';
import { Badge, buttonVariants } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { CommentField } from '../workflows/workflow-actions';
import { WorkflowHistory } from '../workflows/workflow-history';
import { useInstance } from '../workflows/queries';
import {
  REQUESTS_PATH,
  REQUEST_STATUS_TONES,
  REQUEST_STEP_LABELS,
  documentPath,
  newDocumentPath,
  versionFormPath,
} from './labels';
import { useChangeRequest, useRequestStep } from './sgc-queries';
import { recordPath } from '../forms/labels';

// Ficha de una Solicitud de Acción Documental (B19, FT-SGC-001): qué pide, por qué, en qué paso
// va, quién la decidió y, ya aprobada, cómo se ejecuta. El historial es el de su trámite.

function Facts({ request }: { readonly request: ChangeRequest }): JSX.Element {
  const facts: readonly (readonly [string, string])[] = [
    ['Qué pide', CHANGE_REQUEST_ACTIONS[request.action]],
    [
      'Documento',
      request.document === null
        ? request.title
        : `${request.document.code} · ${request.document.title}`,
    ],
    [
      'Tipo y proceso',
      request.doc_type === null
        ? '—'
        : `${request.doc_type} · ${request.process?.name ?? 'Sin proceso'}`,
    ],
    ['Pidió', `${request.requested_by?.name ?? '—'} el ${formatDateTime(request.requested_at)}`],
    ['Paso actual', request.step ?? '—'],
    [
      'Decidió',
      request.decided_by === null
        ? '—'
        : `${request.decided_by.name} el ${formatDateTime(request.decided_at)}`,
    ],
  ];
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RejectForm(props: {
  readonly request: ChangeRequest;
  readonly onDone: () => void;
}): JSX.Element {
  const [comment, setComment] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useRequestStep(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = comment.trim();
    const invalid = text.length < 5 || text.length > 2000;
    setProblem(invalid ? 'Escriba el motivo (5 a 2000 caracteres).' : null);
    if (invalid) return;
    const { id, version } = props.request;
    action.execute({ id, version, step: 'reject', comment: text });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {action.error === null ? null : <FormError error={action.error} />}
      <CommentField
        id="solicitud-motivo"
        label="Motivo"
        hint={problem ?? 'Lo verá quien pidió el cambio.'}
        value={comment}
        onChange={setComment}
      />
      <SubmitButton label="Rechazar" pendingLabel="Guardando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function ConfirmRequestStep(props: {
  readonly request: ChangeRequest;
  readonly step: 'analyze' | 'approve';
}): JSX.Element {
  const action = useRequestStep();
  const label = REQUEST_STEP_LABELS[props.step];
  return (
    <div className="flex flex-col gap-1">
      <ConfirmActionButton
        label={label}
        title={`${label}: ${props.request.code}`}
        description={
          props.step === 'approve'
            ? 'Quien la pidió podrá hacer el cambio con esta solicitud.'
            : 'La solicitud pasa a análisis y le llega la tarea de decidirla.'
        }
        confirmLabel={`Sí, ${label.toLowerCase()}`}
        disabled={action.pending}
        onConfirm={() => {
          const { id, version } = props.request;
          action.execute({ id, version, step: props.step, comment: null });
        }}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

function Steps({ request }: { readonly request: ChangeRequest }): JSX.Element | null {
  if (request.actions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {(['analyze', 'approve'] as const)
        .filter((step) => request.actions.includes(step))
        .map((step) => (
          <ConfirmRequestStep key={step} request={request} step={step} />
        ))}
      {request.actions.includes('reject') ? (
        <RecordDialog
          triggerLabel="Rechazar"
          variant="outline"
          size="md"
          title={`Rechazar: ${request.code}`}
          description="La solicitud queda rechazada con el motivo."
        >
          {(close) => <RejectForm request={request} onDone={close} />}
        </RecordDialog>
      ) : null}
    </div>
  );
}

/** Aprobada y sin ejecutar: el siguiente paso es hacer el cambio. */
function NextMove({ request }: { readonly request: ChangeRequest }): JSX.Element | null {
  if (request.status !== 'approved') return null;
  const target = request.document?.id ?? null;
  const [href, label] =
    request.action === 'create'
      ? [newDocumentPath(null), 'Crear el documento']
      : request.action === 'update' && target !== null
        ? [versionFormPath(target), 'Crear la versión nueva']
        : [documentPath(target ?? ''), 'Ir al documento para declararlo obsoleto'];
  return (
    <Link href={href} className={buttonVariants()}>
      {label}
    </Link>
  );
}

function History({ instanceId }: { readonly instanceId: string }): JSX.Element | null {
  const instance = useInstance(instanceId);
  if (instance.data === undefined) return null;
  return <WorkflowHistory history={instance.data.history} />;
}

function RequestView({ request }: { readonly request: ChangeRequest }): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${request.code} · ${request.title}`}
        description={request.justification}
        action={<NextMove request={request} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={REQUEST_STATUS_TONES[request.status]}>
          {CHANGE_REQUEST_STATUSES[request.status]}
        </Badge>
        <Link href={REQUESTS_PATH} className="text-sm text-primary hover:underline">
          Volver a las solicitudes
        </Link>
      </div>
      <Facts request={request} />
      {request.decision_note === null ? null : (
        <p className="text-sm">Motivo de la decisión: «{request.decision_note}»</p>
      )}
      {request.form_record_id === null ? null : (
        <Link
          href={recordPath(request.form_record_id)}
          className="text-sm text-primary hover:underline"
        >
          Ver el FT-SGC-001 de esta solicitud, con su PDF
        </Link>
      )}
      <Steps request={request} />
      {request.workflow_instance_id === null ? null : (
        <History instanceId={request.workflow_instance_id} />
      )}
    </div>
  );
}

export function ChangeRequestDetail({ id }: { readonly id: string }): JSX.Element {
  const request = useChangeRequest(id);
  return (
    <QueryState query={request} loadingLabel="Cargando la solicitud">
      {(data) => <RequestView request={data} />}
    </QueryState>
  );
}
