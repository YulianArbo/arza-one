'use client';

import { purchaseRequestListResponseSchema, type PurchaseRequest } from '@arza/contracts';
import { Badge, EmptyState, SimpleTable } from '@arza/ui';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { NewRecord } from '../finance/ledger-ui';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { REQUEST_STATUS, TIER_LABELS, quotesText } from './labels';
import { PurchaseButton, RejectForm, usePurchaseQuery } from './purchase-ui';
import { RequestForm } from './request-form';

// Solicitudes de compra (B33): el colaborador pide y envía las suyas; otra persona las aprueba o
// rechaza. El tramo alto lo aprueba la Dirección.

const DESCRIPTIONS = {
  all: 'Solicitudes de compra de la empresa. Las aprueba una persona distinta de quien las pidió.',
  mine: 'Pida sus compras, envíelas a aprobación y siga su estado.',
};

/** startNew: llega desde «Nueva solicitud» de la portada y abre el formulario (B22B). */
export function RequestsPanel({ startNew = false }: { readonly startNew?: boolean }): JSX.Element {
  const { can } = usePermissions();
  const all = can('purchase.read');
  const path = all ? '/v1/purchase-requests' : '/v1/purchase-requests/mine';
  const requests = usePurchaseQuery(path, purchaseRequestListResponseSchema);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Solicitudes de compra"
        description={all ? DESCRIPTIONS.all : DESCRIPTIONS.mine}
      />
      <NewRecord
        allowed={can('purchase.request.create')}
        startOpen={startNew}
        label="Nueva solicitud"
        title="Nueva solicitud de compra"
        description="Queda en borrador hasta que usted la envíe a aprobación."
      >
        {(close) => <RequestForm onDone={close} />}
      </NewRecord>
      <QueryState query={requests} loadingLabel="Cargando solicitudes de compra">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart />}
              title="Aún no hay solicitudes de compra"
              description="Las solicitudes aparecerán aquí con su estado."
            />
          ) : (
            <RequestTable requests={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

function RequestTable({
  requests,
}: {
  readonly requests: readonly PurchaseRequest[];
}): JSX.Element {
  return (
    <SimpleTable
      headers={['Código', 'Descripción', 'Centro de costo', 'Valor', 'Exige', 'Estado', '']}
      caption="Solicitudes de compra"
    >
      {requests.map((request) => (
        <tr key={request.id}>
          <td className="p-2 font-medium">{request.code}</td>
          <td className="p-2">
            {request.description}
            <span className="block text-xs text-muted-foreground">
              Pide: {request.requester.name}
            </span>
          </td>
          <td className="p-2">{request.cost_center.code}</td>
          <td className="p-2">{formatPesos(request.approval_amount)}</td>
          <td className="p-2">
            <Requirement request={request} />
          </td>
          <td className="p-2">
            <Badge>{REQUEST_STATUS[request.status]}</Badge>
            {request.decision_note === null ? null : (
              <span className="block text-xs text-muted-foreground">{request.decision_note}</span>
            )}
          </td>
          <td className="p-2">
            <RequestActions request={request} />
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function Requirement({ request }: { readonly request: PurchaseRequest }): JSX.Element {
  if (request.tier === null || request.min_quotes === null) {
    return <span className="text-xs text-muted-foreground">Sin topes vigentes</span>;
  }
  return (
    <>
      {quotesText(request.min_quotes)}
      <span className="block text-xs text-muted-foreground">{TIER_LABELS[request.tier]}</span>
    </>
  );
}

function RequestActions({ request }: { readonly request: PurchaseRequest }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  if (request.status === 'draft' && request.mine) {
    return (
      <PurchaseButton
        label="Enviar a aprobación"
        pendingLabel="Enviando…"
        ariaLabel={`Enviar a aprobación la solicitud ${request.code}`}
        run={(csrfToken) =>
          api.post(`/v1/purchase-requests/${request.id}/submission`, {
            body: {},
            version: request.version,
            csrfToken,
          })
        }
      />
    );
  }
  if (request.status === 'in_approval' && can('purchase.request.approve')) {
    return <RequestDecision request={request} />;
  }
  const quoting = request.status === 'approved' || request.status === 'quoted';
  if (quoting && can('purchase.order.issue')) {
    return (
      <Link className="text-sm underline" href="/app/compras/cuadro-comparativo">
        Ir al cuadro comparativo
      </Link>
    );
  }
  return null;
}

function RequestDecision({ request }: { readonly request: PurchaseRequest }): JSX.Element {
  const api = useApiClient();
  const { can } = usePermissions();
  const path = `/v1/purchase-requests/${request.id}`;
  if (request.mine) {
    return <span className="text-xs text-muted-foreground">La aprueba otra persona</span>;
  }
  if (request.tier === 'high' && !can('purchase.request.approve_high')) {
    return <span className="text-xs text-muted-foreground">La aprueba la Dirección</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <PurchaseButton
        label="Aprobar"
        pendingLabel="Aprobando…"
        ariaLabel={`Aprobar la solicitud ${request.code}`}
        run={(csrfToken) =>
          api.post(`${path}/approval`, { body: {}, version: request.version, csrfToken })
        }
      />
      <RejectDialog request={request} />
    </div>
  );
}

function RejectDialog({ request }: { readonly request: PurchaseRequest }): JSX.Element {
  const api = useApiClient();
  return (
    <RecordDialog
      triggerLabel="Rechazar"
      triggerAriaLabel={`Rechazar la solicitud ${request.code}`}
      title={`Rechazar la solicitud ${request.code}`}
      description="Escriba el motivo; la persona que la pidió lo verá."
      variant="outline"
    >
      {(close) => (
        <RejectForm
          fieldId="request-reject-reason"
          submitLabel="Rechazar solicitud"
          onDone={close}
          run={(body, csrfToken) =>
            api.post(`/v1/purchase-requests/${request.id}/rejection`, {
              body,
              version: request.version,
              csrfToken,
            })
          }
        />
      )}
    </RecordDialog>
  );
}
