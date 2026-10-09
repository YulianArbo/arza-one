'use client';

import { sessionResponseSchema, type SessionResponse } from '@arza/contracts';
import { ErrorState, LoadingState } from '@arza/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { AccessCard } from '../access/access-card';
import { AccessLink } from '../access/access-links';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { ACCESS_PATHS, loginPath, safeReturnPath } from '../session/access-routes';
import { SESSION_QUERY_KEY, isUnauthenticated } from '../session/session-provider';
import { SecondFactorProofFields, secondFactorProof } from './code-fields';
import { useSigningInSession } from './use-signing-in-session';

function useVerify(session: SessionResponse, returnTo: string | null) {
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string } | { recovery_code: string }) =>
      api.post('/v1/auth/mfa/verify', {
        body,
        schema: sessionResponseSchema,
        csrfToken: session.csrf_token,
      }),
    onSuccess: (completed) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, completed);
      router.replace(safeReturnPath(returnTo, completed.user.kind));
    },
    onError: (error) => {
      // Los 10 minutos para el segundo paso vencieron: hay que empezar de nuevo.
      if (isUnauthenticated(error)) router.replace(loginPath('sesion-vencida'));
    },
  });
}

interface VerifyFormProps {
  readonly session: SessionResponse;
  readonly returnTo: string | null;
}

function VerifyForm({ session, returnTo }: VerifyFormProps): JSX.Element {
  const verify = useVerify(session, returnTo);
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [missing, setMissing] = useState(false);

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMissing(value.trim() === '');
    if (value.trim() !== '') verify.mutate(secondFactorProof(useRecovery, value));
  }

  function toggle(): void {
    setUseRecovery(!useRecovery);
    setValue('');
    setMissing(false);
    verify.reset();
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {verify.isError ? <FormError error={verify.error} /> : null}
      <SecondFactorProofFields
        idPrefix="segundo-paso"
        useRecovery={useRecovery}
        onToggle={toggle}
        value={value}
        onChange={setValue}
        missingMessage={missing ? 'Escriba el código.' : null}
        recoveryLabel="No tengo el celular: usar un código de recuperación"
      />
      <SubmitButton
        label="Verificar"
        pendingLabel="Verificando…"
        pending={verify.isPending}
        done={verify.isSuccess}
      />
      <AccessLink href={ACCESS_PATHS.login}>Volver a iniciar sesión</AccessLink>
    </form>
  );
}

const DESCRIPTION =
  'Por seguridad, escriba el código que muestra su aplicación de autenticación. Si no tiene el celular, use uno de sus códigos de recuperación.';

/** Segundo factor (16.7, B09): el segundo paso del inicio de sesión. */
export function SecondFactorForm(): JSX.Element {
  const { query, ready, returnTo } = useSigningInSession('second_factor');
  if (query.error !== null && !isUnauthenticated(query.error)) {
    const apiError = query.error instanceof ApiError ? query.error : undefined;
    return (
      <ErrorState
        message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
        correlationId={apiError?.correlationId}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (ready === null) return <LoadingState label="Verificando su sesión" />;
  return (
    <AccessCard title="Segundo factor" description={DESCRIPTION}>
      <VerifyForm session={ready} returnTo={returnTo} />
    </AccessCard>
  );
}
