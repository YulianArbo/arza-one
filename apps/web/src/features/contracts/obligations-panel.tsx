'use client';

import { IN_FORCE_STATUSES, type ContractDetail, type Obligation } from '@arza/contracts';
import { Badge, Button, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { ListChecks } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { RecordDialog } from '../organization/record-dialog';
import { useSession } from '../session/session-provider';
import { usePermissions } from '../session/permissions';
import { NoteForm } from './decision-forms';
import { OBLIGATION_STATUSES, OBLIGATION_TONES } from './labels';
import { useContractAction } from './queries';

// Obligaciones e hitos del contrato (B24, ficha 17.7): cada uno con su responsable y su fecha. El
// responsable recibe un aviso 7 días antes y la obligación queda «Vencida» si la fecha pasa.

interface Props {
  readonly contract: ContractDetail;
}

function CompleteButton(props: Props & { readonly obligation: Obligation }): JSX.Element {
  const api = useApiClient();
  const path = `/v1/contracts/${props.contract.id}/obligations/${props.obligation.id}`;
  const complete = useContractAction<undefined>((_args, csrfToken) =>
    api.post(`${path}/actions/complete`, {
      body: { note: null },
      version: props.obligation.version,
      csrfToken,
    }),
  );
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={complete.pending}
        onClick={() => {
          complete.execute(undefined);
        }}
      >
        Marcar cumplida
      </Button>
      {complete.error === null ? null : <FormError error={complete.error} />}
      {complete.dialog}
    </>
  );
}

function AddObligation(props: Props & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const { session } = useSession();
  const add = useContractAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/contracts/${props.contract.id}/obligations`, {
      body: { ...body, responsible_id: session.user.id },
      csrfToken,
    });
  }, props.onDone);
  return (
    <NoteForm
      action={add}
      spec={{
        idPrefix: 'obligacion',
        textField: 'description',
        textLabel: 'Obligación o hito',
        dateField: 'due_on',
        dateLabel: 'Fecha en que debe cumplirse',
        submitLabel: 'Registrar',
        pendingLabel: 'Registrando…',
      }}
    />
  );
}

function ObligationRow(
  props: Props & { readonly obligation: Obligation; readonly canWrite: boolean },
) {
  const { obligation } = props;
  return (
    <TableRow>
      <TableCell>
        {obligation.description}
        {obligation.done_note === null ? null : (
          <p className="text-xs text-muted-foreground">{obligation.done_note}</p>
        )}
      </TableCell>
      <TableCell>{obligation.responsible?.name ?? '—'}</TableCell>
      <TableCell>{formatDate(obligation.due_on)}</TableCell>
      <TableCell>
        <Badge tone={OBLIGATION_TONES[obligation.status]}>
          {OBLIGATION_STATUSES[obligation.status]}
        </Badge>
      </TableCell>
      <TableCell>
        {props.canWrite && obligation.status !== 'done' ? (
          <CompleteButton contract={props.contract} obligation={obligation} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function ObligationsPanel({ contract }: Props): JSX.Element {
  const { can } = usePermissions();
  const canWrite = can('contract.update') && contract.status !== 'terminated';
  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <div>
          <RecordDialog
            triggerLabel="Registrar una obligación"
            variant="outline"
            title="Nueva obligación o hito"
            description="Queda a su cargo; recibirá un aviso 7 días antes de la fecha."
          >
            {(close) => <AddObligation contract={contract} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <ObligationsTable contract={contract} canWrite={canWrite} />
    </div>
  );
}

function ObligationsTable(props: Props & { readonly canWrite: boolean }): JSX.Element {
  const { contract } = props;
  if (contract.obligations.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="Sin obligaciones registradas"
        description={
          IN_FORCE_STATUSES.includes(contract.status)
            ? 'Registre los hitos y entregas para que la plataforma avise a tiempo.'
            : 'Las obligaciones se registran desde el borrador o cuando el contrato rige.'
        }
      />
    );
  }
  return (
    <SimpleTable
      caption="Obligaciones del contrato"
      scrollLabel="Obligaciones; desplácese a los lados para ver todas las columnas"
      headers={['Obligación', 'Responsable', 'Fecha', 'Estado', 'Acción']}
    >
      {contract.obligations.map((obligation) => (
        <ObligationRow
          key={obligation.id}
          contract={contract}
          obligation={obligation}
          canWrite={props.canWrite}
        />
      ))}
    </SimpleTable>
  );
}
