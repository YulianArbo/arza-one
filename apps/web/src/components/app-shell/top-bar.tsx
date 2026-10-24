import Link from 'next/link';
import type { JSX } from 'react';

import { NotificationsMenu } from '../../features/notifications/notifications-menu';
import { BrandLogo } from '../brand-logo';
import { ThemeMenu } from '../theme-menu';
import { AppBreadcrumb } from './app-breadcrumb';
import { GlobalSearch } from './global-search';
import { MobileNavigation } from './mobile-navigation';
import { APP_HOME } from './navigation';
import { HelpMenu, UserMenu } from './top-bar-menus';

/**
 * Zona 2 de la figura 16.3 (B22A): logo a la izquierda; ruta; y a la derecha búsqueda, ayuda,
 * avisos, apariencia y la persona que inició sesión.
 */
export function TopBar({ permissions }: { permissions: readonly string[] }): JSX.Element {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-4">
      <MobileNavigation permissions={permissions} />
      <Link href={APP_HOME} className="flex shrink-0 items-center text-foreground lg:w-56">
        <BrandLogo markOnly className="h-6 w-auto lg:hidden" />
        <BrandLogo className="hidden h-6 w-auto lg:block" />
      </Link>
      <div className="hidden min-w-0 flex-1 md:block">
        <AppBreadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <GlobalSearch />
        <HelpMenu />
        <NotificationsMenu />
        <ThemeMenu className="mx-1 hidden sm:inline-flex" />
        <UserMenu />
      </div>
    </header>
  );
}
