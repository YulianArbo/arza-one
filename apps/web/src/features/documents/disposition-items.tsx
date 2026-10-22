'use client';

import {
  DISPOSITION_ACTIONS,
  documentStatusSchema,
  type DispositionItem,
  type DispositionProposalDetail,
} from '@arza/contracts';
import { Badge, Button, TableCell, TableRow } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { RecordDialog } from '../organization/record-dialog';
import { CommentField } from '../workflows/workflow-actions';
import { DOCUMENT_STATUS_LABELS, documentPath } from './labels';
import { useItemDecision } from './retention-queries';

// Los documentos de una propuesta de disposición (B21): la regla que venció, cuándo, y la decisión.
// Mientras Calidad revisa la propuesta puede conservar uno con su motivo o volver a eliminarlo.

function KeepForm(props: {
  readonly proposalId: string;
  readonly item: DispositionItem;
  readonly onDone: () => void;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const decide = useItemDecision(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = reason.trim();
    const invalid = text.length < 5 || text.length > 500;
    setProblem(invalid ? 'Escriba el motivo (5 a 500 caracteres).' : null);
    if (invalid) return;
    const { id, version } = props.item;
    const target = { proposalId: props.proposalId, itemId: id, version };
    decide.execute({ ...target, action: 'keep', reason: text });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {decide.error === null ? null : <FormError error={decide.error} />}
      <CommentField
        id={`conservar-${props.item.id}`}
        label="Por qué se conserva"
        hint={problem ?? 'Queda en el acta. El documento no se volverá a proponer.'}
        value={reason}
        onChange={setReason}
      />
      <SubmitButton label="Conservar" pendingLabel="Guardando…" pending={decide.pending} />
      {decide.dialog}
    </form>
  );
}

function DestroyAgain(props: {
  readonly proposalId: string;
  readonly item: DispositionItem;
}): JSX.Element {
  const decide = useItemDecision();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={decide.pending}
        onClick={() => {
          const { id, version } = props.item;
          const target = { proposalId: props.proposalId, itemId: id, version };
          decide.execute({ ...target, action: 'destroy', reason: null });
        }}
      >
        Volver a eliminar
      </Button>
      {decide.error === null ? null : <FormError error={decide.error} />}
      {decide.dialog}
    </div>
  );
}

function ItemDecision(props: {
  readonly proposal: DispositionProposalDetail;
  readonly item: DispositionItem;
}): JSX.Element | null {
  const { proposal, item } = props;
  if (!proposal.can_edit_items) return null;
  if (item.action === 'keep') return <DestroyAgain proposalId={proposal.id} item={item} />;
  return (
    <RecordDialog
      triggerLabel="Conservar"
      triggerAriaLabel={`Conservar ${item.document.code}`}
      variant="outline"
      title={`Conservar ${item.document.code}`}
      description="Se conserva para siempre (selección documental), con su motivo."
    >
      {(close) => <KeepForm proposalId={proposal.id} item={item} onDone={close} />}
    </RecordDialog>
  );
}

function documentStatus(status: string): string {
  const parsed = documentStatusSchema.safeParse(status);
  return parsed.success ? DOCUMENT_STATUS_LABELS[parsed.data] : status;
}

export function ItemRow(props: {
  readonly proposal: DispositionProposalDetail;
  readonly item: DispositionItem;
}): JSX.Element {
  const { item } = props;
  return (
    <TableRow>
      <TableCell>
        <Link
          href={documentPath(item.document.id)}
          className="font-medium text-primary hover:underline"
        >
          {item.document.code}
        </Link>
        <p className="text-xs text-muted-foreground">
          {item.document.title} · {documentStatus(item.document.status)}
        </p>
      </TableCell>
      <TableCell>
        {item.rule.code} · {item.rule.name}
      </TableCell>
      <TableCell>{formatDate(item.due_on)}</TableCell>
      <TableCell>
        <Badge tone={item.action === 'destroy' ? 'warning' : 'info'}>
          {DISPOSITION_ACTIONS[item.action]}
        </Badge>
        {item.keep_reason === null ? null : (
          <p className="text-xs text-muted-foreground">«{item.keep_reason}»</p>
        )}
      </TableCell>
      <TableCell>
        <ItemDecision proposal={props.proposal} item={item} />
      </TableCell>
    </TableRow>
  );
}
