'use client';

import { DISPOSITION_PROPOSAL_STATUSES, type DispositionProposal } from '@arza/contracts';
import { Badge, Button, EmptyState, TableCell, TableRow } from '@arza/ui';
import { Archive } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { usePermissions } from '../session/permissions';
import { DISPOSITION_STATUS_TONES, RETENTION_PATH, dispositionPath, periodLabel } from './labels';
import { useDispositions, useProposeDispositions } from './retention-queries';

// Disposición final (B21, RE-SGC-005): cada mes la plataforma propone los documentos con la
// retención vencida. Calidad revisa y envía; Dirección aprueba o rechaza; la aprobada se ejecuta
// sola y deja el acta. Nada se elimina sin regla vencida y aprobación.

const STATUS_OPTIONS = [
  { value: '', label: 'Todas' },
  ...Object.entries(DISPOSITION_PROPOSAL_STATUSES).map(([value, label]) => ({ value, label })),
];

function ProposalRow({ proposal }: { readonly proposal: DispositionProposal }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={dispositionPath(proposal.id)} className="text-primary hover:underline">
          {proposal.code}
        </Link>
      </TableCell>
      <TableCell className="capitalize">{periodLabel(proposal.period)}</TableCell>
      <TableCell>
        {proposal.to_destroy} para eliminar · {proposal.to_keep} para conservar
      </TableCell>
      <TableCell>
        <Badge tone={DISPOSITION_STATUS_TONES[proposal.status]}>
          {DISPOSITION_PROPOSAL_STATUSES[proposal.status]}
        </Badge>
      </TableCell>
      <TableCell>{formatDateTime(proposal.created_at)}</TableCell>
    </TableRow>
  );
}

function Proposals({
  proposals,
}: {
  readonly proposals: readonly DispositionProposal[];
}): JSX.Element {
  if (proposals.length === 0) {
    return (
      <EmptyState
        icon={<Archive />}
        title="No hay propuestas de disposición"
        description="Cada mes la plataforma propone los documentos cuya retención venció. Si ninguno venció, no hay propuesta."
      />
    );
  }
  return (
    <SimpleTable headers={['Acta', 'Mes', 'Documentos', 'Estado', 'Propuesta el']}>
      {proposals.map((proposal) => (
        <ProposalRow key={proposal.id} proposal={proposal} />
      ))}
    </SimpleTable>
  );
}

/** «Generar la propuesta del mes»: la misma que crea el sistema cada día, si hay vencidos. */
function ProposeButton(): JSX.Element | null {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const propose = useProposeDispositions((result) => {
    if (result.proposal_id === null) {
      setMessage('Ningún documento tiene la retención vencida: no hay nada que proponer.');
    } else {
      router.push(dispositionPath(result.proposal_id));
    }
  });
  if (!usePermissions().can('doc.retention.manage')) return null;
  const run = (): void => {
    setMessage(null);
    propose.execute(undefined);
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={run} disabled={propose.pending}>
        {propose.pending ? 'Revisando…' : 'Generar la propuesta del mes'}
      </Button>
      {message === null ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {propose.error === null ? null : <FormError error={propose.error} />}
      {propose.dialog}
    </div>
  );
}

export function DispositionList(): JSX.Element {
  const [status, setStatus] = useState('');
  const proposals = useDispositions(status);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Disposición final"
        description="Propuestas mensuales de los documentos con la retención vencida y sus actas. Nada se elimina sin regla vencida y aprobación."
        action={<ProposeButton />}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full max-w-xs">
          <SelectField
            id="disposicion-estado"
            label="Estado"
            value={status}
            options={STATUS_OPTIONS}
            onChange={(event) => {
              setStatus(event.target.value);
            }}
          />
        </div>
        <Link href={RETENTION_PATH} className="text-sm text-primary hover:underline">
          Ver la tabla de retención
        </Link>
      </div>
      <QueryState query={proposals} loadingLabel="Cargando las propuestas">
        {(data) => <Proposals proposals={data.data} />}
      </QueryState>
    </div>
  );
}
