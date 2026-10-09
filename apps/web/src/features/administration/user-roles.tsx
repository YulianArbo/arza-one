'use client';

import {
  createdResponseSchema,
  type RoleAssignment,
  type UserDetailResponse,
} from '@arza/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { FormField } from '../access/form-field';
import { PERMISSIONS_QUERY_KEY } from '../session/permissions';
import { useAdminAction } from './admin-action';
import { endOfBogotaDay, personName } from './labels';
import { ADMIN_KEYS, useRoles } from './queries';
import { SelectField } from './select-field';

interface AssignBody {
  readonly role_id: string;
  readonly valid_until: string | null;
}

function useRoleActions(userId: string) {
  const api = useApiClient();
  const invalidate = [
    ADMIN_KEYS.user(userId),
    ADMIN_KEYS.users,
    ADMIN_KEYS.roles,
    PERMISSIONS_QUERY_KEY,
  ];
  const assign = useAdminAction<AssignBody, unknown>({
    run: (body, csrfToken) =>
      api.post(`/v1/users/${userId}/roles`, { body, schema: createdResponseSchema, csrfToken }),
    invalidate,
  });
  const revoke = useAdminAction<string>({
    run: (assignmentId, csrfToken) =>
      api.post(`/v1/users/${userId}/roles/${assignmentId}/actions/revoke`, {
        body: {},
        csrfToken,
      }),
    invalidate,
  });
  return { assign, revoke };
}

/** Roles que todavía se le pueden asignar: del mismo tipo de cuenta y que no tenga ya. */
function useAssignableRoles(user: UserDetailResponse): { value: string; label: string }[] {
  const roles = useRoles();
  const held = new Set(user.assignments.map((item) => item.role.id));
  return (roles.data?.data ?? [])
    .filter((role) => role.audience === user.kind && !held.has(role.id))
    .map((role) => ({ value: role.id, label: role.name }));
}

interface AssignFormProps {
  readonly user: UserDetailResponse;
  readonly onAssign: (body: AssignBody) => void;
  readonly pending: boolean;
}

function AssignForm({ user, onAssign, pending }: AssignFormProps): JSX.Element {
  const options = useAssignableRoles(user);
  const [roleId, setRoleId] = useState('');
  const [until, setUntil] = useState('');
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (roleId !== '') {
      onAssign({ role_id: roleId, valid_until: until === '' ? null : endOfBogotaDay(until) });
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <SelectField
        id="asignar-rol"
        label="Asignar un rol"
        options={[{ value: '', label: 'Elija un rol' }, ...options]}
        value={roleId}
        onChange={(event) => {
          setRoleId(event.target.value);
        }}
      />
      <FormField
        id="asignar-vence"
        label="Vence (opcional)"
        hint="El auditor vence a los 90 días como máximo."
        type="date"
        value={until}
        onChange={(event) => {
          setUntil(event.target.value);
        }}
      />
      <Button type="submit" disabled={pending || roleId === ''}>
        {pending ? 'Asignando…' : 'Asignar'}
      </Button>
    </form>
  );
}

function assignmentDetail(item: RoleAssignment): string {
  const until = item.valid_until === null ? '' : ` · vence el ${formatDateTime(item.valid_until)}`;
  const by = item.assigned_by === null ? 'el sistema' : personName(item.assigned_by);
  return `Desde el ${formatDateTime(item.valid_from)}${until} · asignó ${by}`;
}

interface AssignmentItemProps {
  readonly item: RoleAssignment;
  readonly owner: string;
  readonly onRevoke: ((id: string) => void) | null;
  readonly busy: boolean;
}

function AssignmentItem({ item, owner, onRevoke, busy }: AssignmentItemProps): JSX.Element {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div>
        <p className="font-medium">{item.role.name}</p>
        <p className="text-xs text-muted-foreground">{assignmentDetail(item)}</p>
      </div>
      {onRevoke === null ? null : (
        <ConfirmActionButton
          label="Retirar"
          title={`¿Retirar el rol ${item.role.name} a ${owner}?`}
          description="Perderá los permisos de ese rol desde su siguiente acción en ARZA ONE."
          confirmLabel="Sí, retirar"
          disabled={busy}
          onConfirm={() => {
            onRevoke(item.id);
          }}
        />
      )}
    </li>
  );
}

interface RolesCardProps {
  readonly user: UserDetailResponse;
  /** Puede asignar y retirar roles, y la ficha no es la suya. */
  readonly canAssign: boolean;
}

/** Roles vigentes de la persona; asignar y retirar según el permiso iam.role.assign. */
export function UserRolesCard({ user, canAssign }: RolesCardProps): JSX.Element {
  const { assign, revoke } = useRoleActions(user.id);
  const error = assign.error ?? revoke.error;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Roles vigentes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error === null ? null : <FormError error={error} />}
        {user.assignments.length === 0 ? <p className="text-sm">No tiene roles vigentes.</p> : null}
        <ul className="flex flex-col divide-y" aria-label="Roles vigentes">
          {user.assignments.map((item) => (
            <AssignmentItem
              key={item.id}
              item={item}
              owner={personName(user)}
              onRevoke={canAssign ? revoke.execute : null}
              busy={revoke.pending}
            />
          ))}
        </ul>
        {canAssign ? (
          <AssignForm user={user} onAssign={assign.execute} pending={assign.pending} />
        ) : null}
        {assign.dialog}
        {revoke.dialog}
      </CardContent>
    </Card>
  );
}
