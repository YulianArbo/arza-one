'use client';

import { Button, Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@arza/ui';
import { Menu } from 'lucide-react';
import { useState, type JSX } from 'react';

import { BrandLogo } from '../brand-logo';
import { NavigationList } from './navigation-list';

/** Menú en celular: un botón en la barra superior abre el panel con los módulos (16.3). */
export function MobileNavigation({ permissions }: { permissions: readonly string[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-6 overflow-y-auto bg-sidebar px-3 py-5 text-sidebar-foreground">
        <SheetTitle className="px-3 text-sidebar-foreground">
          <BrandLogo onDark className="h-8 w-auto" />
        </SheetTitle>
        <SheetDescription className="sr-only">Módulos de la plataforma</SheetDescription>
        <nav aria-label="Menú principal">
          <NavigationList
            permissions={permissions}
            onNavigate={() => {
              setOpen(false);
            }}
          />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
