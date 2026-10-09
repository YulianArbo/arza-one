'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@arza/ui';
import type { JSX } from 'react';

interface ConfirmActionButtonProps {
  readonly label: string;
  /** Nombra lo que se cambia (16.5: el diálogo nombra el registro y la consecuencia). */
  readonly title: string;
  readonly description: string;
  /** Texto del botón que confirma, por ejemplo «Sí, cerrar». */
  readonly confirmLabel: string;
  readonly variant?: 'outline' | 'destructive';
  readonly disabled: boolean;
  readonly onConfirm: () => void;
}

/** Botón de una acción que no se puede deshacer: pide confirmación antes (16.5). */
export function ConfirmActionButton({
  label,
  title,
  description,
  confirmLabel,
  variant = 'outline',
  disabled,
  onConfirm,
}: ConfirmActionButtonProps): JSX.Element {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} className="self-start" disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
