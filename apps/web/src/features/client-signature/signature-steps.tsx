'use client';

import {
  ACCEPTANCE_TEXT,
  verifySignatureCodeResponseSchema,
  type PublicSignature,
} from '@arza/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  TextareaField,
} from '@arza/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { DocumentViewer, DownloadOriginal } from './signature-document';

// Los pasos de la página de firma (B25, numeral 19.2): pedir el código al correo, escribirlo, leer
// el documento completo y firmarlo con la casilla de aceptación expresa, o rechazarlo con el motivo.

export const SIGNATURE_KEY = ['firma-cliente'] as const;

interface Step {
  readonly token: string;
}

interface Ticketed extends Step {
  readonly ticket: string;
}

/** Pide el código al correo registrado; uno por minuto. */
function RequestCode(props: Step & { readonly emailHint: string }): JSX.Element {
  const api = useApiClient();
  const request = useMutation({
    mutationFn: () => api.post('/v1/public/signatures/code', { body: { token: props.token } }),
  });
  return (
    <>
      <p className="text-sm">
        Le enviaremos un código de seis números a {props.emailHint}. Vale diez minutos; tiene cinco
        intentos.
      </p>
      <Button
        type="button"
        variant={request.isSuccess ? 'outline' : 'primary'}
        className="self-start"
        disabled={request.isPending}
        onClick={() => {
          request.mutate();
        }}
      >
        {request.isSuccess ? 'Enviarme otro código' : 'Enviarme el código'}
      </Button>
      {request.isError ? <FormError error={request.error} /> : null}
      {request.isSuccess ? (
        <p role="status" className="text-sm">
          Listo. Revise su correo (también la carpeta de correo no deseado).
        </p>
      ) : null}
    </>
  );
}

/** Escribe el código y lo valida; entrega la confirmación para leer y firmar. */
function EnterCode(props: Step & { readonly onTicket: (ticket: string) => void }): JSX.Element {
  const api = useApiClient();
  const [code, setCode] = useState('');
  const verify = useMutation({
    mutationFn: () =>
      api.post('/v1/public/signatures/verify-code', {
        body: { token: props.token, code: code.trim() },
        schema: verifySignatureCodeResponseSchema,
      }),
    onSuccess: (result) => {
      props.onTicket(result.ticket);
    },
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    verify.mutate();
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {verify.isError ? <FormError error={verify.error} /> : null}
      <FormField
        id="firma-codigo"
        label="Código del correo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => {
          setCode(event.target.value.replace(/\D/g, ''));
        }}
      />
      <SubmitButton
        className="self-start"
        label="Validar el código"
        pendingLabel="Validando…"
        pending={verify.isPending}
      />
    </form>
  );
}

/** Paso 1: confirmar que es la persona, con el código de su correo. */
export function CodeStep(
  props: Step & {
    readonly signature: PublicSignature;
    readonly onTicket: (ticket: string) => void;
  },
): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1. Confirme que es usted</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RequestCode token={props.token} emailHint={props.signature.signer.email_hint} />
        <EnterCode token={props.token} onTicket={props.onTicket} />
      </CardContent>
    </Card>
  );
}

function useSignatureStep(path: 'sign' | 'reject') {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => api.post(`/v1/public/signatures/${path}`, { body }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SIGNATURE_KEY }),
  });
}

/** La casilla de aceptación expresa, con el texto exacto que queda en el certificado. */
function AcceptanceBox(props: {
  readonly checked: boolean;
  readonly problem: string | null;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  const { problem } = props;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="firma-acepto" className="flex items-start gap-2 text-sm">
        <Checkbox
          id="firma-acepto"
          className="mt-0.5"
          checked={props.checked}
          aria-invalid={problem === null ? undefined : true}
          aria-describedby={problem === null ? undefined : 'firma-acepto-error'}
          onChange={(event) => {
            props.onChange(event.target.checked);
          }}
        />
        {ACCEPTANCE_TEXT}
      </label>
      {problem === null ? null : (
        <p id="firma-acepto-error" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
}

function SignForm(props: Ticketed): JSX.Element {
  const sign = useSignatureStep('sign');
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!agreed) {
      setProblem('Marque la casilla para firmar.');
      return;
    }
    sign.mutate({ token: props.token, ticket: props.ticket, accept: true });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {sign.isError ? <FormError error={sign.error} /> : null}
      <AcceptanceBox checked={agreed} problem={problem} onChange={setAgreed} />
      <SubmitButton
        className="self-start"
        label="Firmar el documento"
        pendingLabel="Firmando…"
        pending={sign.isPending}
        done={sign.isSuccess}
      />
    </form>
  );
}

function RejectForm(props: Ticketed): JSX.Element {
  const [open, setOpen] = useState(false);
  if (open) return <RejectReason {...props} />;
  return (
    <Button
      type="button"
      variant="outline"
      className="self-start"
      onClick={() => {
        setOpen(true);
      }}
    >
      No estoy de acuerdo: rechazar
    </Button>
  );
}

function RejectReason(props: Ticketed): JSX.Element {
  const reject = useSignatureStep('reject');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setProblem('Escriba por qué lo rechaza.');
      return;
    }
    reject.mutate({ token: props.token, ticket: props.ticket, reason: reason.trim() });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {reject.isError ? <FormError error={reject.error} /> : null}
      <TextareaField
        id="firma-rechazo"
        label="¿Por qué lo rechaza?"
        value={reason}
        error={problem}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      <Button type="submit" variant="outline" className="self-start" disabled={reject.isPending}>
        Confirmar el rechazo
      </Button>
    </form>
  );
}

/** Con el código validado: leer, descargar y firmar o rechazar. */
export function SignStep(props: Ticketed & { readonly signature: PublicSignature }): JSX.Element {
  const { signature } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. Lea el documento y fírmelo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DocumentViewer
          token={props.token}
          ticket={props.ticket}
          title={`${signature.document.kind} ${signature.document.code}`}
        />
        <DownloadOriginal token={props.token} ticket={props.ticket} />
        <p className="text-sm text-muted-foreground">
          Al firmar quedan registrados la fecha y la hora, su dirección IP, su navegador, la huella
          digital del documento y el texto que acepta.
        </p>
        <SignForm token={props.token} ticket={props.ticket} />
        <RejectForm token={props.token} ticket={props.ticket} />
      </CardContent>
    </Card>
  );
}
