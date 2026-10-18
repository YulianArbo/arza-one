import { Button } from '@arza/ui';
import type { JSX } from 'react';

// Botón secundario pequeño de las pantallas de formatos (B20): agregar, quitar, subir o bajar.

export function SmallButton(props: {
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <Button type="button" size="sm" variant="outline" onClick={props.onClick}>
      {props.label}
    </Button>
  );
}
