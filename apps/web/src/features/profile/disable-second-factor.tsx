'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import {
  SECOND_FACTOR_STATUS_KEY,
  needsReauthentication,
  useReauthentication,
} from '../second-factor/reauthentication';
import { useSession } from '../session/session-provider';

/**
 * Desactivar el segundo factor (solo si es opcional). Pide confirmación que nombra la
 * consecuencia (16.5) y, si hace falta, confirmar la identidad.
 */
export function DisableSecondFactor(): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const reauth = useReauthentication(session);
  const disable = useMutation({
    mutationFn: () => api.post('/v1/me/mfa/disable', { body: {}, csrfToken: session.csrf_token }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SECOND_FACTOR_STATUS_KEY }),
  });
  const run = (): void => {
    disable.mutate(undefined, {
      onError: (error) => {
        reauth.handle(error, run);
      },
    });
  };
  return (
    <>
      <ConfirmActionButton
        label="Desactivar"
        title="¿Desactivar el segundo factor?"
        description="Desde ahora se entrará a su cuenta solo con la contraseña. Sus códigos de recuperación dejarán de servir y se cerrarán sus demás sesiones. Le avisaremos por correo."
        confirmLabel="Sí, desactivar"
        variant="destructive"
        disabled={disable.isPending}
        onConfirm={run}
      />
      {disable.isError && !needsReauthentication(disable.error) ? (
        <FormError error={disable.error} />
      ) : null}
      {reauth.dialog}
    </>
  );
}
