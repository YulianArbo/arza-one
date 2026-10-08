'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@arza/ui';
import { Bell, CircleHelp, CircleUser, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { PROFILE_PATH } from '../../features/session/access-routes';
import { useSession } from '../../features/session/session-provider';

/** Avisos de la zona 2. Se llenan con el módulo de notificaciones (B16). */
export function NotificationsMenu(): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Avisos">
          <Bell aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Avisos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>No tiene avisos nuevos.</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ayuda contextual: cada módulo enlazará aquí su procedimiento del SGC (16.3). */
export function HelpMenu(): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ayuda">
          <CircleHelp aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Ayuda de esta pantalla</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          El procedimiento del SGC se enlaza con cada módulo.
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Menú del usuario: quién inició sesión, Mi perfil y Cerrar sesión (B08). */
export function UserMenu(): JSX.Element {
  const { session, logout } = useSession();
  const [failed, setFailed] = useState(false);
  const { user } = session;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menú del usuario">
          <CircleUser aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-72">
        <DropdownMenuLabel className="flex flex-col">
          <span>{user.display_name ?? 'Su cuenta'}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.kind === 'internal' ? (
          <DropdownMenuItem asChild>
            <Link href={PROFILE_PATH}>
              <UserRound aria-hidden="true" />
              Mi perfil
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            logout().catch(() => {
              setFailed(true);
            });
          }}
        >
          <LogOut aria-hidden="true" />
          {failed ? 'No se pudo cerrar la sesión. Intente de nuevo' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
