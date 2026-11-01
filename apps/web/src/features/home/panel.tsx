import { Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import type { JSX, ReactNode } from 'react';

/** Tarjeta con título de cada bloque del tablero de Inicio. */
export function Panel(props: {
  readonly title: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{props.children}</CardContent>
    </Card>
  );
}
