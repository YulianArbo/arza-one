import Link from 'next/link';
import type { JSX } from 'react';

import { NotificationsMenu } from '../../features/notifications/notifications-menu';
import { BrandLogo } from '../brand-logo';
import { ThemeMenu } from '../theme-menu';
import { AppBreadcrumb } from './app-breadcrumb';
import { BackToModule } from './back-to-module';
import { GlobalSearch } from './global-search';
import { MobileNavigation } from './mobile-navigation';
import { APP_HOME } from './navigation';
import { HelpMenu, UserMenu } from './top-bar-menus';

/**
 * Zona 2 de la figura 16.3 (B22B): «Volver a» y la ruta a la izquierda; a la derecha búsqueda,
 * ayuda, avisos, apariencia y la persona. El logo va en el menú; en celular, aquí.
 */
export function TopBar({ permissions }: { permissions: readonly string[] }): JSX.Element {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-card px-3 sm:px-4 lg:px-6">
      <MobileNavigation permissions={permissions} />
      <Link href={APP_HOME} className="flex shrink-0 items-center text-foreground md:hidden">
        <BrandLogo markOnly className="h-6 w-auto" />
      </Link>
      <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
        <BackToModule />
        <AppBreadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <GlobalSearch />
        <HelpMenu />
        <NotificationsMenu />
        <ThemeMenu className="mx-1 hidden sm:inline-flex" />
        <UserMenu />
      </div>
    </header>
  );
}
