'use client';

import {
  IAM_ERROR_CODES,
  secondFactorConfirmResponseSchema,
  secondFactorSetupResponseSchema,
  type SessionResponse,
} from '@arza/contracts';
import { ErrorState, LoadingState } from '@arza/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { AccessCard } from '../access/access-card';
import { loginPath, safeReturnPath } from '../session/access-routes';
import { SESSION_QUERY_KEY, isUnauthenticated } from '../session/session-provider';
import {
  SECOND_FACTOR_STATUS_KEY,
  needsReauthentication,
  useReauthentication,
} from './reauthentication';
import { RecoveryCodesPanel } from './recovery-codes-panel';
import { IntroStep, ScanStep } from './setup-steps';
import { useSigningInSession } from './use-signing-in-session';

function isSetupExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === IAM_ERROR_CODES.secondFactorSetupExpired;
}

function useSetupMutations(session: SessionResponse) {
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const csrfToken = session.csrf_token;
  const onError = (error: unknown): void => {
    if (isUnauthenticated(error)) router.replace(loginPath('sesion-vencida'));
  };
  const start = useMutation({
    mutationFn: () =>
      api.post('/v1/auth/mfa/setup', {
        body: {},
        schema: secondFactorSetupResponseSchema,
        csrfToken,
      }),
    onError,
  });
  const confirm = useMutation({
    mutationFn: (code: string) =>
      api.post('/v1/auth/mfa/setup/confirm', {
        body: { code },
        schema: secondFactorConfirmResponseSchema,
        csrfToken,
      }),
    onSuccess: (confirmed) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, confirmed.session);
      void queryClient.invalidateQueries({ queryKey: SECOND_FACTOR_STATUS_KEY });
    },
    onError,
  });
  return { start, confirm };
}

interface SetupFlowProps {
  readonly session: SessionResponse;
  readonly returnTo: string | null;
}

/** Paso 3: los códigos de recuperación; después vuelve a donde iba. */
function FinishStep({
  codes,
  session,
  returnTo,
}: SetupFlowProps & { readonly codes: readonly string[] }): JSX.Element {
  const router = useRouter();
  return (
    <RecoveryCodesPanel
      codes={codes}
      email={session.user.email}
      continueLabel="Continuar"
      onContinue={() => {
        router.replace(safeReturnPath(returnTo, session.user.kind));
      }}
    />
  );
}

function SetupFlow({ session, returnTo }: SetupFlowProps): JSX.Element {
  const { start, confirm } = useSetupMutations(session);
  const reauth = useReauthentication(session);
  const begin = (): void => {
    confirm.reset();
    // Desde el perfil, la API puede pedir confirmar la identidad antes de empezar.
    start.mutate(undefined, {
      onError: (error) => {
        reauth.handle(error, begin);
      },
    });
  };
  if (confirm.isSuccess) {
    const codes = confirm.data.recovery_codes;
    return <FinishStep codes={codes} session={session} returnTo={returnTo} />;
  }
  // Si la configuración venció, se vuelve a empezar con un QR nuevo.
  const expired = confirm.isError && isSetupExpired(confirm.error);
  if (start.data === undefined || expired) {
    const startError = start.isError && !needsReauthentication(start.error) ? start.error : null;
    return (
      <>
        <IntroStep
          pending={start.isPending}
          error={expired ? confirm.error : startError}
          onStart={begin}
        />
        {reauth.dialog}
      </>
    );
  }
  return (
    <ScanStep
      setup={start.data}
      pending={confirm.isPending}
      error={confirm.isError ? confirm.error : null}
      onConfirm={(code) => {
        confirm.mutate(code);
      }}
    />
  );
}

const DESCRIPTION =
  'Con el segundo factor, además de su contraseña se le pedirá un código de su celular. Así, nadie puede entrar a su cuenta solo con la contraseña.';

/** Configurar el segundo factor (16.7, B09): al iniciar sesión, o desde «Mi perfil». */
export function SecondFactorSetup(): JSX.Element {
  const { query, ready, returnTo } = useSigningInSession('second_factor_setup', true);
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
    <AccessCard title="Configurar el segundo factor" description={DESCRIPTION}>
      <SetupFlow session={ready} returnTo={returnTo} />
    </AccessCard>
  );
}
