'use client';

import {
  purchaseOrderListResponseSchema,
  purchaseRequestListResponseSchema,
} from '@arza/contracts';
import { AttentionList, buttonVariants, HighlightCard, QuickLinks, StageSummary } from '@arza/ui';
import { ClipboardList, Columns3, FilePlus, FileText, PackageCheck, Plus } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { visibleSubmodules } from '../../components/app-shell/submodules';
import { QueryState } from '../administration/query-state';
import { RequirePermission, usePermissions } from '../session/permissions';
import { purchaseJourney, stageToHighlight, type JourneyStage } from './purchase-journey';
import { usePurchaseQuery } from './purchase-ui';

// Portada de Compras (B22B, boceto 07): el recorrido por etapas, la etapa que pide atención,
// los recursos del módulo y sus demás funciones. Cada persona ve lo que su permiso le deja.

const PURCHASE_HOME_PERMISSIONS = [
  'purchase.read',
  'purchase.request.create',
  'purchase.travel.request',
  'asset.read',
] as const;

/** Abre Solicitudes con el formulario de una solicitud nueva. */
const NEW_REQUEST_PATH = '/app/compras/solicitudes?nueva=1';

const STAGE_ICONS = {
  need: <FilePlus />,
  compare: <Columns3 />,
  order: <ClipboardList />,
  receive: <PackageCheck />,
} as const;

// Recursos de Compras: proveedores, activos y viajes, cada uno con lo que se hace allí.
const RESOURCES = [
  {
    href: '/app/compras/proveedores',
    title: 'Proveedores',
    description: 'Consulte evaluaciones antes de elegir una oferta.',
  },
  {
    href: '/app/compras/activos',
    title: 'Activos',
    description: 'Inventario, asignaciones en comodato, devoluciones y bajas.',
  },
  {
    href: '/app/compras/activos/mantenimientos',
    title: 'Mantenimientos',
    description: 'Mantenimientos programados y hechos, con su costo.',
  },
  {
    href: '/app/compras/viajes',
    title: 'Viajes',
    description: 'Solicitudes de viaje y legalización de gastos.',
  },
] as const;

const PROCESS_HREFS = new Set([
  '/app/compras/solicitudes',
  '/app/compras/cuadro-comparativo',
  '/app/compras/ordenes',
  '/app/compras/recepciones',
]);

function StageCard({ stage }: { readonly stage: JourneyStage }): JSX.Element {
  const count = stage.records.length;
  return (
    <HighlightCard
      title={stage.label}
      description={
        count === 0
          ? 'No hay registros esperando en esta etapa.'
          : `${String(count)} ${count === 1 ? 'registro requiere' : 'registros requieren'} atención en esta etapa.`
      }
    >
      <AttentionList
        linkAs={Link}
        items={stage.records.slice(0, 3).map((record) => ({
          id: record.id,
          title: record.code,
          meta: record.text,
          href: stage.href,
          icon: <FileText />,
        }))}
      />
      <Link
        href={stage.href}
        className={buttonVariants({ variant: 'outline', className: 'self-start' })}
      >
        Abrir {stage.caption.toLowerCase()}
      </Link>
    </HighlightCard>
  );
}

const TWO_COLUMNS = 'grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]';

interface JourneyProps {
  readonly stages: readonly JourneyStage[];
  readonly aside: JSX.Element | null;
}

/** Etapas a todo el ancho y, debajo, la etapa destacada junto a `aside`. */
function JourneyView({ stages, aside }: JourneyProps): JSX.Element {
  const current = stageToHighlight(stages);
  return (
    <div className="flex flex-col gap-5">
      <StageSummary
        label="Etapas de compras"
        linkAs={Link}
        current={current?.key}
        stages={stages.map((stage) => ({
          key: stage.key,
          label: stage.label,
          count: stage.records.length,
          caption: stage.caption,
          href: stage.href,
          icon: STAGE_ICONS[stage.key],
        }))}
      />
      <div className={TWO_COLUMNS}>
        {current ? <StageCard stage={current} /> : null}
        {aside}
      </div>
    </div>
  );
}

/**
 * Recorrido de compras, solo para quien lee todas las compras. Mientras carga o si falla, el
 * estado ocupa el lugar de las etapas y `aside` sigue a la vista.
 */
function PurchaseJourneyBlock({ aside }: { readonly aside: JSX.Element | null }): JSX.Element {
  const requests = usePurchaseQuery('/v1/purchase-requests', purchaseRequestListResponseSchema);
  const orders = usePurchaseQuery('/v1/purchase-orders', purchaseOrderListResponseSchema);
  if (requests.data && orders.data) {
    return (
      <JourneyView stages={purchaseJourney(requests.data.data, orders.data.data)} aside={aside} />
    );
  }
  return (
    <div className={TWO_COLUMNS}>
      {requests.data ? (
        <QueryState query={orders} loadingLabel="Cargando el recorrido de compras">
          {() => null}
        </QueryState>
      ) : (
        <QueryState query={requests} loadingLabel="Cargando el recorrido de compras">
          {() => null}
        </QueryState>
      )}
      {aside}
    </div>
  );
}

function ResourcesCard({ granted }: { readonly granted: ReadonlySet<string> }): JSX.Element | null {
  const allowed = new Set(visibleSubmodules('compras', granted).map((entry) => entry.href));
  const resources = RESOURCES.filter((resource) => allowed.has(resource.href));
  if (resources.length === 0) return null;
  return (
    <HighlightCard title="Gestión de recursos">
      <ul className="flex flex-col">
        {resources.map((resource) => (
          <li key={resource.href} className="border-b last:border-b-0">
            <Link
              href={resource.href}
              className="flex flex-col gap-0.5 rounded-md px-2 py-3 transition-colors duration-200 hover:bg-accent"
            >
              <span className="font-semibold">{resource.title}</span>{' '}
              <span className="text-muted-foreground">{resource.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </HighlightCard>
  );
}

export function PurchasesHome(): JSX.Element {
  const { can, granted } = usePermissions();
  const process = visibleSubmodules('compras', granted)
    .filter((entry) => PROCESS_HREFS.has(entry.href))
    .map((entry) => ({ href: entry.href, label: entry.label, icon: <entry.icon /> }));
  return (
    <RequirePermission anyOf={PURCHASE_HOME_PERMISSIONS}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Compras"
          description="Ubique cada compra en el recorrido desde la solicitud hasta la recepción."
          action={
            can('purchase.request.create') ? (
              <Link href={NEW_REQUEST_PATH} className={buttonVariants()}>
                <Plus aria-hidden="true" />
                Nueva solicitud
              </Link>
            ) : null
          }
        />
        {can('purchase.read') ? (
          <PurchaseJourneyBlock aside={<ResourcesCard granted={granted} />} />
        ) : (
          <div className={TWO_COLUMNS}>
            <ResourcesCard granted={granted} />
          </div>
        )}
        {process.length > 0 ? (
          <QuickLinks title="También en Compras" links={process} linkAs={Link} />
        ) : null}
      </div>
    </RequirePermission>
  );
}
