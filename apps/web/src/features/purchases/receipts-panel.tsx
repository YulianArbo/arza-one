'use client';

import { purchaseOrderListResponseSchema, type PurchaseOrder } from '@arza/contracts';
import { Badge, EmptyState, SimpleTable } from '@arza/ui';
import { ClipboardCheck } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePurchaseQuery } from './purchase-ui';

// Recepciones y novedades (B33, RE-ADM-002): cada recepción registrada, conforme o no, con quién
// la recibió. Se registran desde Órdenes de compra.

interface ReceiptRow {
  readonly id: string;
  readonly order: string;
  readonly supplier: string;
  readonly receivedOn: string;
  readonly receivedBy: string;
  readonly conforming: boolean;
  readonly note: string | null;
}

/** Todas las recepciones de las órdenes, de la más reciente a la más antigua. */
export function receiptRows(orders: readonly PurchaseOrder[]): ReceiptRow[] {
  const rows = orders.flatMap((order) =>
    order.receipts.map((receipt) => ({
      id: receipt.id,
      order: order.code,
      supplier: order.supplier.name,
      receivedOn: receipt.received_on,
      receivedBy: receipt.received_by.name,
      conforming: receipt.conforming,
      note: receipt.note,
    })),
  );
  return rows.sort((a, b) => b.receivedOn.localeCompare(a.receivedOn));
}

export function ReceiptsPanel(): JSX.Element {
  const orders = usePurchaseQuery('/v1/purchase-orders', purchaseOrderListResponseSchema);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Recepciones"
        description="Recepciones y novedades de las órdenes de compra. Se registran desde Órdenes de compra."
      />
      <QueryState query={orders} loadingLabel="Cargando recepciones">
        {(result) => {
          const rows = receiptRows(result.data);
          return rows.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck />}
              title="Aún no hay recepciones"
              description="Las recepciones registradas aparecerán aquí."
            />
          ) : (
            <ReceiptTable rows={rows} />
          );
        }}
      </QueryState>
    </div>
  );
}

function ReceiptTable({ rows }: { readonly rows: readonly ReceiptRow[] }): JSX.Element {
  return (
    <SimpleTable
      headers={['Orden', 'Proveedor', 'Fecha', 'Recibió', 'Resultado', 'Novedad']}
      caption="Recepciones"
    >
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="p-2 font-medium">{row.order}</td>
          <td className="p-2">{row.supplier}</td>
          <td className="p-2">{formatDate(row.receivedOn)}</td>
          <td className="p-2">{row.receivedBy}</td>
          <td className="p-2">
            <Badge>{row.conforming ? 'Conforme' : 'No conforme'}</Badge>
          </td>
          <td className="p-2">{row.note ?? '—'}</td>
        </tr>
      ))}
    </SimpleTable>
  );
}
