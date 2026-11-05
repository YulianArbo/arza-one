'use client';

import type { Envelope } from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { EnvelopeActions, SignerResend } from './envelope-actions';
import {
  ENVELOPE_STATUSES,
  ENVELOPE_TONES,
  SIGNATURE_EVENTS,
  SIGNER_KINDS,
  SIGNER_STATUSES,
  SIGNER_TONES,
} from './labels';
import { PrepareSignatureForm } from './prepare-form';
import { useEnvelopes, type SignatureTarget } from './queries';

// Seguimiento de la firma electrónica de un contrato o un otrosí (B25, numeral 16.3 «Seguimiento de
// firmas»): cada proceso con sus firmantes en orden, la cadena de eventos con su huella y si sigue
// intacta, y las acciones que la persona puede hacer.

interface Props {
  readonly envelope: Envelope;
}

function message(envelope: Envelope): string | null {
  if (envelope.status === 'draft') {
    return 'Preparado. Cuando la Dirección lo envíe, el primer firmante recibirá su enlace.';
  }
  if (envelope.status === 'sent') {
    return `En firma hasta el ${formatDateTime(envelope.expires_at)}. Firman en orden; la empresa, de última.`;
  }
  if (envelope.status === 'completed') {
    return envelope.signed?.status === 'ready'
      ? `Firmado por todos. Código de verificación: ${envelope.signed.verification_code}.`
      : 'Firmado por todos. Preparando el documento firmado y su certificado…';
  }
  return envelope.closed_reason;
}

function SignersTable({ envelope }: Props): JSX.Element {
  return (
    <SimpleTable
      caption={`Firmantes de ${envelope.code}`}
      headers={['Turno', 'Quién', 'Por', 'Estado', 'Fecha', '']}
    >
      {envelope.signers.map((signer) => (
        <TableRow key={signer.id}>
          <TableCell>{signer.sign_order}</TableCell>
          <TableCell>
            {signer.name}
            <span className="block text-xs text-muted-foreground">
              {signer.id_number} · {signer.email}
            </span>
          </TableCell>
          <TableCell>{SIGNER_KINDS[signer.kind]}</TableCell>
          <TableCell>
            <Badge tone={SIGNER_TONES[signer.status]}>{SIGNER_STATUSES[signer.status]}</Badge>
            {signer.code_locked ? <Badge tone="warning">Código bloqueado</Badge> : null}
          </TableCell>
          <TableCell>
            {formatDateTime(signer.signed_at ?? signer.rejected_at ?? signer.opened_at)}
            {signer.reject_reason === null ? null : (
              <span className="block text-xs">{signer.reject_reason}</span>
            )}
          </TableCell>
          <TableCell>
            <SignerResend envelope={envelope} signer={signer} />
          </TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

function EventsList({ envelope }: Props): JSX.Element {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-primary">
        Cadena de eventos ({envelope.events.length})
      </summary>
      <ol className="mt-2 flex flex-col gap-1">
        {envelope.events.map((event) => (
          <li key={event.id} className="flex flex-col border-b py-1 last:border-0">
            <span>
              {formatDateTime(event.occurred_at)} · {SIGNATURE_EVENTS[event.type]}
              {event.signer_name === null ? '' : ` · ${event.signer_name}`}
              {event.ip === null ? '' : ` · IP ${event.ip}`}
            </span>
            <code className="break-all text-xs text-muted-foreground">{event.hash}</code>
          </li>
        ))}
      </ol>
    </details>
  );
}

function EnvelopeCard({ envelope }: Props): JSX.Element {
  const note = message(envelope);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle className="text-base">{envelope.code}</CardTitle>
        <Badge tone={ENVELOPE_TONES[envelope.status]}>{ENVELOPE_STATUSES[envelope.status]}</Badge>
        <Badge tone={envelope.chain_intact ? 'success' : 'destructive'}>
          {envelope.chain_intact ? 'Cadena de eventos intacta' : 'La cadena de eventos cambió'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {note === null ? null : (
          <Alert tone={envelope.status === 'rejected' ? 'warning' : 'info'}>
            <AlertDescription>{note}</AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Huella del documento enviado (SHA-256):{' '}
          <code className="break-all">{envelope.document.sha256}</code>
        </p>
        <SignersTable envelope={envelope} />
        <EventsList envelope={envelope} />
        <EnvelopeActions envelope={envelope} />
      </CardContent>
    </Card>
  );
}

function PrepareDialog(props: { readonly target: SignatureTarget }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Preparar el envío a firma"
      title="Preparar el envío a firma electrónica"
      description="Elija quién firma por el cliente y hasta cuándo. La Dirección lo envía después."
    >
      {(close) => <PrepareSignatureForm target={props.target} onDone={close} />}
    </RecordDialog>
  );
}

/**
 * Los procesos de firma de un documento, el más reciente primero. Si el documento se puede enviar a
 * firma y no tiene un proceso abierto, ofrece prepararlo.
 */
export function SignaturesPanel(props: {
  readonly target: SignatureTarget;
  readonly canPrepare: boolean;
  readonly empty: string;
}): JSX.Element {
  const envelopes = useEnvelopes(props.target);
  const { can } = usePermissions();
  return (
    <QueryState query={envelopes} loadingLabel="Cargando los procesos de firma">
      {(data) => {
        const open = data.items.some((item) => item.status === 'draft' || item.status === 'sent');
        const prepare =
          props.canPrepare && !open && can('signature.envelope.create') ? (
            <PrepareDialog target={props.target} />
          ) : null;
        if (data.items.length === 0) {
          return (
            <EmptyState title="Sin firma electrónica" description={props.empty} action={prepare} />
          );
        }
        return (
          <div className="flex flex-col gap-4">
            {prepare}
            {data.items.map((envelope) => (
              <EnvelopeCard key={envelope.id} envelope={envelope} />
            ))}
          </div>
        );
      }}
    </QueryState>
  );
}
