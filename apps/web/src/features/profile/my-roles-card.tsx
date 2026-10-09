'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arza/ui';
import type { JSX } from 'react';

import { useMyPermissionsQuery } from '../session/permissions';

/** Roles vigentes de la persona (B10). Los cambia un administrador; nadie los cambia a sí mismo. */
export function MyRolesCard(): JSX.Element {
  const query = useMyPermissionsQuery();
  const roles = query.data?.roles;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sus roles</CardTitle>
        <CardDescription>
          Deciden qué puede ver y hacer en ARZA ONE. Si necesita otro, pídaselo al administrador de
          la plataforma.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {roles === undefined ? (
          <p className="text-sm text-muted-foreground">
            {query.isError ? 'No pudimos cargar sus roles.' : 'Cargando sus roles…'}
          </p>
        ) : roles.length === 0 ? (
          <p className="text-sm">Todavía no tiene roles asignados.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Sus roles">
            {roles.map((role) => (
              <li key={role.id} className="rounded-md border px-2 py-1 text-sm">
                {role.name}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
