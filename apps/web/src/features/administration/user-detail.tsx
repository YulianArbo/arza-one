'use client';

import type { UserDetailResponse } from '@arza/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { EntityHistory } from '../audit/entity-history';
import { usePermissions } from '../session/permissions';
import { useSession } from '../session/session-provider';
import { USER_KIND_LABELS, USER_STATUS_LABELS, USER_STATUS_TONES, personName } from './labels';
import { useUser } from './queries';
import { QueryState } from './query-state';
import { UserActionsCard } from './user-actions';
import { UserPositionCard } from './user-position';
import { UserRolesCard } from './user-roles';

function Row({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AccountCard({ user }: { readonly user: UserDetailResponse }): JSX.Element {
  const security = user.security;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cuenta</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Correo" value={user.email} />
          <Row label="Tipo" value={USER_KIND_LABELS[user.kind]} />
          <Row label="Creada el" value={formatDateTime(user.created_at)} />
          <Row label="Último ingreso" value={formatDateTime(user.last_login_at)} />
          {security === null ? null : (
            <>
              <Row
                label="Segundo factor"
                value={security.second_factor ? 'Configurado' : 'Sin configurar'}
              />
              <Row label="Sesiones abiertas" value={String(security.active_sessions)} />
              {security.locked_until === null ? null : (
                <Row
                  label="Bloqueo por intentos"
                  value={`Hasta el ${formatDateTime(security.locked_until)}`}
                />
              )}
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function UserDetail({ user }: { readonly user: UserDetailResponse }): JSX.Element {
  const { session } = useSession();
  const permissions = usePermissions();
  const own = session.user.id === user.id;
  return (
    <>
      {own ? (
        <PageHeader
          title={personName(user)}
          description="Esta es su propia cuenta: sus roles y su cargo los cambia otro administrador."
        />
      ) : (
        <PageHeader title={personName(user)} />
      )}
      <div>
        <Badge tone={USER_STATUS_TONES[user.status]}>{USER_STATUS_LABELS[user.status]}</Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AccountCard user={user} />
        <UserRolesCard user={user} canAssign={!own && permissions.can('iam.role.assign')} />
        {user.kind === 'internal' ? (
          <UserPositionCard
            user={user}
            canEdit={!own && permissions.can('iam.user.update') && permissions.can('core.org.read')}
          />
        ) : null}
      </div>
      {own ? null : <UserActionsCard user={user} />}
      <EntityHistory entityType="iam_user" entityId={user.id} />
    </>
  );
}

/** Ficha de un usuario (iam.user.read). */
export function UserDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const user = useUser(id);
  return (
    <QueryState query={user} loadingLabel="Cargando la ficha">
      {(data) => <UserDetail user={data} />}
    </QueryState>
  );
}
