'use client';

import {
  IN_FORCE_STATUSES,
  downloadLinkResponseSchema,
  type Amendment,
  type ContractDetail,
} from '@arza/contracts';
import { Badge, Button, Card, CardContent, EmptyState } from '@arza/ui';
import { FilePlus2 } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { save } from '../audit/audit-export-button';
import { formatPesos } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { ProposeForm } from './amendment-form';
import { NoteForm } from './decision-forms';
import { AMENDMENT_KINDS, AMENDMENT_STATUSES, AMENDMENT_TONES } from './labels';
import { useContractAction } from './queries';
import { SignatureForm } from './signature-form';

// Otrosíes y prórrogas (B24, ficha 17.7). El otrosí lo aprueba la Dirección; tiene su PDF y rige
// cuando se registra su copia firmada, que cambia la fecha de fin o el valor del contrato.

interface Props {
  readonly contract: ContractDetail;
}

interface AmendmentProps extends Props {
  readonly amendment: Amendment;
}

function useAmendmentStep(props: AmendmentProps, action: string, onDone?: () => void) {
  const api = useApiClient();
  const base = `/v1/contracts/${props.contract.id}/amendments/${props.amendment.id}`;
  return useContractAction<object>(
    (body, csrfToken) =>
      api.post(`${base}/actions/${action}`, { body, version: props.amendment.version, csrfToken }),
    onDone,
  );
}

function DownloadAmendment(props: AmendmentProps & { readonly signed: boolean }): JSX.Element {
  const api = useApiClient();
  const base = `/v1/contracts/${props.contract.id}/amendments/${props.amendment.id}`;
  const download = useContractAction<undefined>(async (_args, csrfToken) => {
    const link = await api.post(`${base}/pdf`, {
      body: { document: props.signed ? 'signed' : 'generated' },
      schema: downloadLinkResponseSchema,
      csrfToken,
    });
    const suffix = props.signed ? '-firmado' : '';
    save({
      fileName: `${props.amendment.code}${suffix}.pdf`,
      content: await api.fetchFile(link.url),
    });
  });
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={download.pending}
      onClick={() => {
        download.execute(undefined);
      }}
    >
      {props.signed ? 'Copia firmada' : 'PDF'}
    </Button>
  );
}

function ApproveAmendment(props: AmendmentProps): JSX.Element {
  const approve = useAmendmentStep(props, 'approve');
  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={approve.pending}
        onClick={() => {
          approve.execute({ comment: null });
        }}
      >
        Aprobar
      </Button>
      {approve.error === null ? null : <FormError error={approve.error} />}
      {approve.dialog}
    </>
  );
}

function ReturnAmendment(props: AmendmentProps & { readonly onDone: () => void }): JSX.Element {
  const back = useAmendmentStep(props, 'return', props.onDone);
  return (
    <NoteForm
      action={back}
      spec={{
        idPrefix: 'devolver-otrosi',
        textField: 'comment',
        textLabel: 'Por qué se devuelve',
        submitLabel: 'Devolver',
        pendingLabel: 'Devolviendo…',
      }}
    />
  );
}

function SignAmendment(props: AmendmentProps & { readonly onDone: () => void }): JSX.Element {
  const sign = useAmendmentStep(props, 'register-signature', props.onDone);
  return <SignatureForm action={sign} />;
}

function AmendmentActions(props: AmendmentProps): JSX.Element {
  const { can } = usePermissions();
  const { amendment } = props;
  const reviewing = amendment.status === 'in_review' && can('contract.approve');
  const signing = amendment.status === 'approved' && amendment.pdf_ready && can('contract.update');
  return (
    <div className="flex flex-wrap gap-2">
      {reviewing ? <ApproveAmendment {...props} /> : null}
      {reviewing ? (
        <RecordDialog
          triggerLabel="Devolver"
          variant="outline"
          title={`Devolver ${amendment.code}`}
          description="El otrosí no rige; quien lo elaboró crea otro."
        >
          {(close) => <ReturnAmendment {...props} onDone={close} />}
        </RecordDialog>
      ) : null}
      {signing ? (
        <RecordDialog
          triggerLabel="Registrar la firma"
          variant="outline"
          title={`Firma de ${amendment.code}`}
          description="Con la copia firmada, el otrosí rige y cambia el contrato."
        >
          {(close) => <SignAmendment {...props} onDone={close} />}
        </RecordDialog>
      ) : null}
      {amendment.pdf_ready ? <DownloadAmendment {...props} signed={false} /> : null}
      {amendment.signed_on === null ? null : <DownloadAmendment {...props} signed />}
    </div>
  );
}

function AmendmentCard(props: AmendmentProps): JSX.Element {
  const { amendment } = props;
  const changes = [
    amendment.new_ends_on === null
      ? null
      : `Nueva fecha de fin: ${formatDate(amendment.new_ends_on)}`,
    amendment.new_value === null ? null : `Nuevo valor: ${formatPesos(amendment.new_value)}`,
  ].filter((line): line is string => line !== null);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{amendment.code}</span>
          <Badge tone="neutral">{AMENDMENT_KINDS[amendment.kind]}</Badge>
          <Badge tone={AMENDMENT_TONES[amendment.status]}>
            {AMENDMENT_STATUSES[amendment.status]}
          </Badge>
        </div>
        <p className="font-medium">{amendment.summary}</p>
        <p className="whitespace-pre-line text-sm">{amendment.body}</p>
        <p className="text-sm text-muted-foreground">
          Rige desde {formatDate(amendment.effective_on)}
          {changes.length === 0 ? '' : ` · ${changes.join(' · ')}`}
        </p>
        {amendment.decision_note === null ? null : (
          <p className="text-sm">Nota de la Dirección: «{amendment.decision_note}»</p>
        )}
        <AmendmentActions {...props} />
      </CardContent>
    </Card>
  );
}

export function AmendmentsPanel({ contract }: Props): JSX.Element {
  const { can } = usePermissions();
  const inForce = IN_FORCE_STATUSES.includes(contract.status);
  return (
    <div className="flex flex-col gap-4">
      {inForce && can('contract.update') ? (
        <div>
          <RecordDialog
            triggerLabel="Proponer un otrosí"
            variant="outline"
            title={`Otrosí de ${contract.code}`}
            description="La Dirección lo revisa; rige cuando se registra la copia firmada."
          >
            {(close) => <ProposeForm contract={contract} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      {contract.amendments.length === 0 ? (
        <EmptyState
          icon={<FilePlus2 />}
          title="Sin otrosíes ni prórrogas"
          description="Los cambios a un contrato vigente se hacen con un otrosí o una prórroga."
        />
      ) : (
        contract.amendments.map((amendment) => (
          <AmendmentCard key={amendment.id} contract={contract} amendment={amendment} />
        ))
      )}
    </div>
  );
}
