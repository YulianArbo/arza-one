'use client';

import {
  PUBLIC_SIGNATURE_STATES,
  publicSignatureSchema,
  type PublicSignature,
  type PublicSignatureState,
} from '@arza/contracts';
import { Alert, AlertDescription, Badge, Button, Card, CardContent, LoadingState } from '@arza/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { useLinkToken } from '../access/link-token';
import { save } from '../audit/audit-export-button';
import { CodeStep, SIGNATURE_KEY, SignStep } from './signature-steps';

// La página de firma (B25, numeral 16.3): quien firma por el cliente la abre desde el enlace de su
// correo, sin sesión. Ve el documento completo, sus datos y la cláusula de aceptación; confirma que
// es él con el código de su correo y firma, o rechaza. La llave del enlace va en el cuerpo de cada
// petición, nunca en la dirección.

type Tone = 'info' | 'success' | 'destructive' | 'neutral' | 'warning';

const STATE_TONES: Readonly<Record<PublicSignatureState, Tone>> = {
  pending: 'info',
  waiting: 'neutral',
  signed: 'success',
  rejected: 'destructive',
  completed: 'success',
  closed: 'neutral',
};

function useSignature(token: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: SIGNATURE_KEY,
    queryFn: () =>
      api.post('/v1/public/signatures/open', { body: { token }, schema: publicSignatureSchema }),
    retry: false,
  });
}

function Header({ signature }: { readonly signature: PublicSignature }): JSX.Element {
  const { document, signer, company } = signature;
  return (
    <header className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">
        {company.name} · NIT {company.tax_id}
      </p>
      <h1 className="text-2xl font-semibold">
        {document.kind} {document.code}
      </h1>
      <p className="text-sm">{document.title}</p>
      <div>
        <Badge tone={STATE_TONES[signature.state]}>
          {PUBLIC_SIGNATURE_STATES[signature.state]}
        </Badge>
      </div>
      <Card className="mt-3">
        <CardContent className="grid gap-1 pt-4 text-sm sm:grid-cols-2">
          <span>
            Firma: <strong>{signer.name}</strong>
          </span>
          <span>Identificación: {signer.id_number}</span>
          <span>En calidad de: {signer.role}</span>
          <span>Puede firmar hasta el {formatDateTime(signature.expires_at)}</span>
          <span className="sm:col-span-2">
            Huella del documento (SHA-256):{' '}
            <code className="break-all text-xs">{document.sha256}</code>
          </span>
        </CardContent>
      </Card>
    </header>
  );
}

/** Lo que pasa y lo que sigue, en una frase. */
function stateMessage(signature: PublicSignature): string {
  switch (signature.state) {
    case 'pending':
      return 'Le corresponde firmar. Primero confirme que es usted con el código que enviaremos a su correo.';
    case 'waiting':
      return 'El documento se firma en orden y todavía no es su turno. Le avisaremos por correo cuando lo sea.';
    case 'signed':
      return `Usted firmó el ${formatDateTime(signature.signed_at)}. Cuando firmen todos, recibirá una copia íntegra en su correo.`;
    case 'completed':
      return 'El documento quedó firmado por todas las partes. Descargue aquí su copia, con la página de firmas y el certificado de evidencia.';
    case 'rejected':
      return 'Usted rechazó el documento. Quien se lo envió ya fue avisado.';
    case 'closed':
      return 'Este proceso de firma se cerró: venció, se anuló o alguien lo rechazó. Si necesita firmar, pida un enlace nuevo.';
  }
}

function SignedCopy({ token }: { readonly token: string }): JSX.Element {
  const api = useApiClient();
  const download = useMutation({
    mutationFn: () =>
      api.download('/v1/public/signatures/document', {
        body: { token, document: 'signed', disposition: 'attachment' },
      }),
    onSuccess: save,
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="self-start"
        disabled={download.isPending}
        onClick={() => {
          download.mutate();
        }}
      >
        Descargar el documento firmado
      </Button>
      {download.isError ? <FormError error={download.error} /> : null}
    </div>
  );
}

function SignatureView(props: {
  readonly signature: PublicSignature;
  readonly token: string;
}): JSX.Element {
  const { signature, token } = props;
  const [ticket, setTicket] = useState<string | null>(null);
  const pending = signature.state === 'pending';
  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <Header signature={signature} />
      <Alert tone={pending || signature.state === 'completed' ? 'info' : 'warning'}>
        <AlertDescription>{stateMessage(signature)}</AlertDescription>
      </Alert>
      {pending && signature.code_locked ? (
        <Alert tone="warning">
          <AlertDescription>
            Por seguridad, este enlace se bloqueó después de cinco códigos equivocados. Pida un
            enlace nuevo a quien le envió el documento.
          </AlertDescription>
        </Alert>
      ) : null}
      {pending && !signature.code_locked && ticket === null ? (
        <CodeStep token={token} signature={signature} onTicket={setTicket} />
      ) : null}
      {pending && ticket !== null ? (
        <SignStep token={token} ticket={ticket} signature={signature} />
      ) : null}
      {signature.state === 'completed' && signature.signed_copy ? (
        <SignedCopy token={token} />
      ) : null}
    </div>
  );
}

function Loaded({ token }: { readonly token: string }): JSX.Element {
  const signature = useSignature(token);
  if (signature.isPending) return <LoadingState label="Cargando el documento" />;
  if (signature.isError) {
    return (
      <div className="w-full max-w-xl">
        <FormError error={signature.error} />
      </div>
    );
  }
  return <SignatureView signature={signature.data} token={token} />;
}

/** La pantalla del enlace: lee la llave del correo y muestra el documento por firmar. */
export function ClientSignature(): JSX.Element {
  const token = useLinkToken();
  if (token === undefined) return <LoadingState label="Abriendo el enlace" />;
  if (token === null) {
    return (
      <Alert tone="warning" className="max-w-xl">
        <AlertDescription>
          El enlace no está completo. Ábralo tal como llegó en el correo o pida uno nuevo a quien le
          envió el documento.
        </AlertDescription>
      </Alert>
    );
  }
  return <Loaded token={token} />;
}
