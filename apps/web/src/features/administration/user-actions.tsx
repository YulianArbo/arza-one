'use client';

import { closedSessionsResponseSchema, type UserDetailResponse } from '@arza/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import { useState, type JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { usePermissions } from '../session/permissions';
import { useAdminAction } from './admin-action';
import { personName } from './labels';
import { ADMIN_KEYS } from './queries';

type ActionName = 'invite' | 'lock' | 'unlock' | 'reset-mfa' | 'revoke-sessions';

interface ActionSpec {
  readonly name: ActionName;
  readonly permission: string;
  readonly label: string;
  readonly title: (who: string) => string;
  readonly description: string;
  readonly done: (who: string) => string;
  readonly applies: (user: UserDetailResponse) => boolean;
}

const ACTIONS: readonly ActionSpec[] = [
  {
    name: 'invite',
    permission: 'iam.user.invite',
    label: 'Reenviar la invitación',
    title: (who) => `¿Reenviar la invitación a ${who}?`,
    description: 'Le llegará un correo nuevo con un enlace que vence en 72 horas.',
    done: (who) => `Reenviamos la invitación a ${who}.`,
    applies: (user) => user.status === 'invited',
  },
  {
    name: 'lock',
    permission: 'iam.user.lock',
    label: 'Bloquear la cuenta',
    title: (who) => `¿Bloquear la cuenta de ${who}?`,
    description: 'No podrá entrar a ARZA ONE y se cerrarán todas sus sesiones.',
    done: (who) => `Bloqueamos la cuenta de ${who}.`,
    applies: (user) => user.status === 'active',
  },
  {
    name: 'unlock',
    permission: 'iam.user.lock',
    label: 'Desbloquear la cuenta',
    title: (who) => `¿Desbloquear la cuenta de ${who}?`,
    description: 'Podrá volver a entrar a ARZA ONE con su contraseña y su segundo factor.',
    done: (who) => `Desbloqueamos la cuenta de ${who}.`,
    applies: (user) => user.status === 'locked' || (user.security?.locked_until ?? null) !== null,
  },
  {
    name: 'reset-mfa',
    permission: 'iam.user.reset_mfa',
    label: 'Reiniciar el segundo factor',
    title: (who) => `¿Reiniciar el segundo factor de ${who}?`,
    description:
      'Úselo solo si la persona perdió su celular y sus códigos, después de confirmar quién es por otro medio. Se cerrarán sus sesiones y al entrar lo configurará de nuevo.',
    done: (who) => `Reiniciamos el segundo factor de ${who}.`,
    applies: (user) => user.status === 'active' && user.security?.second_factor === true,
  },
  {
    name: 'revoke-sessions',
    permission: 'iam.session.revoke',
    label: 'Cerrar sus sesiones',
    title: (who) => `¿Cerrar todas las sesiones de ${who}?`,
    description: 'Tendrá que iniciar sesión de nuevo en todos sus equipos.',
    done: (who) => `Cerramos las sesiones de ${who}.`,
    applies: (user) => user.status === 'active',
  },
];

function useUserAction(user: UserDetailResponse, onDone: (message: string) => void) {
  const api = useApiClient();
  return useAdminAction<ActionSpec, unknown>({
    run: (action, csrfToken) => {
      const path = `/v1/users/${user.id}/actions/${action.name}`;
      const returnsCount = action.name === 'reset-mfa' || action.name === 'revoke-sessions';
      return returnsCount
        ? api.post(path, { body: {}, schema: closedSessionsResponseSchema, csrfToken })
        : api.post(path, { body: {}, csrfToken });
    },
    invalidate: [ADMIN_KEYS.user(user.id), ADMIN_KEYS.users],
    onSuccess: (_result, action) => {
      onDone(action.done(personName(user)));
    },
  });
}

interface ButtonsProps {
  readonly actions: readonly ActionSpec[];
  readonly who: string;
  readonly busy: boolean;
  readonly onRun: (action: ActionSpec) => void;
}

function ActionButtons({ actions, who, busy, onRun }: ButtonsProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((item) => (
        <ConfirmActionButton
          key={item.name}
          label={item.label}
          title={item.title(who)}
          description={item.description}
          confirmLabel="Sí, continuar"
          variant={item.name === 'lock' || item.name === 'reset-mfa' ? 'destructive' : 'outline'}
          disabled={busy}
          onConfirm={() => {
            onRun(item);
          }}
        />
      ))}
    </div>
  );
}

/** Acciones sobre la cuenta de otra persona, según los permisos de quien la mira. */
export function UserActionsCard({
  user,
}: {
  readonly user: UserDetailResponse;
}): JSX.Element | null {
  const permissions = usePermissions();
  const [notice, setNotice] = useState<string | null>(null);
  const action = useUserAction(user, setNotice);
  const available = ACTIONS.filter(
    (item) => permissions.can(item.permission) && item.applies(user),
  );
  if (available.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acciones sobre la cuenta</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {action.error === null ? null : <FormError error={action.error} />}
        {notice === null || action.error !== null ? null : <FormSuccess message={notice} />}
        <ActionButtons
          actions={available}
          who={personName(user)}
          busy={action.pending}
          onRun={(item) => {
            setNotice(null);
            action.execute(item);
          }}
        />
        {action.dialog}
      </CardContent>
    </Card>
  );
}
