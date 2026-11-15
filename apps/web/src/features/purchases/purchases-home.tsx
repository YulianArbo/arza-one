'use client';

import { Card, CardDescription, CardHeader, CardTitle } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { RequirePermission, usePermissions } from '../session/permissions';

// Portada de Compras (M11). El B33 deja solicitudes, cuadro comparativo, órdenes, recepciones,
// evaluación de proveedores y viajes; el B34, el inventario de activos y sus mantenimientos.

const PURCHASE_HOME_PERMISSIONS = [
  'purchase.read',
  'purchase.request.create',
  'purchase.travel.request',
  'asset.read',
] as const;

const LINKS = [
  {
    href: '/app/compras/solicitudes',
    title: 'Solicitudes de compra',
    description: 'Pida una compra, envíela a aprobación y siga su estado.',
    anyOf: ['purchase.read', 'purchase.request.create'],
  },
  {
    href: '/app/compras/cuadro-comparativo',
    title: 'Cuadro comparativo',
    description: 'Cotizaciones de cada solicitud aprobada, lado a lado, y emisión de la orden.',
    anyOf: ['purchase.read'],
  },
  {
    href: '/app/compras/ordenes',
    title: 'Órdenes de compra',
    description: 'Órdenes emitidas, su recepción y su cierre.',
    anyOf: ['purchase.read'],
  },
  {
    href: '/app/compras/recepciones',
    title: 'Recepciones',
    description: 'Recepciones conformes y novedades de las órdenes.',
    anyOf: ['purchase.read'],
  },
  {
    href: '/app/compras/proveedores',
    title: 'Evaluación de proveedores',
    description: 'Selección y reevaluación de proveedores por periodo.',
    anyOf: ['purchase.read'],
  },
  {
    href: '/app/compras/viajes',
    title: 'Viajes y legalizaciones',
    description: 'Solicitudes de viaje, su aprobación y la legalización de gastos.',
    anyOf: ['purchase.read', 'purchase.travel.request'],
  },
  {
    href: '/app/compras/activos',
    title: 'Activos',
    description: 'Inventario, asignación en comodato, devoluciones, bajas y libro de activos.',
    anyOf: ['asset.read'],
  },
  {
    href: '/app/compras/activos/mantenimientos',
    title: 'Mantenimientos de activos',
    description: 'Mantenimientos programados y hechos, con su costo.',
    anyOf: ['asset.read'],
  },
] as const;

export function PurchasesHome(): JSX.Element {
  const { can } = usePermissions();
  return (
    <RequirePermission anyOf={PURCHASE_HOME_PERMISSIONS}>
      <div className="flex flex-col gap-4">
        <PageHeader title="Compras" />
        {LINKS.filter((link) => link.anyOf.some((code) => can(code))).map((link) => (
          <PurchaseLink
            key={link.href}
            href={link.href}
            title={link.title}
            description={link.description}
          />
        ))}
      </div>
    </RequirePermission>
  );
}

function PurchaseLink(props: {
  readonly href: string;
  readonly title: string;
  readonly description: string;
}): JSX.Element {
  return (
    <Link
      href={props.href}
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="h-full hover-invert">
        <CardHeader>
          <CardTitle className="text-base">{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
