import {
  AttentionList,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  HighlightCard,
  QuickLinks,
  StageSummary,
} from '@arza/ui';
import {
  ClipboardCheck,
  ClipboardList,
  Columns3,
  FilePlus,
  Package,
  Plane,
  Truck,
  User,
} from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

// Datos de ejemplo del muestrario: no corresponden a registros reales.
const STAGES = [
  {
    key: 'need',
    label: 'Evaluar la necesidad',
    count: 3,
    caption: 'Solicitudes',
    href: '#jerarquia',
    icon: <FilePlus />,
  },
  {
    key: 'compare',
    label: 'Comparar cotizaciones',
    count: 2,
    caption: 'Cuadro comparativo',
    href: '#jerarquia',
    icon: <Columns3 />,
  },
  {
    key: 'order',
    label: 'Emitir la orden',
    count: 4,
    caption: 'Órdenes',
    href: '#jerarquia',
    icon: <ClipboardList />,
  },
  {
    key: 'receive',
    label: 'Confirmar la entrega',
    count: 1,
    caption: 'Recepciones',
    href: '#jerarquia',
    icon: <Package />,
  },
];

const PENDING = [
  {
    id: 'ej-1',
    title: 'Revisar solicitud de compra',
    meta: 'Compras · vence hoy',
    href: '#jerarquia',
    icon: <FilePlus />,
  },
  {
    id: 'ej-2',
    title: 'Validar informe técnico',
    meta: 'Proyectos · vence mañana',
    href: '#jerarquia',
    icon: <ClipboardCheck />,
  },
  {
    id: 'ej-3',
    title: 'Evaluar candidatura',
    meta: 'Talento y SST · vence el 20/11/2026',
    href: '#jerarquia',
    icon: <User />,
  },
];

const LINKS = [
  { href: '#jerarquia', label: 'Proveedores', icon: <Truck /> },
  { href: '#jerarquia-viajes', label: 'Viajes', icon: <Plane /> },
];

/** Piezas de la nueva jerarquía (B22B): etapas, tarjeta destacada, pendientes y accesos. */
export function HierarchySection(): JSX.Element {
  return (
    <Card aria-labelledby="hierarchy-title" id="jerarquia">
      <CardHeader>
        <CardTitle id="hierarchy-title">Jerarquía de pantallas</CardTitle>
        <CardDescription>
          Recorrido por etapas, tarjeta destacada, pendientes y accesos del módulo (B22B).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <StageSummary
          label="Etapas de compras (ejemplo)"
          stages={STAGES}
          current="need"
          linkAs={Link}
        />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <HighlightCard title="Requieren su atención" highlighted>
            <AttentionList items={PENDING} linkAs={Link} />
          </HighlightCard>
          <HighlightCard title="Gestión de recursos" description="Bloque secundario, borde fino.">
            <p className="text-muted-foreground">Contenido de apoyo del módulo.</p>
          </HighlightCard>
        </div>
        <QuickLinks title="También en Compras" links={LINKS} linkAs={Link} />
      </CardContent>
    </Card>
  );
}
