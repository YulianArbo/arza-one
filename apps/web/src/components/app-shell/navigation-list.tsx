'use client';

import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@arza/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';

import { hrefFor, isActive, visibleNavigation, type NavigationItem } from './navigation';

export interface NavigationListProps {
  /** Permisos del usuario; los iconos no viajan desde el servidor, el menú se arma aquí. */
  permissions: readonly string[];
  /** En tableta el menú se contrae a solo iconos; el nombre aparece al enfocar (16.3). */
  collapsible?: boolean;
  onNavigate?: () => void;
}

/** Lista de módulos del menú lateral. El módulo actual se marca con color y con aria-current. */
export function NavigationList({
  permissions,
  collapsible = false,
  onNavigate,
}: NavigationListProps): JSX.Element {
  const pathname = usePathname();
  const groups = visibleNavigation(new Set(permissions));
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <h2
            className={cn(
              'px-3 text-xs font-medium tracking-wide text-sidebar-foreground uppercase',
              collapsible && 'sr-only lg:not-sr-only',
            )}
          >
            {group.label}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.slug}>
                <NavigationLink
                  item={item}
                  active={isActive(item, pathname)}
                  collapsible={collapsible}
                  {...(onNavigate ? { onNavigate } : {})}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface NavigationLinkProps {
  item: NavigationItem;
  active: boolean;
  collapsible: boolean;
  onNavigate?: () => void;
}

function NavigationLink({
  item,
  active,
  collapsible,
  onNavigate,
}: NavigationLinkProps): JSX.Element {
  const Icon = item.icon;
  const link = (
    <Link
      href={hrefFor(item)}
      aria-current={active ? 'page' : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-hover focus-visible:outline-sidebar-active',
        active && 'bg-sidebar-hover font-semibold text-sidebar-active',
        collapsible && 'justify-center lg:justify-start',
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className={cn(collapsible && 'sr-only lg:not-sr-only')}>{item.label}</span>
    </Link>
  );
  if (!collapsible) {
    return link;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="lg:hidden">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}
