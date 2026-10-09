'use client';

import {
  recoveryCodesResponseSchema,
  secondFactorStatusResponseSchema,
  type SecondFactorStatusResponse,
} from '@arza/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ErrorState,
  LoadingState,
} from '@arza/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { JSX } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import {
  SECOND_FACTOR_STATUS_KEY,
  needsReauthentication,
  useReauthentication,
} from '../second-factor/reauthentication';
import { RecoveryCodesPanel } from '../second-factor/recovery-codes-panel';
import { PROFILE_PATH, secondFactorPath } from '../session/access-routes';
import { useSession } from '../session/session-provider';
import { DisableSecondFactor } from './disable-second-factor';

/** Quedan pocos códigos de recuperación: se recomienda generar otros. */
const FEW_CODES = 3;
const SETUP_FROM_PROFILE = secondFactorPath('second_factor_setup', PROFILE_PATH);

function useSecondFactorStatus() {
  const api = useApiClient();
  return useQuery({
    queryKey: SECOND_FACTOR_STATUS_KEY,
    queryFn: ({ signal }) =>
      api.get('/v1/me/mfa', { schema: secondFactorStatusResponseSchema, signal }),
  });
}

function useRegenerateCodes() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: () =>
      api.post('/v1/me/mfa/recovery-codes', {
        body: {},
        schema: recoveryCodesResponseSchema,
        csrfToken: session.csrf_token,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SECOND_FACTOR_STATUS_KEY }),
  });
}

function StatusText({ status }: { readonly status: SecondFactorStatusResponse }): JSX.Element {
  if (!status.enabled) {
    return (
      <p className="text-sm">
        No lo tiene activado. Le recomendamos activarlo: protege su cuenta aunque alguien conozca su
        contraseña.
      </p>
    );
  }
  const few = status.recovery_codes_remaining <= FEW_CODES;
  return (
    <div className="space-y-1 text-sm">
      <p>Activo desde el {formatDateTime(status.confirmed_at)}</p>
      <p className={few ? 'font-medium text-warning' : undefined}>
        Códigos de recuperación disponibles: {status.recovery_codes_remaining}
        {few ? '. Le quedan pocos: genere códigos nuevos.' : ''}
      </p>
      <p className="text-muted-foreground">
        {status.required
          ? 'Es obligatorio para su tipo de usuario.'
          : 'Es opcional para su tipo de usuario.'}
      </p>
    </div>
  );
}

function EnabledActions({ status }: { readonly status: SecondFactorStatusResponse }): JSX.Element {
  const { session } = useSession();
  const regenerate = useRegenerateCodes();
  const reauth = useReauthentication(session);
  const run = (): void => {
    regenerate.mutate(undefined, {
      onError: (error) => {
        reauth.handle(error, run);
      },
    });
  };
  const showError = regenerate.isError && !needsReauthentication(regenerate.error);
  return (
    <div className="flex flex-col gap-3">
      {showError ? <FormError error={regenerate.error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={regenerate.isPending} onClick={run}>
          {regenerate.isPending ? 'Generando…' : 'Generar códigos nuevos'}
        </Button>
        <Button asChild variant="outline">
          <Link href={SETUP_FROM_PROFILE}>Cambiar de celular</Link>
        </Button>
        {status.required ? null : <DisableSecondFactor />}
      </div>
      <NewCodesDialog
        codes={regenerate.data?.recovery_codes ?? null}
        email={session.user.email}
        onClose={() => {
          regenerate.reset();
        }}
      />
      {reauth.dialog}
    </div>
  );
}

interface NewCodesDialogProps {
  /** Códigos recién generados; null mientras no hay. */
  readonly codes: readonly string[] | null;
  readonly email: string;
  readonly onClose: () => void;
}

/** Muestra una sola vez los códigos nuevos. */
function NewCodesDialog({ codes, email, onClose }: NewCodesDialogProps): JSX.Element {
  return (
    <Dialog
      open={codes !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sus códigos de recuperación nuevos</DialogTitle>
          <DialogDescription>Los anteriores ya no sirven.</DialogDescription>
        </DialogHeader>
        <RecoveryCodesPanel
          codes={codes ?? []}
          email={email}
          continueLabel="Listo"
          onContinue={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function SecondFactorContent(): JSX.Element {
  const status = useSecondFactorStatus();
  if (status.isPending) return <LoadingState label="Cargando su segundo factor" />;
  if (status.isError) {
    const apiError = status.error instanceof ApiError ? status.error : undefined;
    return (
      <ErrorState
        message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
        correlationId={apiError?.correlationId}
        onRetry={() => void status.refetch()}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <StatusText status={status.data} />
      {status.data.enabled ? (
        <EnabledActions status={status.data} />
      ) : (
        <Button asChild className="self-start">
          <Link href={SETUP_FROM_PROFILE}>Activar el segundo factor</Link>
        </Button>
      )}
    </div>
  );
}

/** Segundo factor en «Mi perfil y seguridad» (16.7, B09). */
export function SecondFactorCard(): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Segundo factor</CardTitle>
        <CardDescription>
          El código de su celular que se pide después de la contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SecondFactorContent />
      </CardContent>
    </Card>
  );
}
