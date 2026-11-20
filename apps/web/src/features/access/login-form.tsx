'use client';

import { sessionResponseSchema, type LoginRequest } from '@arza/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type JSX, type ReactNode, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import {
  ACCESS_PATHS,
  loginNoticeOf,
  safeReturnPath,
  secondFactorPath,
} from '../session/access-routes';
import { SESSION_QUERY_KEY } from '../session/session-provider';
import { AccessCard } from './access-card';
import { useAudience } from './audience-context';
import { AUDIENCE_DESCRIPTIONS, AudienceSwitch } from './audience-switch';
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
      // Con segundo factor (B09), la contraseña solo es el primer paso.
      router.replace(
        session.stage === 'complete'
          ? safeReturnPath(returnTo, session.user.kind)
          : secondFactorPath(session.stage, returnTo),
      );
    },
  });
}

function isComplete(email: string, password: string): boolean {
  return email.trim() !== '' && password !== '';
}

/** Encabezado del inicio de sesión con el selector de tipo de acceso (B22A). */
function LoginCard({ children }: { readonly children: ReactNode }): JSX.Element {
  const { audience, setAudience } = useAudience();
  return (
    <AccessCard title="Iniciar sesión" description={AUDIENCE_DESCRIPTIONS[audience]}>
      <AudienceSwitch value={audience} onChange={setAudience} />
      {children}
      <InvitationHelp />
    </AccessCard>
  );
}

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
    <LoginCard>
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
    </LoginCard>
  );
}

function InvitationHelp(): JSX.Element {
  return (
    <p className="text-sm text-muted-foreground">
      Si acaba de recibir una invitación, abra primero el enlace del correo y cree su contraseña. Si
      no encuentra la invitación, pida que se la reenvíen.
    </p>
  );
}
