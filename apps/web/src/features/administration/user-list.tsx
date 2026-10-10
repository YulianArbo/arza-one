'use client';

import type { UserSummary } from '@arza/contracts';
import { Badge, Button, EmptyState, TableCell, TableRow } from '@arza/ui';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormField } from '../access/form-field';
import { usePermissions } from '../session/permissions';
import { InviteUserDialog } from './invite-user-dialog';
import {
  USER_KIND_LABELS,
  USER_STATUS_LABELS,
  USER_STATUS_TONES,
  personName,
  userPath,
} from './labels';
import { useUserPage, type UserFilters } from './queries';
import { QueryState } from './query-state';
import { SelectField } from './select-field';
import { Pager } from './pager';
import { SimpleTable } from './simple-table';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  ...Object.entries(USER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const HEADERS = ['Persona', 'Tipo', 'Estado', 'Roles vigentes', 'Último ingreso'];

function UserRow({ user }: { readonly user: UserSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={userPath(user.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {personName(user)}
        </Link>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </TableCell>
      <TableCell>{USER_KIND_LABELS[user.kind]}</TableCell>
      <TableCell>
        <Badge tone={USER_STATUS_TONES[user.status]}>{USER_STATUS_LABELS[user.status]}</Badge>
      </TableCell>
      <TableCell>{user.roles.map((role) => role.name).join(', ') || 'Sin roles'}</TableCell>
      <TableCell>{formatDateTime(user.last_login_at)}</TableCell>
    </TableRow>
  );
}

function UserTable({ users }: { readonly users: readonly UserSummary[] }): JSX.Element {
  if (users.length === 0) {
    return (
      <EmptyState
        title="No hay usuarios con esos filtros"
        description="Cambie la búsqueda o el estado para ver otras cuentas."
        icon={<Users />}
      />
    );
  }
  return (
    <SimpleTable headers={HEADERS}>
      {users.map((user) => (
        <UserRow key={user.id} user={user} />
      ))}
    </SimpleTable>
  );
}

function Filters({ onApply }: { readonly onApply: (filters: UserFilters) => void }): JSX.Element {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onApply({ q, status });
  };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
    >
      <FormField
        id="buscar-usuario"
        label="Buscar por nombre o correo"
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
        }}
      />
      <SelectField
        id="estado-usuario"
        label="Estado"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
        }}
      />
      <Button type="submit" variant="outline">
        Buscar
      </Button>
    </form>
  );
}

/** Usuarios de la empresa, por páginas (numeral 16.4, patrón de listado). */
export function UserList(): JSX.Element {
  const [filters, setFilters] = useState<UserFilters>({ q: '', status: '' });
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const page = useUserPage(filters, cursors.at(-1) ?? null);
  const permissions = usePermissions();
  const applyFilters = (next: UserFilters): void => {
    setFilters(next);
    setCursors([null]);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters onApply={applyFilters} />
        {permissions.can('iam.user.invite') ? <InviteUserDialog /> : null}
      </div>
      <QueryState query={page} loadingLabel="Cargando usuarios">
        {(data) => (
          <>
            <UserTable users={data.data} />
            <Pager
              page={data}
              hasPrevious={cursors.length > 1}
              onPrevious={() => {
                setCursors(cursors.slice(0, -1));
              }}
              onNext={(cursor) => {
                setCursors([...cursors, cursor]);
              }}
            />
          </>
        )}
      </QueryState>
    </div>
  );
}
