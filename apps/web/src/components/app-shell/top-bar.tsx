import type { JSX } from 'react';

import { ThemeMenu } from '../theme-menu';
import { AppBreadcrumb } from './app-breadcrumb';
import { GlobalSearch } from './global-search';
import { MobileNavigation } from './mobile-navigation';
import { NotificationsMenu } from '../../features/notifications/notifications-menu';
import { HelpMenu, UserMenu } from './top-bar-menus';

/** Zona 2 de la figura 16.3: ruta, búsqueda global, avisos, ayuda y menú del usuario. */
export function TopBar({ permissions }: { permissions: readonly string[] }): JSX.Element {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-card px-3 sm:px-6">
      <MobileNavigation permissions={permissions} />
      <div className="hidden min-w-0 flex-1 sm:block">
        <AppBreadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <GlobalSearch />
        <NotificationsMenu />
        <HelpMenu />
        <ThemeMenu />
        <UserMenu />
      </div>
    </header>
  );
}
