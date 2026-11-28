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
import type { JSX, MouseEvent } from 'react';

import { ActionIcon } from '../lib/ui/action-icon';
import { useCodeCheck } from './code-confirmation';

interface ConfirmActionButtonProps {
  readonly label: string;
  /** Nombra lo que se cambia (16.5: el diálogo nombra el registro y la consecuencia). */
  readonly title: string;
  readonly description: string;
  /** Texto del botón que confirma, por ejemplo «Sí, cerrar». */
  readonly confirmLabel: string;
  readonly variant?: 'outline' | 'destructive';
  /** «sm» en filas de tabla, junto a otros botones pequeños (simetría, B49). */
  readonly size?: 'sm' | 'md';
  readonly disabled: boolean;
  /** Acción de alto impacto: pide escribir este código antes de confirmar (16.5, B22B). */
  readonly confirmCode?: string;
  readonly onConfirm: () => void;
}

/** Botón de una acción que no se puede deshacer: pide confirmación antes (16.5). */
export function ConfirmActionButton({
  label,
  title,
  description,
  confirmLabel,
  confirmCode,
  onConfirm,
  ...trigger
}: ConfirmActionButtonProps): JSX.Element {
  const code = useCodeCheck(confirmCode);
  const confirm = (event: MouseEvent<HTMLButtonElement>): void => {
    // Con código pendiente, la ventana sigue abierta hasta que coincida.
    if (code.allow()) onConfirm();
    else event.preventDefault();
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={trigger.variant ?? 'outline'}
          size={trigger.size ?? 'md'}
          className="self-start"
          disabled={trigger.disabled}
        >
          <ActionIcon label={label} />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {code.field}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
