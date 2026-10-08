'use client';

import { ErrorState, LoadingState } from '@arza/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent, type JSX, type ReactNode } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { ACCESS_PATHS, loginPath, type LoginNotice } from '../session/access-routes';
import { AccessCard } from './access-card';
import { AccessLink } from './access-links';
import { FormError } from './form-alert';
import { FormField } from './form-field';
import { useLinkToken } from './link-token';
import { NewPasswordFields, useNewPassword } from './new-password-fields';
import { SubmitButton } from './submit-button';

// Pantallas que se abren desde el enlace de un correo: activar la cuenta y crear una contraseña
// nueva. La llave del enlace sirve una sola vez (numeral 15.1).

interface LinkPageProps {
  readonly title: string;
  readonly description: string;
  readonly children: (token: string) => ReactNode;
}

function LinkPage({ title, description, children }: LinkPageProps): JSX.Element {
  const token = useLinkToken();
  if (token === undefined) return <LoadingState label="Revisando el enlace" />;
  return (
    <AccessCard title={title} description={description}>
      {token === null ? <MissingToken /> : children(token)}
    </AccessCard>
  );
}

function MissingToken(): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <ErrorState
        title="El enlace no está completo"
        message="Abra el enlace tal como llegó en el correo. Si sigue sin funcionar, pida uno nuevo."
      />
      <AccessLink href={ACCESS_PATHS.forgot}>Pedir un enlace nuevo</AccessLink>
    </div>
  );
}

function useLinkSubmit<Body extends object>(path: string, notice: LoginNotice) {
  const api = useApiClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (body: Body) => api.post(path, { body }),
    onSuccess: () => {
      router.replace(loginPath(notice));
    },
  });
}

function ActivateForm({ token }: { readonly token: string }): JSX.Element {
  const submit = useLinkSubmit<object>('/v1/auth/invitation/accept', 'cuenta-activada');
  const password = useNewPassword();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const nameError = name.trim().length < 2 ? 'Escriba su nombre.' : null;

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    password.revealAll();
    setNameTouched(true);
    if (!password.valid || nameError !== null) return;
    submit.mutate({ token, display_name: name.trim(), password: password.password });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {submit.isError ? <FormError error={submit.error} /> : null}
      <FormField
        id="nombre"
        label="Su nombre"
        autoComplete="name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        onBlur={() => {
          setNameTouched(true);
        }}
        error={nameTouched ? nameError : null}
      />
      <NewPasswordFields state={password} label="Contraseña" />
      <SubmitButton
        label="Activar cuenta"
        pendingLabel="Activando…"
        pending={submit.isPending}
        done={submit.isSuccess}
      />
    </form>
  );
}

function ResetForm({ token }: { readonly token: string }): JSX.Element {
  const submit = useLinkSubmit<object>('/v1/auth/password/reset', 'contrasena-restablecida');
  const password = useNewPassword();

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    password.revealAll();
    if (password.valid) submit.mutate({ token, password: password.password });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {submit.isError ? <FormError error={submit.error} /> : null}
      <NewPasswordFields state={password} />
      <SubmitButton
        label="Guardar contraseña"
        pendingLabel="Guardando…"
        pending={submit.isPending}
        done={submit.isSuccess}
      />
    </form>
  );
}

/** Activar la cuenta con el enlace de la invitación (16.7). */
export function ActivateAccount(): JSX.Element {
  return (
    <LinkPage
      title="Activar su cuenta"
      description="Escriba su nombre y elija la contraseña con la que entrará a ARZA ONE."
    >
      {(token) => <ActivateForm token={token} />}
    </LinkPage>
  );
}

/** Crear una contraseña nueva con el enlace de recuperación (16.7). */
export function ResetPassword(): JSX.Element {
  return (
    <LinkPage
      title="Crear una contraseña nueva"
      description="Al guardarla se cerrarán todas sus sesiones abiertas."
    >
      {(token) => <ResetForm token={token} />}
    </LinkPage>
  );
}
