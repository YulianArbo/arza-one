'use client';

import {
  IAM_ERROR_CODES,
  secondFactorStatusResponseSchema,
  type SessionResponse,
} from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@arza/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type JSX, type SubmitEvent } from 'react';

import { ApiError } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { CurrentPasswordField } from '../access/current-password-field';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { loginPath } from '../session/access-routes';
import { isUnauthenticated } from '../session/session-provider';
import { SecondFactorProofFields, secondFactorProof, useProofInput } from './code-fields';

/** La API pide confirmar la identidad antes de la acción (numeral 15.1). */
export function needsReauthentication(error: unknown): boolean {
  return error instanceof ApiError && error.code === IAM_ERROR_CODES.reauthenticationRequired;
}

export const SECOND_FACTOR_STATUS_KEY = ['me', 'mfa'] as const;

function useHasSecondFactor(open: boolean): boolean {
  const api = useApiClient();
  const status = useQuery({
    queryKey: SECOND_FACTOR_STATUS_KEY,
    queryFn: ({ signal }) =>
      api.get('/v1/me/mfa', { schema: secondFactorStatusResponseSchema, signal }),
    enabled: open,
  });
  // Mientras no se sabe, se pide el código: es lo que necesitan los usuarios internos.
  return status.data?.enabled ?? true;
}

function useReauthenticate(session: SessionResponse, onDone: () => void) {
  const api = useApiClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (body: object) =>
      api.post('/v1/auth/reauthenticate', { body, csrfToken: session.csrf_token }),
    onSuccess: onDone,
    onError: (error) => {
      // Al quinto fallo la API cierra la sesión: hay que volver a entrar.
      const locked = error instanceof ApiError && error.code === IAM_ERROR_CODES.accountLocked;
      if (locked || isUnauthenticated(error)) router.replace(loginPath('sesion-vencida'));
    },
  });
}

interface ReauthFormProps {
  readonly session: SessionResponse;
  readonly withCode: boolean;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

function ReauthForm({ session, withCode, onDone, onCancel }: ReauthFormProps): JSX.Element {
  const reauth = useReauthenticate(session, onDone);
  const [password, setPassword] = useState('');
  const proof = useProofInput();
  const [missing, setMissing] = useState(false);
  const complete = password !== '' && (!withCode || proof.value.trim() !== '');
  const body = { password, ...(withCode ? secondFactorProof(proof.useRecovery, proof.value) : {}) };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setMissing(!complete);
    if (complete) reauth.mutate(body);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {reauth.isError ? <FormError error={reauth.error} /> : null}
      <CurrentPasswordField
        id="confirmar-contrasena"
        label="Contraseña"
        value={password}
        onChange={setPassword}
        missingMessage={missing ? 'Escriba su contraseña.' : null}
      />
      {withCode ? (
        <SecondFactorProofFields
          idPrefix="confirmar"
          useRecovery={proof.useRecovery}
          onToggle={proof.toggle}
          value={proof.value}
          onChange={proof.setValue}
          missingMessage={missing ? 'Escriba el código.' : null}
          recoveryLabel="Usar un código de recuperación"
        />
      ) : null}
      <ReauthActions pending={reauth.isPending} onCancel={onCancel} />
    </form>
  );
}

function ReauthActions({
  pending,
  onCancel,
}: {
  readonly pending: boolean;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancelar
      </Button>
      <SubmitButton label="Confirmar" pendingLabel="Confirmando…" pending={pending} />
    </DialogFooter>
  );
}

interface ReauthDialogProps {
  readonly session: SessionResponse;
  readonly open: boolean;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

/** «Confirme que es usted»: contraseña y, si tiene segundo factor, su código. Vale 30 minutos. */
export function ReauthDialog({ session, open, onDone, onCancel }: ReauthDialogProps): JSX.Element {
  const withCode = useHasSecondFactor(open);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirme que es usted</DialogTitle>
          <DialogDescription>
            Esta acción cambia la seguridad de su cuenta. Escriba su contraseña
            {withCode ? ' y el código de su aplicación' : ''} para continuar.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ReauthForm session={session} withCode={withCode} onDone={onDone} onCancel={onCancel} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export interface Reauthentication {
  /**
   * Si el error es «confirme que es usted», abre la ventana y, al confirmar, repite la acción.
   * Devuelve true si lo atendió.
   */
  readonly handle: (error: unknown, retry: () => void) => boolean;
  readonly dialog: JSX.Element;
}

/** Confirmación de identidad para las acciones de alto riesgo de una pantalla. */
export function useReauthentication(session: SessionResponse): Reauthentication {
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const handle = useCallback((error: unknown, action: () => void): boolean => {
    if (!needsReauthentication(error)) return false;
    setRetry(() => action);
    return true;
  }, []);
  const done = useCallback(() => {
    const action = retry;
    setRetry(null);
    action?.();
  }, [retry]);
  const dialog = (
    <ReauthDialog
      session={session}
      open={retry !== null}
      onDone={done}
      onCancel={() => {
        setRetry(null);
      }}
    />
  );
  return { handle, dialog };
}
