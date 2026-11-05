'use client';

import {
  PUBLIC_QUOTE_STATES,
  publicQuoteSchema,
  type PublicQuote,
  type PublicQuoteState,
} from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  LoadingState,
  TextareaField,
} from '@arza/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useLinkToken } from '../access/link-token';
import { SubmitButton } from '../access/submit-button';
import { save } from '../audit/audit-export-button';
import { Conditions, ItemsTable, Totals, stateMessage } from './client-quote-parts';

// La cotización que abre el cliente desde el enlace del correo, sin sesión (B23, anexo D): la ve,
// descarga el PDF y la acepta o la rechaza una sola vez. La llave del enlace va en el cuerpo de
// cada petición, nunca en la dirección.

type Tone = 'info' | 'success' | 'destructive' | 'neutral';

const STATE_TONES: Readonly<Record<PublicQuoteState, Tone>> = {
  open: 'info',
  accepted: 'success',
  rejected: 'destructive',
  expired: 'neutral',
  replaced: 'neutral',
};

const QUOTE_KEY = ['cotizacion-cliente'] as const;

function useClientQuote(token: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: QUOTE_KEY,
    queryFn: () =>
      api.post('/v1/public/quotes/view', { body: { token }, schema: publicQuoteSchema }),
    retry: false,
  });
}

function useAnswer(path: 'accept' | 'reject') {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => api.post(`/v1/public/quotes/${path}`, { body }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUOTE_KEY }),
  });
}

function DownloadPdf({ token }: { readonly token: string }): JSX.Element {
  const api = useApiClient();
  const download = useMutation({
    mutationFn: () => api.download('/v1/public/quotes/pdf', { body: { token } }),
    onSuccess: save,
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={download.isPending}
        onClick={() => {
          download.mutate();
        }}
      >
        Descargar el PDF
      </Button>
      {download.isError ? <FormError error={download.error} /> : null}
    </div>
  );
}

function AgreeBox(props: {
  readonly checked: boolean;
  readonly problem: string | undefined;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="acepta-casilla" className="flex items-start gap-2 text-sm">
        <Checkbox
          id="acepta-casilla"
          className="mt-0.5"
          checked={props.checked}
          aria-invalid={props.problem === undefined ? undefined : true}
          aria-describedby={props.problem === undefined ? undefined : 'acepta-casilla-error'}
          onChange={(event) => {
            props.onChange(event.target.checked);
          }}
        />
        Acepto esta cotización con sus valores y condiciones.
      </label>
      {props.problem === undefined ? null : (
        <p id="acepta-casilla-error" className="text-sm text-destructive">
          {props.problem}
        </p>
      )}
    </div>
  );
}

function AcceptForm({ token }: { readonly token: string }): JSX.Element {
  const accept = useAnswer('accept');
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (name.trim().length < 3) found['name'] = 'Escriba su nombre completo.';
    if (!agreed) found['accept'] = 'Marque la casilla para aceptar la cotización.';
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    accept.mutate({ token, accepted_by_name: name.trim(), accept: true });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {accept.isError ? <FormError error={accept.error} /> : null}
      <FormField
        id="acepta-nombre"
        label="Su nombre completo"
        autoComplete="name"
        value={name}
        error={problems['name'] ?? null}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <AgreeBox checked={agreed} problem={problems['accept']} onChange={setAgreed} />
      <SubmitButton
        label="Aceptar la cotización"
        pendingLabel="Enviando…"
        pending={accept.isPending}
      />
    </form>
  );
}

function RejectForm({ token }: { readonly token: string }): JSX.Element {
  const reject = useAnswer('reject');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          setOpen(true);
        }}
      >
        Rechazar la cotización
      </Button>
    );
  }
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    reject.mutate({ token, reason: reason.trim().length >= 3 ? reason.trim() : null });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {reject.isError ? <FormError error={reject.error} /> : null}
      <TextareaField
        id="rechazo-motivo"
        label="¿Por qué la rechaza? (opcional)"
        value={reason}
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

function QuoteHeader({ quote }: { readonly quote: PublicQuote }): JSX.Element {
  return (
    <header className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">
        {quote.company.name}
        {quote.company.tax_id === null ? '' : ` · NIT ${quote.company.tax_id}`}
      </p>
      <h1 className="text-2xl font-semibold">
        Cotización {quote.code} · versión {quote.version_number}
      </h1>
      <p className="text-sm">Para {quote.party_name}</p>
      <div>
        <Badge tone={STATE_TONES[quote.state]}>{PUBLIC_QUOTE_STATES[quote.state]}</Badge>
      </div>
    </header>
  );
}

function AnswerCard({ token }: { readonly token: string }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Su respuesta</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          Al responder quedan registrados la fecha y la hora, su dirección IP, su navegador, la
          versión y la huella digital del PDF de esta cotización.
        </p>
        <AcceptForm token={token} />
        <RejectForm token={token} />
      </CardContent>
    </Card>
  );
}

function QuoteView(props: { readonly quote: PublicQuote; readonly token: string }): JSX.Element {
  const { quote, token } = props;
  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <QuoteHeader quote={quote} />
      <Alert tone={quote.state === 'open' ? 'info' : 'warning'}>
        <AlertDescription>{stateMessage(quote)}</AlertDescription>
      </Alert>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <ItemsTable quote={quote} />
          <Totals quote={quote} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Condiciones</CardTitle>
        </CardHeader>
        <CardContent>
          <Conditions quote={quote} />
        </CardContent>
      </Card>
      <DownloadPdf token={token} />
      {quote.state === 'open' ? <AnswerCard token={token} /> : null}
    </div>
  );
}

function Loaded({ token }: { readonly token: string }): JSX.Element {
  const quote = useClientQuote(token);
  if (quote.isPending) return <LoadingState label="Cargando la cotización" />;
  if (quote.isError) {
    return (
      <div className="w-full max-w-xl">
        <FormError error={quote.error} />
      </div>
    );
  }
  return <QuoteView quote={quote.data} token={token} />;
}

/** La pantalla del enlace: lee la llave del correo y muestra la cotización. */
export function ClientQuote(): JSX.Element {
  const token = useLinkToken();
  if (token === undefined) return <LoadingState label="Abriendo el enlace" />;
  if (token === null) {
    return (
      <Alert tone="warning" className="max-w-xl">
        <AlertDescription>
          El enlace no está completo. Ábralo tal como llegó en el correo o pida uno nuevo a quien le
          envió la cotización.
        </AlertDescription>
      </Alert>
    );
  }
  return <Loaded token={token} />;
}
