import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arza/ui';
import type { JSX } from 'react';

interface Swatch {
  name: string;
  usage: string;
  className: string;
}

// Tokens de color (B22A). Las clases usan solo variables de la marca.
const SWATCHES: Swatch[] = [
  { name: 'Acción', usage: 'Botón de la acción principal', className: 'bg-action' },
  { name: 'Primario', usage: 'Enlaces y elemento activo', className: 'bg-primary' },
  { name: 'Marca oscuro', usage: 'Panel de marca del acceso', className: 'bg-brand-navy' },
  { name: 'Invertido', usage: 'Módulo o tarjeta bajo el cursor', className: 'bg-invert' },
  { name: 'Fondo', usage: 'Fondo de la aplicación', className: 'bg-background' },
  { name: 'Tarjeta', usage: 'Fondo de tarjetas y campos', className: 'bg-card' },
  { name: 'Éxito', usage: 'Operación correcta', className: 'bg-success' },
  { name: 'Advertencia', usage: 'Requiere atención', className: 'bg-warning' },
  { name: 'Error', usage: 'Falla o validación', className: 'bg-destructive' },
  { name: 'Información', usage: 'Dato informativo', className: 'bg-info' },
];

export function ColorSection(): JSX.Element {
  return (
    <Card aria-labelledby="colors-title">
      <CardHeader>
        <CardTitle id="colors-title">Colores</CardTitle>
        <CardDescription>Neutros en claro y oscuro con el azul de la marca.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SWATCHES.map((swatch) => (
            <li key={swatch.name} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`size-10 shrink-0 rounded-md border ${swatch.className}`}
              />
              <span className="flex flex-col">
                <span className="font-medium">{swatch.name}</span>
                <span className="text-muted-foreground">{swatch.usage}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function TypographySection(): JSX.Element {
  return (
    <Card aria-labelledby="typography-title">
      <CardHeader>
        <CardTitle id="typography-title">Tipografías</CardTitle>
        <CardDescription>Alojadas en el propio servidor, sin llamadas a terceros.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-2xl font-semibold tracking-tight">Montserrat 600 · Título de página</p>
        <p className="text-lg font-semibold">Montserrat 600 · Título de sección</p>
        <p>Montserrat 400 · Texto de la aplicación, base de 14 px.</p>
        <p className="font-medium">Montserrat 500 · Etiquetas y datos destacados.</p>
      </CardContent>
    </Card>
  );
}
