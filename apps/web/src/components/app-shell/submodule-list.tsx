'use client';

import { cn } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { currentSubmodule, visibleSubmodules, type Submodule } from './submodules';

export interface SubmoduleListProps {
  readonly slug: string;
  readonly granted: ReadonlySet<string>;
  readonly grantedAll: ReadonlySet<string>;
  readonly pathname: string;
  /** En tableta el menú solo muestra iconos de módulos: los submódulos se ven desde escritorio. */
  readonly collapsible: boolean;
  readonly onNavigate?: () => void;
}

/**
 * Submódulos del módulo actual (B22B), con sangría y una línea guía. Solo los que la persona
 * puede abrir; el actual se marca con color y con aria-current.
 */
export function SubmoduleList({
  slug,
  granted,
  grantedAll,
  pathname,
  collapsible,
  onNavigate,
}: SubmoduleListProps): JSX.Element | null {
  const entries = visibleSubmodules(slug, granted, grantedAll);
  if (entries.length === 0) {
    return null;
  }
  const current = currentSubmodule(slug, pathname);
  return (
    <ul
      className={cn(
        'mt-0.5 mb-1 ml-[1.375rem] flex flex-col gap-0.5 border-l pl-2.5',
        collapsible && 'hidden lg:flex',
      )}
    >
      {entries.map((entry) => (
        <li key={entry.href}>
          <SubmoduleLink
            entry={entry}
            active={entry.href === current?.href}
            {...(onNavigate ? { onNavigate } : {})}
          />
        </li>
      ))}
    </ul>
  );
}

interface SubmoduleLinkProps {
  readonly entry: Submodule;
  readonly active: boolean;
  readonly onNavigate?: () => void;
}

function SubmoduleLink({ entry, active, onNavigate }: SubmoduleLinkProps): JSX.Element {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      aria-current={active ? 'page' : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-nav text-foreground hover-invert',
        active && 'bg-primary/10 font-medium text-primary',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
      />
      {entry.label}
    </Link>
  );
}
