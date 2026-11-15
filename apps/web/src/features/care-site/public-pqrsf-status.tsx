'use client';

import {
  PQRSF_STATUSES,
  PQRSF_TYPES,
  publicPqrsfStatusSchema,
  type PublicPqrsfStatus,
} from '@arza/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, FormField } from '@arza/ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';

// Consultar el estado de una PQRSF en el sitio público (B29, decisión 4): con el radicado y el
// correo con que se radicó. Si ya se respondió, muestra la respuesta.

const SUMMARY_FIELDS = [
  { field: 'code', id: 'consulta-radicado', label: 'Radicado' },
  { field: 'email', id: 'consulta-correo', label: 'Correo' },
];

const CODE = /^PQRSF-\d{4}-\d{4,8}$/u;

function problemsOf(code: string, email: string): Record<string, string> {
  const found: Record<string, string> = {};
  if (!CODE.test(code.trim().toUpperCase())) {
    found['code'] = 'Escriba el radicado como aparece en el acuse: PQRSF-2026-0001.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()))
    found['email'] = 'Escriba el correo con que radicó.';
  return found;
}

function StatusCard({ status }: { readonly status: PublicPqrsfStatus }): JSX.Element {
  const done = status.status === 'responded' || status.status === 'closed';
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          {PQRSF_TYPES[status.type]} {status.code}
        </CardTitle>
        <Badge tone={done ? 'success' : 'info'}>{PQRSF_STATUSES[status.status]}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>Radicada el {formatDateTime(status.received_at)}.</p>
        <p>Fecha límite de respuesta: {formatDate(status.due_on)}.</p>
        {status.response === null ? (
          <p className="text-muted-foreground">
            Todavía la estamos tramitando. Cuando la respondamos, le llegará la respuesta al correo.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              Respuesta del{' '}
              {status.responded_at === null ? '' : formatDateTime(status.responded_at)}:
            </p>
            <p className="whitespace-pre-line">{status.response}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** La consulta: radicado, correo, problemas y la respuesta de la API. */
function useLookup() {
  const api = useApiClient();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const lookup = useMutation({
    mutationFn: (body: object) =>
      api.post('/v1/public/pqrsf/status', { body, schema: publicPqrsfStatusSchema }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(code, email);
    setProblems(found);
    if (Object.keys(found).length === 0) {
      lookup.mutate({ code: code.trim().toUpperCase(), email: email.trim() });
    }
  };
  return { code, setCode, email, setEmail, problems, lookup, submit };
}

function LookupFields(props: { readonly form: ReturnType<typeof useLookup> }): JSX.Element {
  const { form } = props;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField
        id="consulta-radicado"
        label="Radicado"
        value={form.code}
        error={form.problems['code'] ?? null}
        onChange={(event) => {
          form.setCode(event.target.value);
        }}
      />
      <FormField
        id="consulta-correo"
        label="Correo con que radicó"
        type="email"
        autoComplete="email"
        value={form.email}
        error={form.problems['email'] ?? null}
        onChange={(event) => {
          form.setEmail(event.target.value);
        }}
      />
    </div>
  );
}

export function PublicPqrsfStatusLookup(): JSX.Element {
  const form = useLookup();
  const { lookup } = form;
  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
        <FormSummary problems={form.problems} fields={SUMMARY_FIELDS} />
        {lookup.isError ? <FormError error={lookup.error} /> : null}
        <LookupFields form={form} />
        <SubmitButton label="Consultar" pendingLabel="Consultando…" pending={lookup.isPending} />
      </form>
      {lookup.data === undefined ? null : <StatusCard status={lookup.data} />}
    </div>
  );
}
