'use client';

import { buttonVariants, ForbiddenState, HighlightCard } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { usePermissions } from '../../features/session/permissions';
import { visibleSubmodules, type Submodule } from './submodules';

/** Un grupo de accesos de una portada: su título y las direcciones de sus submódulos. */
export interface ShortcutGroup {
  readonly title: string;
  readonly hrefs: readonly string[];
}

interface ShortcutGroupsProps {
  /** Módulo del menú cuyos submódulos se agrupan, por ejemplo «administracion». */
  readonly slug: string;
  readonly groups: readonly ShortcutGroup[];
  /** Nombre de la lista para el lector de pantalla. */
  readonly label: string;
}

function entriesOf(group: ShortcutGroup, visible: ReadonlyMap<string, Submodule>): Submodule[] {
  return group.hrefs.flatMap((href) => visible.get(href) ?? []);
}

/**
 * Portada por grupos de accesos (B22B, boceto 19): cada grupo es una tarjeta con los submódulos
 * que la persona puede abrir. Sin ninguno, explica que no tiene acceso (16.5).
 */
export function ShortcutGroups({ slug, groups, label }: ShortcutGroupsProps): JSX.Element | null {
  const { ready, granted, grantedAll } = usePermissions();
  if (!ready) return null;
  const visible = new Map(
    visibleSubmodules(slug, granted, grantedAll).map((entry) => [entry.href, entry]),
  );
  const shown = groups
    .map((group) => ({ title: group.title, entries: entriesOf(group, visible) }))
    .filter((group) => group.entries.length > 0);
  if (shown.length === 0) return <ForbiddenState />;
  return (
    <ul aria-label={label} className="grid gap-5 lg:grid-cols-3">
      {shown.map((group) => (
        <li key={group.title}>
          <HighlightCard title={group.title} className="h-full">
            <ul className="flex flex-col gap-2">
              {group.entries.map((entry) => (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'lg',
                      className: 'w-full justify-start',
                    })}
                  >
                    <entry.icon aria-hidden="true" />
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </HighlightCard>
        </li>
      ))}
    </ul>
  );
}
