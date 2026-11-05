'use client';

import type { ChangePasswordRequest } from '@arza/contracts';
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
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type SubmitEvent, type JSX } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { CurrentPasswordField } from '../access/current-password-field';
import { NewPasswordFields, useNewPassword } from '../access/new-password-fields';
import { SubmitButton } from '../access/submit-button';
import { ImageField } from '../media/image-field';
import { MEDIA_KEYS, MY_PHOTO_PATH, useMe } from '../media/media-queries';
import { NTF_PATHS } from '../notifications/labels';
import { SESSIONS_PATH } from '../session/access-routes';
import { useSession } from '../session/session-provider';
import { MyRolesCard } from './my-roles-card';
import { SecondFactorCard } from './second-factor-card';

function ProfileData(): JSX.Element {
  const profile = useMe();
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

const PHOTO_TARGET = {
  uploads: '/v1/me/photo/uploads',
  image: MY_PHOTO_PATH,
  refresh: [MEDIA_KEYS.me],
};

/** Foto de perfil (B22A): la ven las demás personas en lugar de sus iniciales. */
function PhotoCard(): JSX.Element {
  const me = useMe().data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto de perfil</CardTitle>
        <CardDescription>Aparece en la barra superior en lugar de sus iniciales.</CardDescription>
      </CardHeader>
      <CardContent>
        {me === undefined ? (
          <LoadingState label="Cargando su foto" />
        ) : (
          <ImageField
            target={PHOTO_TARGET}
            name={me.display_name ?? me.email}
            hasImage={me.has_photo}
            noun="foto"
            editable
          />
        )}
      </CardContent>
    </Card>
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

/** Enlace a «Preferencias de aviso» (B16). */
function NotificationsCard(): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Avisos</CardTitle>
        <CardDescription>Decida qué avisos quiere recibir también por correo.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href={NTF_PATHS.preferences}>Preferencias de aviso</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Mi perfil y seguridad (16.7): datos, contraseña, segundo factor, sesiones activas y roles. */
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
      <PhotoCard />
      <SecondFactorCard />
      <SessionsCard />
      <NotificationsCard />
      <MyRolesCard />
    </div>
  );
}
