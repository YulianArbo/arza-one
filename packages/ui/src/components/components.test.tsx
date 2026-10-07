import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Alert, AlertDescription, AlertTitle } from './alert.js';
import { Badge } from './badge.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb.js';
import { Button } from './button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card.js';
import { Input } from './input.js';
import { Label } from './label.js';
import { Separator } from './separator.js';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table.js';

describe('botón', () => {
  it('ejecuta la acción al hacer clic', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('con asChild presta su estilo a un enlace', () => {
    render(
      <Button asChild variant="link">
        <a href="/app">Ir al inicio</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Ir al inicio' });
    expect(link).toHaveAttribute('href', '/app');
    expect(link.className).toContain('text-primary');
  });

  it('las clases propias reemplazan las del tamaño', () => {
    render(<Button className="h-12">Enviar</Button>);
    expect(screen.getByRole('button').className).toContain('h-12');
    expect(screen.getByRole('button').className).not.toContain('h-9');
  });
});

describe('campos de formulario', () => {
  it('la etiqueta visible da nombre al campo', () => {
    render(
      <>
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveAttribute('type', 'text');
  });
});

describe('componentes de presentación', () => {
  it('la tarjeta tiene título y descripción', () => {
    render(
      <Card aria-labelledby="t">
        <CardHeader>
          <CardTitle id="t">Versión</CardTitle>
          <CardDescription>De la API</CardDescription>
        </CardHeader>
        <CardContent>0.1.0</CardContent>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Versión' })).toHaveTextContent('De la API0.1.0');
  });

  it('la insignia y la alerta muestran texto, no solo color', () => {
    render(
      <>
        <Badge tone="success">Disponible</Badge>
        <Alert tone="warning">
          <AlertTitle>Atención</AlertTitle>
          <AlertDescription>Revise los datos.</AlertDescription>
        </Alert>
      </>,
    );
    expect(screen.getByText('Disponible').className).toContain('text-success');
    expect(screen.getByRole('status')).toHaveTextContent('AtenciónRevise los datos.');
  });
});

describe('navegación y tablas', () => {
  it('la ruta de navegación marca la página actual', () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/app">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Estado</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    expect(screen.getByRole('navigation', { name: 'Ruta de navegación' })).toBeVisible();
    expect(screen.getByText('Estado')).toHaveAttribute('aria-current', 'page');
  });
});

describe('tablas', () => {
  it('la tabla y el separador se dibujan con su estructura', () => {
    render(
      <>
        <Table>
          <TableCaption>Piezas</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Pieza</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Base de datos</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Separator orientation="vertical" />
      </>,
    );
    expect(screen.getByRole('table', { name: 'Piezas' })).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Base de datos' })).toBeVisible();
  });
});
