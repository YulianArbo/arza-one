'use client';

import {
  createdResponseSchema,
  downloadLinkResponseSchema,
  NEW_VERSION_FROM,
  sendQuoteRequestSchema,
  type QuoteDetail,
} from '@arza/contracts';
import { Button, buttonVariants, DialogFooter, TextareaField } from '@arza/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { save } from '../audit/audit-export-button';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { useCrmAction } from './crm-action';
import { CRM_PATHS } from './labels';
import { TextFields, type TextFieldSpec } from './text-fields';

// Acciones de la cotización (B23, ficha 17.6), según su estado y los permisos de la persona. La
// API vuelve a revisar cada paso: una enviada no se edita, solo se envía una aprobada y quien la
// elaboró no la aprueba.

interface Props {
  readonly quote: QuoteDetail;
}

function useStep(quote: QuoteDetail, action: string, onDone?: () => void) {
  const api = useApiClient();
  return useCrmAction<object>(
    (body, csrfToken) =>
      api.post(`/v1/crm/quotes/${quote.id}/actions/${action}`, {
        body,
        version: quote.version,
        csrfToken,
      }),
    onDone,
  );
}

function SubmitQuote({ quote }: Props): JSX.Element {
  const submit = useStep(quote, 'submit');
  return (
    <>
      <Button
        type="button"
        disabled={submit.pending}
        onClick={() => {
          submit.execute({});
        }}
      >
        Pedir el envío
      </Button>
      {submit.error === null ? null : <FormError error={submit.error} />}
      {submit.dialog}
    </>
  );
}

function ApproveQuote({ quote }: Props): JSX.Element {
  const approve = useStep(quote, 'approve');
  return (
    <>
      <ConfirmActionButton
        label="Aprobar"
        title={`¿Aprobar ${quote.code} v${String(quote.version_number)}?`}
        description="Su descuento pasa el tope. Al aprobarla se prepara el PDF y Comercial podrá enviarla."
        confirmLabel="Sí, aprobar"
        disabled={approve.pending}
        onConfirm={() => {
          approve.execute({ comment: null });
        }}
      />
      {approve.error === null ? null : <FormError error={approve.error} />}
      {approve.dialog}
    </>
  );
}

function ReturnForm(props: Props & { readonly onDone: () => void }): JSX.Element {
  const back = useStep(props.quote, 'return', props.onDone);
  const [comment, setComment] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const missing = comment.trim().length < 3 ? 'Escriba qué debe corregirse.' : null;
    setProblem(missing);
    if (missing === null) back.execute({ comment: comment.trim() });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {back.error === null ? null : <FormError error={back.error} />}
      <TextareaField
        id="devolver-comentario"
        label="Qué debe corregirse"
        value={comment}
        error={problem}
        onChange={(event) => {
          setComment(event.target.value);
        }}
      />
      <DialogFooter>
        <SubmitButton label="Devolver" pendingLabel="Devolviendo…" pending={back.pending} />
      </DialogFooter>
      {back.dialog}
    </form>
  );
}

const SEND_FIELDS: readonly TextFieldSpec<'name' | 'email'>[] = [
  { key: 'name', field: 'recipient_name', id: 'enviar-nombre', label: 'Nombre de quien la recibe' },
  {
    key: 'email',
    field: 'recipient_email',
    id: 'enviar-correo',
    label: 'Correo electrónico',
    type: 'email',
  },
];

function SendForm(props: Props & { readonly onDone: () => void }): JSX.Element {
  const send = useStep(props.quote, 'send', props.onDone);
  const [values, setValues] = useState({ name: '', email: props.quote.party_email ?? '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const body = { recipient_name: values.name.trim(), recipient_email: values.email.trim() };
    const result = sendQuoteRequestSchema.safeParse(body);
    const found: Record<string, string> = {};
    for (const issue of result.success ? [] : result.error.issues) {
      found[String(issue.path[0])] ??= issue.message;
    }
    setProblems(found);
    if (result.success) send.execute(body);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {send.error === null ? null : <FormError error={send.error} />}
      <FormSummary problems={problems} fields={SEND_FIELDS} />
      <TextFields
        specs={SEND_FIELDS}
        values={values}
        problems={problems}
        onChange={(key, text) => {
          setValues({ ...values, [key]: text });
        }}
      />
      <DialogFooter>
        <SubmitButton label="Enviar" pendingLabel="Enviando…" pending={send.pending} />
      </DialogFooter>
      {send.dialog}
    </form>
  );
}

function NewVersion({ quote }: Props): JSX.Element {
  const api = useApiClient();
  const router = useRouter();
  const create = useCrmAction<undefined, string>(
    async (_args, csrfToken) =>
      (
        await api.post(`/v1/crm/quotes/${quote.id}/actions/new-version`, {
          body: {},
          schema: createdResponseSchema,
          version: quote.version,
          csrfToken,
        })
      ).id,
    (id) => {
      router.push(CRM_PATHS.quote(id));
    },
  );
  const replaces = quote.status === 'sent' || quote.status === 'approved';
  return (
    <>
      <ConfirmActionButton
        label="Crear versión nueva"
        title={`¿Crear la versión ${String(quote.version_number + 1)} de ${quote.code}?`}
        description={
          replaces
            ? 'Se copia como borrador para corregirla. Esta versión queda reemplazada y su enlace ya no sirve para aceptarla.'
            : 'Se copia como borrador para corregirla y enviarla de nuevo.'
        }
        confirmLabel="Sí, crear"
        disabled={create.pending}
        onConfirm={() => {
          create.execute(undefined);
        }}
      />
      {create.error === null ? null : <FormError error={create.error} />}
      {create.dialog}
    </>
  );
}

function DownloadPdf({ quote }: Props): JSX.Element {
  const api = useApiClient();
  const download = useCrmAction<undefined>(async (_args, csrfToken) => {
    const link = await api.post(`/v1/crm/quotes/${quote.id}/pdf`, {
      body: {},
      schema: downloadLinkResponseSchema,
      csrfToken,
    });
    const content = await api.fetchFile(link.url);
    save({ fileName: quote.pdf.file_name ?? `${quote.code}.pdf`, content });
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
        Descargar PDF
      </Button>
      {download.error === null ? null : <FormError error={download.error} />}
      {download.dialog}
    </>
  );
}

function DraftActions({ quote }: Props): JSX.Element {
  return (
    <>
      <Link href={CRM_PATHS.editQuote(quote.id)} className={buttonVariants({ variant: 'outline' })}>
        Editar
      </Link>
      <SubmitQuote quote={quote} />
    </>
  );
}

function DirectionActions({ quote }: Props): JSX.Element {
  return (
    <>
      <ApproveQuote quote={quote} />
      <RecordDialog
        triggerLabel="Devolver para corregir"
        variant="outline"
        size="md"
        title={`Devolver ${quote.code}`}
        description="Vuelve a borrador con su comentario para que Comercial la corrija."
      >
        {(close) => <ReturnForm quote={quote} onDone={close} />}
      </RecordDialog>
    </>
  );
}

function SendDialog({ quote }: Props): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Enviar al cliente"
      title={`Enviar ${quote.code} v${String(quote.version_number)}`}
      description="El cliente recibe un correo con el enlace para verla, descargarla y aceptarla o rechazarla en línea."
    >
      {(close) => <SendForm quote={quote} onDone={close} />}
    </RecordDialog>
  );
}

export function QuoteActions({ quote }: Props): JSX.Element | null {
  const { can } = usePermissions();
  const actions: JSX.Element[] = [];
  if (quote.status === 'draft' && can('crm.quote.update')) {
    actions.push(<DraftActions key="borrador" quote={quote} />);
  }
  if (quote.status === 'in_approval' && can('crm.quote.approve')) {
    actions.push(<DirectionActions key="direccion" quote={quote} />);
  }
  const ready = quote.status === 'approved' && quote.pdf.status === 'ready';
  if (ready && can('crm.quote.send')) actions.push(<SendDialog key="enviar" quote={quote} />);
  if (quote.pdf.status === 'ready') actions.push(<DownloadPdf key="pdf" quote={quote} />);
  const latest = quote.versions[0]?.id === quote.id;
  if (latest && NEW_VERSION_FROM.includes(quote.status) && can('crm.quote.create')) {
    actions.push(<NewVersion key="version" quote={quote} />);
  }
  if (actions.length === 0) return null;
  return <div className="flex flex-wrap items-start gap-3">{actions}</div>;
}
