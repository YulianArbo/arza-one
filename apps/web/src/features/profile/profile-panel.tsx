'use client';

import { meResponseSchema, type ChangePasswordRequest } from '@arza/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
} from '@arza/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type SubmitEvent, type JSX } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { CurrentPasswordField } from '../access/current-password-field';
import { NewPasswordFields, useNewPassword } from '../access/new-password-fields';
import { SubmitButton } from '../access/submit-button';
import { SESSIONS_PATH } from '../session/access-routes';
import { useSession } from '../session/session-provider';
import { SecondFactorCard } from './second-factor-card';

function useProfile() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => api.get('/v1/me', { schema: meResponseSchema, signal }),
  });
}

function ProfileData(): JSX.Element {
  const profile = useProfile();
  if (profile.isPending) return <LoadingState label="Cargando su perfil" />;
  if (profile.isError) {
    const apiError = profile.error instanceof ApiError ? profile.error : undefined;
    return (
      <ErrorState
        message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
        correlationId={apiError?.correlationId}
        onRetry={() => void profile.refetch()}
      />
    );
  }
  const rows: [string, string][] = [
    ['Nombre', profile.data.display_name ?? '—'],
    ['Correo', profile.data.email],
    ['Último ingreso', formatDateTime(profile.data.last_login_at)],
    ['Último cambio de contraseña', formatDateTime(profile.data.password_changed_at)],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-[max-content_1fr] sm:gap-x-6">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="font-medium break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function useChangePassword() {
  const api = useApiClient();
  const { session, endSession } = useSession();
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      api.post('/v1/me/password', { body, csrfToken: session.csrf_token }),
    onSuccess: () => {
      endSession('contrasena-cambiada');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isUnauthenticated) endSession('sesion-vencida');
    },
  });
}

function ChangePasswordForm(): JSX.Element {
  const change = useChangePassword();
  const password = useNewPassword();
  const [current, setCurrent] = useState('');
  const [missingCurrent, setMissingCurrent] = useState(false);

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    password.revealAll();
    setMissingCurrent(current === '');
    if (current === '' || !password.valid) return;
    change.mutate({ current_password: current, new_password: password.password });
  }

  return (
    <form noValidate onSubmit={submit} className="flex max-w-md flex-col gap-4">
      {change.isError ? <FormError error={change.error} /> : null}
      <CurrentPasswordField
        id="contrasena-actual"
        label="Contraseña actual"
        value={current}
        onChange={setCurrent}
        missingMessage={missingCurrent ? 'Escriba su contraseña actual.' : null}
      />
      <NewPasswordFields state={password} />
      <p className="text-sm text-muted-foreground">
        Al cambiarla se cerrarán todas sus sesiones, también esta, y tendrá que iniciar sesión de
        nuevo. Le avisaremos por correo.
      </p>
      <SubmitButton
        className="self-start"
        label="Cambiar contraseña"
        pendingLabel="Cambiando…"
        pending={change.isPending}
        done={change.isSuccess}
      />
    </form>
  );
}

/** Enlace a «Sesiones activas» (B09). */
function SessionsCard(): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sesiones activas</CardTitle>
        <CardDescription>
          Vea en qué equipos tiene abierta su cuenta y cierre las que no reconozca.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href={SESSIONS_PATH}>Ver sesiones activas</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Mi perfil y seguridad (16.7): datos, contraseña, segundo factor y sesiones activas. */
export function ProfilePanel(): JSX.Element {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sus datos</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileData />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cambiar la contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <SecondFactorCard />
      <SessionsCard />
    </div>
  );
}
