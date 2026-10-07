'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@arza/ui';
import { Search } from 'lucide-react';
import { useEffect, useState, type JSX } from 'react';

/** Ctrl K (o Cmd K en Mac) abre la búsqueda desde cualquier pantalla. */
function isSearchShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>): boolean {
  return event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey);
}

function useSearchShortcut(setOpen: (open: boolean) => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen]);
}

/**
 * Búsqueda global de la zona 2 (16.3). La búsqueda en sí llega con el servicio de búsqueda del
 * backend (13.2); por ahora la ventana explica que todavía no hay contenido para buscar.
 */
export function GlobalSearch(): JSX.Element {
  const [open, setOpen] = useState(false);
  useSearchShortcut(setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-start text-muted-foreground sm:w-64">
          <Search aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Buscar en todo…</span>
          <kbd className="ml-auto hidden rounded-sm border px-1.5 text-xs sm:inline">Ctrl K</kbd>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscar en todo</DialogTitle>
          <DialogDescription>
            La búsqueda estará disponible cuando existan los primeros módulos con información.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="global-search">Qué busca</Label>
        <Input id="global-search" type="search" placeholder="Código, nombre o palabra clave" />
      </DialogContent>
    </Dialog>
  );
}
