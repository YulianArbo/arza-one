'use client';

import { DISPOSITION_PROPOSAL_STATUSES, type DispositionProposalDetail } from '@arza/contracts';
import { Badge } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { DownloadButton } from '../files/file-list';
import { RecordDialog } from '../organization/record-dialog';
import { CommentField } from '../workflows/workflow-actions';
import { WorkflowHistory } from '../workflows/workflow-history';
import { useInstance } from '../workflows/queries';
import { DISPOSITIONS_PATH, DISPOSITION_STATUS_TONES, periodLabel } from './labels';
import { useCertificateLink, useDisposition, useDispositionStep } from './retention-queries';
import { ItemRow } from './disposition-items';

// Ficha de una propuesta de disposición (B21): sus documentos con la regla que venció. Mientras
// Calidad la revisa puede conservar un documento con su motivo; después la envía y Dirección la
// aprueba o la rechaza. La aprobada se ejecuta sola y deja el acta en PDF.

function Facts({ proposal }: { readonly proposal: DispositionProposalDetail }): JSX.Element {
  const person = (who: DispositionProposalDetail['sent_by'], at: string | null) =>
    who === null ? '—' : `${who.name} el ${formatDateTime(at)}`;
  const facts: readonly (readonly [string, string])[] = [
    ['Mes', periodLabel(proposal.period)],
    ['Propuesta el', formatDateTime(proposal.created_at)],
    ['Paso actual', proposal.step ?? '—'],
    ['Revisó y envió', person(proposal.sent_by, proposal.sent_at)],
    ['Decidió', person(proposal.decided_by, proposal.decided_at)],
    ['Ejecutada', proposal.executed_at === null ? '—' : formatDateTime(proposal.executed_at)],
  ];
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium first-letter:uppercase">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RejectForm(props: {
  readonly proposal: DispositionProposalDetail;
  readonly onDone: () => void;
}): JSX.Element {
  const [comment, setComment] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useDispositionStep(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = comment.trim();
    const invalid = text.length < 5 || text.length > 2000;
    setProblem(invalid ? 'Escriba el motivo (5 a 2000 caracteres).' : null);
    if (invalid) return;
    const { id, version } = props.proposal;
    action.execute({ id, version, step: 'reject', comment: text });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {action.error === null ? null : <FormError error={action.error} />}
      <CommentField
        id="disposicion-motivo"
        label="Motivo"
        hint={problem ?? 'Nada se elimina. El mes siguiente se propone de nuevo.'}
        value={comment}
        onChange={setComment}
      />
      <SubmitButton label="Rechazar" pendingLabel="Guardando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

const STEP_TEXT = {
  send: {
    label: 'Enviar a aprobación',
    description: 'Dirección la recibe en «Mis tareas». Después ya no se cambian sus documentos.',
  },
  approve: {
    label: 'Aprobar',
    description:
      'El contenido de los documentos marcados «Eliminar» se borra para siempre y queda el acta. No se puede deshacer.',
  },
} as const;

function ConfirmStep(props: {
  readonly proposal: DispositionProposalDetail;
  readonly step: 'send' | 'approve';
}): JSX.Element {
  const action = useDispositionStep();
  const text = STEP_TEXT[props.step];
  return (
    <div className="flex flex-col gap-1">
      <ConfirmActionButton
        label={text.label}
        title={`${text.label}: ${props.proposal.code}`}
        description={text.description}
        confirmLabel={`Sí, ${text.label.toLowerCase()}`}
        disabled={action.pending}
        onConfirm={() => {
          const { id, version } = props.proposal;
          action.execute({ id, version, step: props.step, comment: null });
        }}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

function Steps({ proposal }: { readonly proposal: DispositionProposalDetail }): JSX.Element | null {
  if (proposal.actions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {(['send', 'approve'] as const)
        .filter((step) => proposal.actions.includes(step))
        .map((step) => (
          <ConfirmStep key={step} proposal={proposal} step={step} />
        ))}
      {proposal.actions.includes('reject') ? (
        <RecordDialog
          triggerLabel="Rechazar"
          variant="outline"
          title={`Rechazar: ${proposal.code}`}
          description="La propuesta queda rechazada con el motivo."
        >
          {(close) => <RejectForm proposal={proposal} onDone={close} />}
        </RecordDialog>
      ) : null}
    </div>
  );
}

function History({ instanceId }: { readonly instanceId: string }): JSX.Element | null {
  const instance = useInstance(instanceId);
  if (instance.data === undefined) return null;
  return <WorkflowHistory history={instance.data.history} />;
}

function Notes({ proposal }: { readonly proposal: DispositionProposalDetail }): JSX.Element {
  return (
    <>
      {proposal.decision_note === null ? null : (
        <p className="text-sm">Motivo del rechazo: «{proposal.decision_note}»</p>
      )}
      {proposal.status === 'approved' ? (
        <p role="status" className="text-sm">
          Aprobada: en unos minutos se borra el contenido y queda el acta.
        </p>
      ) : null}
    </>
  );
}

function ProposalView({ proposal }: { readonly proposal: DispositionProposalDetail }): JSX.Element {
  const requestLink = useCertificateLink();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${proposal.code} · Disposición final`}
        description="Documentos con la retención vencida y regla de eliminar. Nada se elimina sin la aprobación de Dirección."
        action={
          proposal.has_certificate ? (
            <DownloadButton
              label="Descargar el acta"
              requestLink={async () => requestLink(proposal.id)}
            />
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={DISPOSITION_STATUS_TONES[proposal.status]}>
          {DISPOSITION_PROPOSAL_STATUSES[proposal.status]}
        </Badge>
        <Link href={DISPOSITIONS_PATH} className="text-sm text-primary hover:underline">
          Volver a las propuestas
        </Link>
      </div>
      <Facts proposal={proposal} />
      <Notes proposal={proposal} />
      <Steps proposal={proposal} />
      <SimpleTable headers={['Documento', 'Serie', 'Venció el', 'Decisión', '']}>
        {proposal.items.map((item) => (
          <ItemRow key={item.id} proposal={proposal} item={item} />
        ))}
      </SimpleTable>
      {proposal.workflow_instance_id === null ? null : (
        <History instanceId={proposal.workflow_instance_id} />
      )}
    </div>
  );
}

export function DispositionDetail({ id }: { readonly id: string }): JSX.Element {
  const proposal = useDisposition(id);
  return (
    <QueryState query={proposal} loadingLabel="Cargando la propuesta">
      {(data) => <ProposalView proposal={data} />}
    </QueryState>
  );
}
