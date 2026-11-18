'use client';

import {
  purchaseCreatedResponseSchema,
  purchaseOrderListResponseSchema,
  registerReceiptSchema,
  type PurchaseOrder,
  type RegisterReceipt,
} from '@arza/contracts';
import { Badge, EmptyState, SimpleTable } from '@arza/ui';
import { PackageCheck } from 'lucide-react';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { LedgerField, problemsOf } from '../finance/ledger-ui';
import { CheckboxField, RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { ORDER_STATUS } from './labels';
import { PurchaseButton, usePurchaseAction, usePurchaseQuery } from './purchase-ui';

// Órdenes de compra (B33): se reciben (otra persona que quien pidió la compra) y se cierran. Una
// recepción no conforme queda como novedad y la orden sigue abierta.

export function OrdersPanel(): JSX.Element {
  const orders = usePurchaseQuery('/v1/purchase-orders', purchaseOrderListResponseSchema);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Órdenes de compra"
        description="Órdenes emitidas a proveedores. Las recibe una persona distinta de quien pidió la compra."
      />
      <QueryState query={orders} loadingLabel="Cargando órdenes de compra">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<PackageCheck />}
              title="Aún no hay órdenes de compra"
              description="Las órdenes se emiten desde el cuadro comparativo."
            />
          ) : (
            <OrderTable orders={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

function OrderTable({ orders }: { readonly orders: readonly PurchaseOrder[] }): JSX.Element {
  return (
    <SimpleTable
      headers={['Orden', 'Solicitud', 'Proveedor', 'Total', 'Emitida', 'Estado', '']}
      caption="Órdenes de compra"
    >
      {orders.map((order) => (
        <tr key={order.id}>
          <td className="p-2 font-medium">{order.code}</td>
          <td className="p-2">
            {order.request.code}
            <span className="block text-xs text-muted-foreground">{order.request.description}</span>
          </td>
          <td className="p-2">{order.supplier.name}</td>
          <td className="p-2">{formatPesos(order.total)}</td>
          <td className="p-2">{formatDate(order.issued_at.slice(0, 10))}</td>
          <td className="p-2">
            <Badge>{ORDER_STATUS[order.status]}</Badge>
          </td>
          <td className="p-2">
            <OrderActions order={order} />
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function OrderActions({ order }: { readonly order: PurchaseOrder }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  if (order.status === 'issued' && can('purchase.order.receive')) {
    if (order.requested_by_me) {
      return <span className="text-xs text-muted-foreground">La recibe otra persona</span>;
    }
    return (
      <RecordDialog
        triggerLabel="Registrar recepción"
        triggerAriaLabel={`Registrar recepción de la orden ${order.code}`}
        title={`Recepción de la orden ${order.code}`}
        description="Indique si llegó conforme. Si no, explique la novedad; la orden sigue abierta."
        variant="outline"
      >
        {(close) => <ReceiptForm order={order} onDone={close} />}
      </RecordDialog>
    );
  }
  if (order.status === 'received' && can('purchase.order.issue')) {
    return (
      <PurchaseButton
        label="Cerrar"
        pendingLabel="Cerrando…"
        ariaLabel={`Cerrar la orden ${order.code}`}
        run={(csrfToken) =>
          api.post(`/v1/purchase-orders/${order.id}/closure`, {
            body: {},
            version: order.version,
            csrfToken,
          })
        }
      />
    );
  }
  return null;
}

function useReceiptForm(order: PurchaseOrder, onDone: () => void) {
  const api = useApiClient();
  const [receivedOn, setReceivedOn] = useState('');
  const [conforming, setConforming] = useState(true);
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [key] = useState(() => crypto.randomUUID());
  const action = usePurchaseAction<RegisterReceipt>(
    (body, csrfToken) =>
      api.post(`/v1/purchase-orders/${order.id}/receipts`, {
        body,
        schema: purchaseCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onDone,
  );
  const submit = (): void => {
    const valid = registerReceiptSchema.safeParse({
      received_on: receivedOn,
      conforming,
      note: note.trim() === '' ? null : note,
    });
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  return {
    receivedOn,
    setReceivedOn,
    conforming,
    setConforming,
    note,
    setNote,
    problems,
    action,
    submit,
  };
}

function ReceiptForm(props: {
  readonly order: PurchaseOrder;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useReceiptForm(props.order, props.onDone);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.submit();
      }}
    >
      <ReceiptFields form={form} />
      {form.action.error === null ? null : <FormError error={form.action.error} />}
      <SubmitButton
        label="Registrar recepción"
        pendingLabel="Registrando…"
        pending={form.action.pending}
      />
      {form.action.dialog}
    </form>
  );
}

function ReceiptFields(props: { readonly form: ReturnType<typeof useReceiptForm> }): JSX.Element {
  const { form } = props;
  return (
    <>
      <LedgerField
        id="receipt-date"
        label="Fecha de recepción"
        type="date"
        value={form.receivedOn}
        onChange={form.setReceivedOn}
        error={form.problems['received_on'] === undefined ? undefined : 'Escriba la fecha.'}
      />
      <CheckboxField
        id="receipt-conforming"
        label="Llegó conforme"
        checked={form.conforming}
        onChange={form.setConforming}
      />
      <LedgerField
        id="receipt-note"
        label={form.conforming ? 'Observación (opcional)' : 'Novedad'}
        value={form.note}
        onChange={form.setNote}
        error={form.problems['note']}
      />
    </>
  );
}
