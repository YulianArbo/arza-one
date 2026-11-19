import type { PurchaseOrder, PurchaseRequest } from '@arza/contracts';

// Recorrido de Compras por etapas (B22B, boceto 07), calculado con lo que ya entrega la API: las
// solicitudes con su estado y las órdenes con el suyo.

export type JourneyStageKey = 'need' | 'compare' | 'order' | 'receive';

export interface JourneyStage {
  readonly key: JourneyStageKey;
  readonly label: string;
  readonly caption: string;
  readonly href: string;
  /** Registros que esperan en la etapa: código y descripción, para enlazarlos. */
  readonly records: readonly {
    readonly id: string;
    readonly code: string;
    readonly text: string;
  }[];
}

const REQUESTS = '/app/compras/solicitudes';
const COMPARISON = '/app/compras/cuadro-comparativo';
const RECEIPTS = '/app/compras/recepciones';

function requestsIn(
  requests: readonly PurchaseRequest[],
  status: PurchaseRequest['status'],
): JourneyStage['records'] {
  return requests
    .filter((request) => request.status === status)
    .map((request) => ({ id: request.id, code: request.code, text: request.description }));
}

/**
 * Cuatro etapas: evaluar la necesidad (solicitudes en aprobación), comparar cotizaciones
 * (aprobadas), emitir la orden (cotizadas) y confirmar la entrega (órdenes emitidas sin recibir).
 */
export function purchaseJourney(
  requests: readonly PurchaseRequest[],
  orders: readonly PurchaseOrder[],
): readonly JourneyStage[] {
  return [
    {
      key: 'need',
      label: 'Evaluar la necesidad',
      caption: 'Solicitudes',
      href: REQUESTS,
      records: requestsIn(requests, 'in_approval'),
    },
    {
      key: 'compare',
      label: 'Comparar cotizaciones',
      caption: 'Cuadro comparativo',
      href: COMPARISON,
      records: requestsIn(requests, 'approved'),
    },
    {
      key: 'order',
      label: 'Emitir la orden',
      caption: 'Por ordenar',
      href: COMPARISON,
      records: requestsIn(requests, 'quoted'),
    },
    {
      key: 'receive',
      label: 'Confirmar la entrega',
      caption: 'Recepciones',
      href: RECEIPTS,
      records: orders
        .filter((order) => order.status === 'issued')
        .map((order) => ({ id: order.id, code: order.code, text: order.request.description })),
    },
  ];
}

/** Etapa que se destaca: la primera con registros; si ninguna tiene, la primera. */
export function stageToHighlight(stages: readonly JourneyStage[]): JourneyStage | undefined {
  return stages.find((stage) => stage.records.length > 0) ?? stages[0];
}
