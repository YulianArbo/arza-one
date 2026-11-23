'use client';

import {
  platformTermsStatusSchema,
  type PublicLegalText,
  type SessionResponse,
} from '@arza/contracts';
import { Checkbox, LoadingState } from '@arza/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDayOf } from '../../lib/format/date-time';
import { AccessCard } from '../access/access-card';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { loginPath, safeReturnPath } from '../session/access-routes';
import { SESSION_QUERY_KEY, isUnauthenticated, useSessionQuery } from '../session/session-provider';
import { SiteBlocks } from '../site/site-blocks';

// Aceptar los términos de uso de la plataforma (B41, decisión 3; numeral 20.2): cuando se publica
// una versión nueva, cada persona interna la lee y la acepta en su siguiente ingreso. Hasta
// aceptarla, la API solo atiende su cuenta propia. La aceptación queda registrada con la versión.

function useAccept(session: SessionResponse, returnTo: string | null) {
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (textId: string) =>
      api.post('/v1/me/platform-terms/accept', {
        body: { text_id: textId },
        csrfToken: session.csrf_token,
      }),
    onSuccess: () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, { ...session, terms_pending: false });
      router.replace(safeReturnPath(returnTo, session.user.kind));
    },
  });
}

function AcceptBox(props: {
  readonly checked: boolean;
  readonly missing: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="terminos-acepta" className="flex items-start gap-2 text-sm">
        <Checkbox
          id="terminos-acepta"
          className="mt-0.5"
          checked={props.checked}
          aria-invalid={props.missing ? true : undefined}
          aria-describedby={props.missing ? 'terminos-acepta-error' : undefined}
          onChange={(event) => {
            props.onChange(event.target.checked);
          }}
        />
        <span>He leído y acepto los términos de uso de la plataforma.</span>
      </label>
      {props.missing ? (
        <p id="terminos-acepta-error" className="text-sm text-destructive">
          Para continuar, marque la casilla.
        </p>
      ) : null}
    </div>
  );
}

function TermsForm(props: {
  readonly session: SessionResponse;
  readonly terms: PublicLegalText;
  readonly returnTo: string | null;
}): JSX.Element {
  const accept = useAccept(props.session, props.returnTo);
  const [checked, setChecked] = useState(false);
  const [missing, setMissing] = useState(false);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setMissing(!checked);
    if (checked) accept.mutate(props.terms.id);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {accept.isError ? <FormError error={accept.error} /> : null}
      <div className="rounded-lg border p-4 text-sm">
        <SiteBlocks body={props.terms.body} />
      </div>
      <AcceptBox checked={checked} missing={missing} onChange={setChecked} />
      <SubmitButton
        label="Aceptar y continuar"
        pendingLabel="Guardando…"
        pending={accept.isPending}
      />
    </form>
  );
}

export function AcceptTerms(): JSX.Element {
  const api = useApiClient();
  const router = useRouter();
  const returnTo = useSearchParams().get('volver');
  const session = useSessionQuery();
  const status = useQuery({
    queryKey: ['me', 'platform-terms'],
    enabled: session.data !== undefined,
    queryFn: ({ signal }) =>
      api.get('/v1/me/platform-terms', { schema: platformTermsStatusSchema, signal }),
  });
  const done = status.data !== undefined && (!status.data.pending || status.data.terms === null);
  useEffect(() => {
    if (isUnauthenticated(session.error)) router.replace(loginPath('sesion-vencida'));
    else if (done && session.data !== undefined)
      router.replace(safeReturnPath(returnTo, session.data.user.kind));
  }, [session.error, session.data, done, returnTo, router]);
  if (status.isError) return <FormError error={status.error} />;
  const terms = status.data?.terms ?? null;
  if (session.data === undefined || terms === null || done) {
    return <LoadingState label="Cargando los términos" />;
  }
  return (
    <AccessCard
      title={terms.title}
      description={`Versión ${String(terms.version_number)}, vigente desde el ${formatDayOf(terms.effective_from)}. Léala y acéptela para continuar.`}
    >
      <TermsForm session={session.data} terms={terms} returnTo={returnTo} />
    </AccessCard>
  );
}
