'use client';

import {
  ACCEPTANCE_TEXT,
  downloadLinkResponseSchema,
  type Envelope,
  type EnvelopeDocument,
  type EnvelopeSigner,
} from '@arza/contracts';
import { Button, Checkbox, DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { save } from '../audit/audit-export-button';
import { NoteForm } from '../contracts/decision-forms';
import { useContractAction } from '../contracts/queries';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';

// Acciones de un proceso de firma (B25), según su estado y los permisos de la persona: enviarlo (la
// Dirección, con una llave que evita enviarlo dos veces), anularlo, reenviar el enlace a quien le
// toca, firmar o rechazar por la empresa (solo la persona elegida) y descargar los PDF. La API vuelve
// a revisar cada paso.

interface Props {
  readonly envelope: Envelope;
}

function useEnvelopeStep(envelope: Envelope, path: string, onDone?: () => void) {
  const api = useApiClient();
  return useContractAction<object>(
    (body, csrfToken) =>
      api.post(`/v1/signature-envelopes/${envelope.id}/${path}`, { body, csrfToken }),
    onDone,
  );
}

function SendButton({ envelope }: Props): JSX.Element {
  const api = useApiClient();
  // Una llave por pantalla: si la petición se repite (doble clic, red lenta), no se envía dos veces.
  const [key] = useState(() => crypto.randomUUID());
  const send = useContractAction<undefined>((_args, csrfToken) =>
    api.post(`/v1/signature-envelopes/${envelope.id}/actions/send`, {
      body: {},
      version: envelope.version,
      csrfToken,
      idempotencyKey: key,
    }),
  );
  return (
    <>
      <Button
        type="button"
        disabled={send.pending}
        onClick={() => {
          send.execute(undefined);
        }}
      >
        Enviar a firma
      </Button>
      {send.error === null ? null : <FormError error={send.error} />}
      {send.dialog}
    </>
  );
}

function CancelDialog({ envelope }: Props): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Anular"
      variant="outline"
      title={`Anular el proceso ${envelope.code}`}
      description="Los enlaces dejan de servir y el documento vuelve a «aprobado». No se puede deshacer."
    >
      {(close) => <CancelAction envelope={envelope} onDone={close} />}
    </RecordDialog>
  );
}

function CancelAction(props: Props & { readonly onDone: () => void }): JSX.Element {
  const cancel = useEnvelopeStep(props.envelope, 'actions/cancel', props.onDone);
  const spec = {
    idPrefix: 'anular',
    textField: 'reason',
    textLabel: 'Por qué se anula',
    submitLabel: 'Anular',
    pendingLabel: 'Anulando…',
  };
  return <NoteForm spec={spec} action={cancel} />;
}

function ResendButton(props: Props & { readonly signer: EnvelopeSigner }): JSX.Element {
  const resend = useEnvelopeStep(props.envelope, `signers/${props.signer.id}/actions/resend`);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={resend.pending}
        aria-label={`Reenviar el enlace a ${props.signer.name}`}
        onClick={() => {
          resend.execute({});
        }}
      >
        Reenviar el enlace
      </Button>
      {resend.error === null ? null : <FormError error={resend.error} />}
      {resend.dialog}
    </>
  );
}

function SignAction(props: Props & { readonly onDone: () => void }): JSX.Element {
  const sign = useEnvelopeStep(props.envelope, 'actions/sign', props.onDone);
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!agreed) {
      setProblem('Marque la casilla para firmar.');
      return;
    }
    sign.execute({ accept: true });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {sign.error === null ? null : <FormError error={sign.error} />}
      <label htmlFor="firma-empresa-casilla" className="flex items-start gap-2 text-sm">
        <Checkbox
          id="firma-empresa-casilla"
          className="mt-0.5"
          checked={agreed}
          aria-invalid={problem === null ? undefined : true}
          onChange={(event) => {
            setAgreed(event.target.checked);
          }}
        />
        {ACCEPTANCE_TEXT}
      </label>
      {problem === null ? null : <p className="text-sm text-destructive">{problem}</p>}
      <DialogFooter>
        <SubmitButton label="Firmar" pendingLabel="Firmando…" pending={sign.pending} />
      </DialogFooter>
      {sign.dialog}
    </form>
  );
}

function CompanyActions({ envelope }: Props): JSX.Element {
  return (
    <>
      <RecordDialog
        triggerLabel="Firmar por la empresa"
        title={`Firmar ${envelope.document.code}`}
        description="Descargue y lea el documento antes de firmar. Le pediremos confirmar que es usted."
      >
        {(close) => <SignAction envelope={envelope} onDone={close} />}
      </RecordDialog>
      <RecordDialog
        triggerLabel="Rechazar"
        variant="outline"
        title={`Rechazar ${envelope.document.code}`}
        description="El proceso se cierra y el documento vuelve a «aprobado»."
      >
        {(close) => <RejectAction envelope={envelope} onDone={close} />}
      </RecordDialog>
    </>
  );
}

function RejectAction(props: Props & { readonly onDone: () => void }): JSX.Element {
  const reject = useEnvelopeStep(props.envelope, 'actions/reject', props.onDone);
  const spec = {
    idPrefix: 'rechazar-empresa',
    textField: 'reason',
    textLabel: 'Por qué lo rechaza',
    submitLabel: 'Rechazar',
    pendingLabel: 'Rechazando…',
  };
  return <NoteForm spec={spec} action={reject} />;
}

function DownloadButton(
  props: Props & { readonly document: EnvelopeDocument; readonly label: string },
) {
  const api = useApiClient();
  const { envelope } = props;
  const download = useContractAction<undefined>(async (_args, csrfToken) => {
    const link = await api.post(`/v1/signature-envelopes/${envelope.id}/documents`, {
      body: { document: props.document },
      schema: downloadLinkResponseSchema,
      csrfToken,
    });
    const content = await api.fetchFile(link.url);
    const names = {
      original: `${envelope.document.code}.pdf`,
      signed: `${envelope.document.code}-firmado.pdf`,
      certificate: `${envelope.code}-certificado.pdf`,
    };
    save({ fileName: names[props.document], content });
  });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={download.pending}
        onClick={() => {
          download.execute(undefined);
        }}
      >
        {props.label}
      </Button>
      {download.error === null ? null : <FormError error={download.error} />}
      {download.dialog}
    </>
  );
}

export function EnvelopeActions({ envelope }: Props): JSX.Element | null {
  const { can } = usePermissions();
  const actions: JSX.Element[] = [];
  const open = envelope.status === 'draft' || envelope.status === 'sent';
  if (envelope.status === 'draft' && can('signature.envelope.send')) {
    actions.push(<SendButton key="enviar" envelope={envelope} />);
  }
  const me = envelope.signers.find((signer) => signer.is_me && signer.status === 'pending');
  if (envelope.status === 'sent' && me !== undefined) {
    actions.push(<CompanyActions key="empresa" envelope={envelope} />);
  }
  if (open && can('signature.envelope.cancel')) {
    actions.push(<CancelDialog key="anular" envelope={envelope} />);
  }
  if (can('signature.evidence.read')) {
    actions.push(
      <DownloadButton key="original" envelope={envelope} document="original" label="PDF enviado" />,
    );
    if (envelope.signed?.status === 'ready') {
      actions.push(
        <DownloadButton key="firmado" envelope={envelope} document="signed" label="PDF firmado" />,
        <DownloadButton
          key="certificado"
          envelope={envelope}
          document="certificate"
          label="Certificado de evidencia"
        />,
      );
    }
  }
  if (actions.length === 0) return null;
  return <div className="flex flex-wrap items-start gap-3">{actions}</div>;
}

/** Reenviar el enlace, para quien puede enviar y al firmante del cliente al que le toca. */
export function SignerResend(
  props: Props & { readonly signer: EnvelopeSigner },
): JSX.Element | null {
  const { can } = usePermissions();
  const { envelope, signer } = props;
  const due = envelope.status === 'sent' && signer.kind === 'client' && signer.status === 'pending';
  if (!due || !can('signature.envelope.send')) return null;
  return <ResendButton envelope={envelope} signer={signer} />;
}
