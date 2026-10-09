'use client';

import {
  activeSessionsResponseSchema,
  closedSessionsResponseSchema,
  type ActiveSession,
} from '@arza/contracts';
import { Badge, Card, CardContent, ErrorState, LoadingState } from '@arza/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor } from 'lucide-react';
import { useState, type JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError, FormSuccess } from '../access/form-alert';
import { useSession } from '../session/session-provider';

const SESSIONS_KEY = ['me', 'sessions'] as const;

/** «Chrome en Windows», con lo que informó el navegador de ese equipo. */
function deviceName(session: ActiveSession): string {
  return `${session.browser ?? 'Navegador desconocido'} en ${session.os ?? 'sistema desconocido'}`;
}

function useActiveSessions() {
  const api = useApiClient();
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: ({ signal }) =>
      api.get('/v1/me/sessions', { schema: activeSessionsResponseSchema, signal }),
  });
}

/** Cierra una sesión o todas las demás; la lista se actualiza al terminar. */
function useCloseSessions(onClosed: (message: string) => void) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { session, endSession } = useSession();
  const csrfToken = session.csrf_token;
  const options = {
    onSettled: () => void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.isUnauthenticated) endSession('sesion-vencida');
    },
  };
  const one = useMutation({
    mutationFn: (target: ActiveSession) =>
      api.post(`/v1/me/sessions/${target.id}/revoke`, { body: {}, csrfToken }),
    onSuccess: (_result, target) => {
      onClosed(
        `Cerramos la sesión de ${deviceName(target)}. Ese equipo tendrá que iniciar sesión de nuevo.`,
      );
    },
    ...options,
  });
  const others = useMutation({
    mutationFn: () =>
      api.post('/v1/me/sessions/revoke-others', {
        body: {},
        schema: closedSessionsResponseSchema,
        csrfToken,
      }),
    onSuccess: ({ closed }) => {
      onClosed(closed === 1 ? 'Cerramos 1 sesión.' : `Cerramos ${String(closed)} sesiones.`);
    },
    ...options,
  });
  return { one, others };
}

interface SessionRowProps {
  readonly session: ActiveSession;
  readonly onClose: (session: ActiveSession) => void;
  readonly busy: boolean;
}

function SessionRow({ session, onClose, busy }: SessionRowProps): JSX.Element {
  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-start">
      <Monitor aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {deviceName(session)}
          {session.current ? <Badge tone="success">Esta sesión</Badge> : null}
          {session.pending_second_factor ? (
            <Badge tone="warning">Sin segundo factor todavía</Badge>
          ) : null}
        </p>
        <p className="text-sm text-muted-foreground">
          Inició el {formatDateTime(session.created_at)} · Última actividad el{' '}
          {formatDateTime(session.last_seen_at)} · Dirección IP {session.ip ?? 'desconocida'}
        </p>
      </div>
      {session.current ? null : (
        <ConfirmActionButton
          confirmLabel="Sí, cerrar"
          label="Cerrar sesión"
          title={`¿Cerrar la sesión de ${deviceName(session)}?`}
          description="Ese equipo tendrá que iniciar sesión de nuevo para seguir usando ARZA ONE."
          disabled={busy}
          onConfirm={() => {
            onClose(session);
          }}
        />
      )}
    </li>
  );
}

function SessionList({ sessions }: { readonly sessions: readonly ActiveSession[] }): JSX.Element {
  const [notice, setNotice] = useState<string | null>(null);
  const { one, others } = useCloseSessions(setNotice);
  const busy = one.isPending || others.isPending;
  const failure = one.isError ? one.error : others.isError ? others.error : null;
  const hasOthers = sessions.some((session) => !session.current);
  return (
    <div className="flex flex-col gap-4">
      {notice === null || failure !== null ? null : <FormSuccess message={notice} />}
      {failure === null ? null : <FormError error={failure} />}
      <ul aria-label="Sesiones abiertas">
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            busy={busy}
            onClose={(target) => {
              one.mutate(target);
            }}
          />
        ))}
      </ul>
      {hasOthers ? (
        <ConfirmActionButton
          confirmLabel="Sí, cerrar"
          label="Cerrar todas las demás"
          title="¿Cerrar todas las demás sesiones?"
          description="Solo quedará abierta esta. Los demás equipos tendrán que iniciar sesión de nuevo."
          disabled={busy}
          onConfirm={() => {
            others.mutate();
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Solo tiene abierta esta sesión.</p>
      )}
    </div>
  );
}

/** Sesiones activas (16.7, B09): dónde tiene sesión abierta la persona y cerrarlas. */
export function ActiveSessionsPanel(): JSX.Element {
  const sessions = useActiveSessions();
  let content: JSX.Element;
  if (sessions.isPending) content = <LoadingState label="Cargando sus sesiones" />;
  else if (sessions.isError) {
    const apiError = sessions.error instanceof ApiError ? sessions.error : undefined;
    content = (
      <ErrorState
        message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
        correlationId={apiError?.correlationId}
        onRetry={() => void sessions.refetch()}
      />
    );
  } else content = <SessionList sessions={sessions.data.data} />;
  return (
    <Card>
      <CardContent className="pt-6">{content}</CardContent>
    </Card>
  );
}
