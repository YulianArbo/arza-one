'use client';

import type { RoleSummary } from '@arza/contracts';
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { ADMIN_PATHS, USER_KIND_LABELS, rolePath } from './labels';
import { useRoles } from './queries';
import { QueryState } from './query-state';

function RoleRow({ role }: { readonly role: RoleSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={rolePath(role.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {role.name}
        </Link>
        <p className="max-w-prose text-xs text-muted-foreground">{role.description}</p>
      </TableCell>
      <TableCell>
        <Badge tone={role.is_system ? 'info' : 'neutral'}>
          {role.is_system ? 'Del sistema' : 'Personalizado'}
        </Badge>
      </TableCell>
      <TableCell>{USER_KIND_LABELS[role.audience]}</TableCell>
      <TableCell className="text-right">{role.permission_count}</TableCell>
      <TableCell className="text-right">{role.assigned_users}</TableCell>
    </TableRow>
  );
}

/** Roles de la empresa: los del sistema no se editan; los personalizados sí (ficha 17.2). */
export function RoleList(): JSX.Element {
  const roles = useRoles();
  const permissions = usePermissions();
  return (
    <div className="flex flex-col gap-4">
      {permissions.can('iam.role.manage') ? (
        <div>
          <Button asChild>
            <Link href={ADMIN_PATHS.newRole}>Crear un rol personalizado</Link>
          </Button>
        </div>
      ) : null}
      <QueryState query={roles} loadingLabel="Cargando roles">
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rol</TableHead>
                <TableHead>Clase</TableHead>
                <TableHead>Para</TableHead>
                <TableHead className="text-right">Permisos</TableHead>
                <TableHead className="text-right">Personas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((role) => (
                <RoleRow key={role.id} role={role} />
              ))}
            </TableBody>
          </Table>
        )}
      </QueryState>
    </div>
  );
}
