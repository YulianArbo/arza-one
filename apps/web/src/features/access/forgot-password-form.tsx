'use client';

import { acknowledgementResponseSchema } from '@arza/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { ACCESS_PATHS } from '../session/access-routes';
import { AccessCard } from './access-card';
import { AccessLink } from './access-links';
import { EmailField } from './email-field';
import { FormError, FormSuccess } from './form-alert';
import { SubmitButton } from './submit-button';

/**
 * Recuperar la contraseña (16.7). La respuesta es la misma exista o no la cuenta (15.1): la web
 * muestra el mensaje que entrega la API.
 */
export function ForgotPasswordForm(): JSX.Element {
  const api = useApiClient();
  const request = useMutation({
    mutationFn: (email: string) =>
      api.post('/v1/auth/password/forgot', {
        body: { email },
        schema: acknowledgementResponseSchema,
      }),
  });
  const [email, setEmail] = useState('');
  const [missing, setMissing] = useState(false);

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMissing(email.trim() === '');
    if (email.trim() !== '') request.mutate(email);
  }

  return (
    <AccessCard
      title="Recuperar su contraseña"
      description="Escriba el correo de su cuenta y le enviaremos un enlace para crear una contraseña nueva."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {request.isError ? <FormError error={request.error} /> : null}
        {request.isSuccess ? <FormSuccess message={request.data.message} /> : null}
        <EmailField value={email} onChange={setEmail} showMissing={missing} autoComplete="email" />
        <SubmitButton label="Enviar enlace" pendingLabel="Enviando…" pending={request.isPending} />
        <AccessLink href={ACCESS_PATHS.login}>Volver a iniciar sesión</AccessLink>
      </form>
    </AccessCard>
  );
}
