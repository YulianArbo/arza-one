'use client';

import { sessionResponseSchema, type LoginRequest } from '@arza/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type SubmitEvent, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { ACCESS_PATHS, loginNoticeOf, safeReturnPath } from '../session/access-routes';
import { SESSION_QUERY_KEY } from '../session/session-provider';
import { AccessCard } from './access-card';
import { AccessLink } from './access-links';
import { EmailField } from './email-field';
import { FormError, FormSuccess } from './form-alert';
import { CurrentPasswordField } from './current-password-field';
import { SubmitButton } from './submit-button';

function useLogin() {
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const returnTo = useSearchParams().get('volver');
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      api.post('/v1/auth/login', { body, schema: sessionResponseSchema }),
    onSuccess: (session) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, session);
      router.replace(safeReturnPath(returnTo, session.user.kind));
    },
  });
}

function isComplete(email: string, password: string): boolean {
  return email.trim() !== '' && password !== '';
}

const LOGIN_DESCRIPTION = 'Entre a ARZA ONE con el correo y la contraseña de su cuenta.';

/** Inicio de sesión (16.7). El mensaje de error no dice si el correo existe (15.1). */
export function LoginForm(): JSX.Element {
  const notice = loginNoticeOf(useSearchParams().get('motivo'));
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState(false);

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMissing(!isComplete(email, password));
    if (isComplete(email, password)) login.mutate({ email, password });
  }

  return (
    <AccessCard title="Iniciar sesión" description={LOGIN_DESCRIPTION}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {notice !== null && !login.isError ? <FormSuccess message={notice} /> : null}
        {login.isError ? <FormError error={login.error} /> : null}
        <EmailField
          value={email}
          onChange={setEmail}
          showMissing={missing}
          autoComplete="username"
        />
        <CurrentPasswordField
          id="contrasena"
          label="Contraseña"
          value={password}
          onChange={setPassword}
          missingMessage={missing ? 'Escriba su contraseña.' : null}
        />
        <SubmitButton
          label="Iniciar sesión"
          pendingLabel="Verificando…"
          pending={login.isPending}
          done={login.isSuccess}
        />
        <AccessLink href={ACCESS_PATHS.forgot}>¿Olvidó su contraseña?</AccessLink>
      </form>
    </AccessCard>
  );
}
