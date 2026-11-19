'use client';

import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@arza/ui';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, type JSX } from 'react';

import {
  hrefFor,
  isActive,
  visibleNavigation,
  type NavigationGroup,
  type NavigationItem,
} from './navigation';
import { SubmoduleList } from './submodule-list';
import { inVisibleSubmodule } from './submodules';
import { useCollapsedGroups } from './use-collapsed-groups';

export interface NavigationListProps {
  /** Permisos del usuario; los iconos no viajan desde el servidor, el menú se arma aquí. */
  permissions: readonly string[];
  /** En tableta el menú se contrae a solo iconos; el nombre aparece al enfocar (16.3). */
  collapsible?: boolean;
  onNavigate?: () => void;
}

/** Menú por grupos (B22B). El módulo actual se marca con color y con aria-current. */
export function NavigationList({
  permissions,
  collapsible = false,
  onNavigate,
}: NavigationListProps): JSX.Element {
  const pathname = usePathname();
  const { isCollapsed, toggle } = useCollapsedGroups();
  const granted = new Set(permissions);
  const groups = visibleNavigation(granted);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const hasActive = group.items.some((item) => isActive(item, pathname));
        return (
          <NavigationSection
            key={group.key}
            group={group}
            pathname={pathname}
            granted={granted}
            open={hasActive || !isCollapsed(group.key)}
            collapsible={collapsible}
            onToggle={() => {
              toggle(group.key);
            }}
            {...(onNavigate ? { onNavigate } : {})}
          />
        );
      })}
    </div>
  );
}

interface NavigationSectionProps {
  group: NavigationGroup;
  pathname: string;
  granted: ReadonlySet<string>;
  open: boolean;
  collapsible: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

/** Un grupo del menú: su encabezado, que lo abre o lo cierra, y sus módulos. */
function NavigationSection({
  group,
  pathname,
  granted,
  open,
  collapsible,
  onToggle,
  onNavigate,
}: NavigationSectionProps): JSX.Element {
  const listId = useId();
  // En tableta los grupos no se contraen: se ven todos los iconos.
  const showItems = open || collapsible;
  return (
    <div className="flex flex-col gap-0.5">
      {group.icon ? (
        <GroupHeader
          group={group}
          open={open}
          listId={listId}
          collapsible={collapsible}
          onToggle={onToggle}
        />
      ) : null}
      <ul id={listId} className={cn('flex flex-col gap-0.5', !open && collapsible && 'lg:hidden')}>
        {showItems
          ? group.items.map((item) => (
              <ModuleEntry
                key={item.slug}
                item={item}
                pathname={pathname}
                granted={granted}
                collapsible={collapsible}
                {...(onNavigate ? { onNavigate } : {})}
              />
            ))
          : null}
      </ul>
    </div>
  );
}

interface ModuleEntryProps {
  item: NavigationItem;
  pathname: string;
  granted: ReadonlySet<string>;
  collapsible: boolean;
  onNavigate?: () => void;
}

/** Un módulo del menú y, si es el actual, sus submódulos. */
function ModuleEntry({
  item,
  pathname,
  granted,
  collapsible,
  onNavigate,
}: ModuleEntryProps): JSX.Element {
  const active = isActive(item, pathname);
  const navigate = onNavigate ? { onNavigate } : {};
  return (
    <li>
      <NavigationLink
        item={item}
        active={active}
        inSubmodule={inVisibleSubmodule(item.slug, pathname, granted)}
        collapsible={collapsible}
        {...navigate}
      />
      {active ? (
        <SubmoduleList
          slug={item.slug}
          granted={granted}
          pathname={pathname}
          collapsible={collapsible}
          {...navigate}
        />
      ) : null}
    </li>
  );
}

interface GroupHeaderProps {
  group: NavigationGroup;
  open: boolean;
  listId: string;
  collapsible: boolean;
  onToggle: () => void;
}

/** Encabezado del grupo: ícono, nombre y flecha. En tableta se oculta y quedan los iconos. */
function GroupHeader({
  group,
  open,
  listId,
  collapsible,
  onToggle,
}: GroupHeaderProps): JSX.Element {
  const Icon = group.icon ?? ChevronDown;
  return (
    <h2 className={cn(collapsible && 'hidden lg:block')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 rounded-md px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('size-3.5 transition-transform duration-200', !open && '-rotate-90')}
        />
      </button>
    </h2>
  );
}

interface NavigationLinkProps {
  item: NavigationItem;
  active: boolean;
  /** La página actual es un submódulo: ese lleva «página actual» y el módulo, «aquí está». */
  inSubmodule: boolean;
  collapsible: boolean;
  onNavigate?: () => void;
}

function NavigationLink({
  item,
  active,
  inSubmodule,
  collapsible,
  onNavigate,
}: NavigationLinkProps): JSX.Element {
  const Icon = item.icon;
  const link = (
    <Link
      href={hrefFor(item)}
      aria-current={active ? (inSubmodule ? 'true' : 'page') : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-nav font-medium text-foreground hover-invert',
        active && 'bg-primary/10 text-primary',
        collapsible && 'justify-center lg:justify-start',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-[18px] shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
      />
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
