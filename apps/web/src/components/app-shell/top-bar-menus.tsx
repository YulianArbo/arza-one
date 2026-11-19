'use client';

import {
  Avatar,
  Button,
  cn,
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

import { MY_PHOTO_PATH, useImageUrl, useMe } from '../../features/media/media-queries';
import { PROFILE_PATH } from '../../features/session/access-routes';
import { useSession } from '../../features/session/session-provider';

/** Ayuda contextual: cada módulo enlazará aquí su procedimiento del SGC (16.3). */
export function HelpMenu(): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Ayuda">
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
  compact,
  ...trigger
}: ComponentProps<'button'> & {
  readonly name: string;
  readonly email: string;
  readonly compact: boolean;
}): JSX.Element {
  const me = useMe().data;
  const photo = useImageUrl(me?.has_photo === true ? MY_PHOTO_PATH : null);
  return (
    <Button
      {...trigger}
      variant="ghost"
      className={cn('h-10 gap-2 rounded-full border px-1', compact ? null : 'lg:pr-3')}
    >
      {/* El nombre accesible incluye el texto visible (WCAG 2.5.3, etiqueta en el nombre). */}
      <span className="sr-only">Menú del usuario</span>
      <span aria-hidden="true">
        <Avatar name={name} src={photo} size="sm" />
      </span>
      <span
        className={cn(
          'hidden max-w-40 flex-col items-start leading-tight',
          compact ? null : 'lg:flex',
        )}
      >
        <span className="truncate text-[13px] font-medium">{name}</span>
        <span className="truncate text-[11px] font-normal text-muted-foreground">{email}</span>
      </span>
    </Button>
  );
}

/** Menú del usuario: su foto o iniciales y su nombre; Mi perfil y Cerrar sesión (B08, B22A). */
/** compact: solo la foto o las iniciales, como en el portal, donde al lado va la empresa. */
export function UserMenu({ compact = false }: { readonly compact?: boolean }): JSX.Element {
  const { session, logout } = useSession();
  const [failed, setFailed] = useState(false);
  const { user } = session;
  const name = user.display_name ?? user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <UserButton name={name} email={user.email} compact={compact} />
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
