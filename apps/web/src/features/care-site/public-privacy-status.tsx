'use client';

import {
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_RIGHTS,
  publicPrivacyStatusRequestSchema,
  publicPrivacyStatusSchema,
  type PublicPrivacyStatus,
} from '@arza/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, FormField } from '@arza/ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';

// Consultar el estado de una solicitud de titular en el sitio público (B42): con el código y el
// correo con que se presentó. Si falta información, la muestra; si ya se respondió, la respuesta.

const FIELDS = [
  { field: 'code', id: 'consulta-titular-codigo', label: 'Código' },
  { field: 'email', id: 'consulta-titular-correo', label: 'Correo' },
];

function problemsOf(code: string, email: string): Record<string, string> {
  const parsed = publicPrivacyStatusRequestSchema.safeParse({ code, email });
  if (parsed.success) return {};
  const found: Record<string, string> = {};
  for (const issue of parsed.error.issues) found[String(issue.path[0] ?? '')] ??= issue.message;
  return found;
}

function Pending({ status }: { readonly status: PublicPrivacyStatus }): JSX.Element {
  if (status.requirement !== null) {
    return (
      <p>
        Para seguir necesitamos que nos envíe: <strong>{status.requirement}</strong>. Mientras tanto
        el plazo está suspendido.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      La estamos tramitando; le responderemos a más tardar el {formatDate(status.due_on)}.
    </p>
  );
}

function StatusCard({ status }: { readonly status: PublicPrivacyStatus }): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          {PRIVACY_RIGHTS[status.right]} · {status.code}
        </CardTitle>
        <Badge tone={status.response === null ? 'info' : 'success'}>
          {PRIVACY_REQUEST_STATUSES[status.status]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>Recibida el {formatDateTime(status.received_at)}.</p>
        {status.response === null ? (
          <Pending status={status} />
        ) : (
          <div className="flex flex-col gap-1">
            <p className="font-medium">Respuesta del {formatDateTime(status.responded_at)}:</p>
            <p className="whitespace-pre-line">{status.response}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Fields(props: {
  readonly code: string;
  readonly email: string;
  readonly problems: Record<string, string>;
  readonly onCode: (value: string) => void;
  readonly onEmail: (value: string) => void;
}): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField
        id="consulta-titular-codigo"
        label="Código (PRV-…)"
        value={props.code}
        error={props.problems['code'] ?? null}
        onChange={(event) => {
          props.onCode(event.target.value);
        }}
      />
      <FormField
        id="consulta-titular-correo"
        label="Correo con que la presentó"
        type="email"
        autoComplete="email"
        value={props.email}
        error={props.problems['email'] ?? null}
        onChange={(event) => {
          props.onEmail(event.target.value);
        }}
      />
    </div>
  );
}

export function PublicPrivacyStatusLookup(): JSX.Element {
  const api = useApiClient();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const lookup = useMutation({
    mutationFn: (body: object) =>
      api.post('/v1/public/privacy-requests/status', { body, schema: publicPrivacyStatusSchema }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(code, email);
    setProblems(found);
    if (Object.keys(found).length === 0)
      lookup.mutate(publicPrivacyStatusRequestSchema.parse({ code, email }));
  };
  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <FormSummary problems={problems} fields={FIELDS} />
        {lookup.isError ? <FormError error={lookup.error} /> : null}
        <Fields code={code} email={email} problems={problems} onCode={setCode} onEmail={setEmail} />
        <SubmitButton label="Consultar" pendingLabel="Consultando…" pending={lookup.isPending} />
      </form>
      {lookup.data === undefined ? null : <StatusCard status={lookup.data} />}
    </div>
  );
}
