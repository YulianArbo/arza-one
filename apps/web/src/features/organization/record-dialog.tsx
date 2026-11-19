'use client';

import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormField,
} from '@arza/ui';
import { useState, type ComponentProps, type JSX, type ReactNode } from 'react';

// Piezas comunes de las pantallas de datos maestros (B12).

interface RecordDialogProps {
  readonly triggerLabel: string;
  /** Nombre accesible del botón cuando el texto visible no basta, como «Editar Sede norte». */
  readonly triggerAriaLabel?: string;
  readonly title: string;
  readonly description: string;
  readonly variant?: 'primary' | 'outline';
  /** Abre el diálogo al llegar, por ejemplo desde «Nueva solicitud» de una portada (B22B). */
  readonly startOpen?: boolean;
  /** El formulario; recibe cómo cerrar el diálogo cuando se guarde. */
  readonly children: (close: () => void) => ReactNode;
}

/** Diálogo con un formulario para crear o editar un registro (16.5). */
export function RecordDialog(props: RecordDialogProps): JSX.Element {
  const [open, setOpen] = useState(props.startOpen ?? false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={props.variant ?? 'primary'}
          size={props.variant === 'outline' ? 'sm' : 'md'}
          aria-label={props.triggerAriaLabel}
        >
          {props.triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        {open
          ? props.children(() => {
              setOpen(false);
            })
          : null}
      </DialogContent>
    </Dialog>
  );
}

interface CheckboxFieldProps {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly hint?: string;
}

/** Casilla con etiqueta visible y ayuda asociada (16.6). */
export function CheckboxField(props: CheckboxFieldProps): JSX.Element {
  const hintId = props.hint === undefined ? undefined : `${props.id}-ayuda`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          id={props.id}
          checked={props.checked}
          aria-describedby={hintId}
          onChange={(event) => {
            props.onChange(event.target.checked);
          }}
        />
        {props.label}
      </label>
      {props.hint === undefined ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {props.hint}
        </p>
      )}
    </div>
  );
}

type TextInputProps = Omit<ComponentProps<typeof FormField>, 'onChange'> & {
  readonly onValue: (value: string) => void;
};

/** Campo de texto que entrega solo el valor escrito. */
export function TextInput({ onValue, ...field }: TextInputProps): JSX.Element {
  return (
    <FormField
      {...field}
      onChange={(event) => {
        onValue(event.target.value);
      }}
    />
  );
}

export function ActiveBadge({ active }: { readonly active: boolean }): JSX.Element {
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Activo' : 'Inactivo'}</Badge>;
}

/** Opción «ninguno» seguida de los registros, para las listas desplegables de jerarquía. */
export function optionsOf(
  records: readonly { readonly id: string; readonly label: string }[],
  none: string,
): { value: string; label: string }[] {
  return [{ value: '', label: none }, ...records.map((r) => ({ value: r.id, label: r.label }))];
}

/** Valor de una lista desplegable: el vacío es null. */
export function idOrNull(value: string): string | null {
  return value === '' ? null : value;
}
