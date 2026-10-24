'use client';

import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@arza/ui';
import { CircleHelp, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState, type ComponentProps, type JSX } from 'react';

import { PROFILE_PATH } from '../../features/session/access-routes';
import { useSession } from '../../features/session/session-provider';

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

/**
 * Botón del menú del usuario: avatar, nombre y correo (el nombre solo en escritorio). Recibe las
 * propiedades del disparador del menú (clic, referencia y estado) y las pasa al botón.
 */
function UserButton({
  name,
  email,
  ...trigger
}: ComponentProps<'button'> & { readonly name: string; readonly email: string }): JSX.Element {
  return (
    <Button
      {...trigger}
      variant="ghost"
      aria-label="Menú del usuario"
      className="h-10 gap-2 rounded-full border px-1 lg:pr-3"
    >
      <Avatar name={name} size="sm" />
      <span className="hidden max-w-40 flex-col items-start leading-tight lg:flex">
        <span className="truncate text-[13px] font-medium">{name}</span>
        <span className="truncate text-[11px] font-normal text-muted-foreground">{email}</span>
      </span>
    </Button>
  );
}

/** Menú del usuario: su foto o iniciales y su nombre; Mi perfil y Cerrar sesión (B08, B22A). */
export function UserMenu(): JSX.Element {
  const { session, logout } = useSession();
  const [failed, setFailed] = useState(false);
  const { user } = session;
  const name = user.display_name ?? user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <UserButton name={name} email={user.email} />
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
