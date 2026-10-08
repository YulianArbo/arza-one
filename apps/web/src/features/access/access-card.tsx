import { Card, CardContent, CardDescription, CardHeader } from '@arza/ui';
import type { JSX, ReactNode } from 'react';

interface AccessCardProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

/** Tarjeta de las pantallas de acceso: título, explicación breve y formulario. */
export function AccessCard({ title, description, children }: AccessCardProps): JSX.Element {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <h1 className="font-heading text-2xl font-bold">{title}</h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
