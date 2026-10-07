import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu.js';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './sheet.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip.js';

describe('ventanas y menús', () => {
  it('el diálogo se abre, tiene nombre y se cierra con su botón', async () => {
    render(
      <Dialog>
        <DialogTrigger>Buscar</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buscar en todo</DialogTitle>
            <DialogDescription>Escriba lo que busca.</DialogDescription>
          </DialogHeader>
          <DialogFooter>Pie</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(screen.getByRole('dialog', { name: 'Buscar en todo' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el panel lateral se abre como diálogo con su botón de cierre', async () => {
    render(
      <Sheet>
        <SheetTrigger>Abrir menú</SheetTrigger>
        <SheetContent>
          <SheetTitle>Menú</SheetTitle>
          <SheetDescription>Módulos</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByRole('dialog', { name: 'Menú' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toBeVisible();
  });
});

describe('confirmaciones y menús', () => {
  it('la confirmación de una acción irreversible exige elegir', async () => {
    const onConfirm = vi.fn();
    render(
      <AlertDialog>
        <AlertDialogTrigger>Anular</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>¿Anular la factura FV-2026-0001?</AlertDialogTitle>
          <AlertDialogDescription>No se puede deshacer.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Anular factura</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Anular' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('No se puede deshacer.');
    await userEvent.click(screen.getByRole('button', { name: 'Anular factura' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('menú desplegable', () => {
  it('el menú desplegable se recorre con el teclado y marca la opción elegida', async () => {
    const onValueChange = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Tema</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value="light" onValueChange={onValueChange}>
            <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Oscuro</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuItem disabled>Más opciones</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    screen.getByRole('button', { name: 'Tema' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menuitemradio', { name: 'Claro' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Oscuro' }));
    expect(onValueChange).toHaveBeenCalledWith('dark');
  });
});

describe('ayuda emergente', () => {
  it('la ayuda emergente aparece al enfocar el elemento', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Inicio</TooltipTrigger>
          <TooltipContent>Ir al inicio</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Ir al inicio');
  });
});
