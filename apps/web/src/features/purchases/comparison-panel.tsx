'use client';

import {
  purchaseCreatedResponseSchema,
  purchaseRequestListResponseSchema,
  type PurchaseQuote,
  type PurchaseRequest,
} from '@arza/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, SimpleTable } from '@arza/ui';
import { Scale } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { NewRecord } from '../finance/ledger-ui';
import { usePermissions } from '../session/permissions';
import { REQUEST_STATUS, quotesText } from './labels';
import { PurchaseButton, usePurchaseQuery } from './purchase-ui';
import { QuoteForm } from './quote-form';

// Cuadro comparativo (B33, FT-ADM-001): las cotizaciones de cada solicitud aprobada, lado a lado.
// Elegir exige las cotizaciones mínimas del tramo; la orden solo se emite a un proveedor con
// conocimiento del tercero vigente.

/** Solicitudes que están cotizando: aprobadas, cotizadas o devueltas a aprobación por su valor. */
function isQuoting(request: PurchaseRequest): boolean {
  if (request.status === 'approved' || request.status === 'quoted') return true;
  return request.status === 'in_approval' && request.quotes.length > 0;
}

export function ComparisonPanel(): JSX.Element {
  const requests = usePurchaseQuery('/v1/purchase-requests', purchaseRequestListResponseSchema);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cuadro comparativo"
        description="Compare las cotizaciones de cada solicitud aprobada, elija una y emita la orden."
      />
      <QueryState query={requests} loadingLabel="Cargando el cuadro comparativo">
        {(result) => {
          const quoting = result.data.filter(isQuoting);
          return quoting.length === 0 ? (
            <EmptyState
              icon={<Scale />}
              title="No hay solicitudes por cotizar"
              description="Las solicitudes aprobadas aparecerán aquí para cargar sus cotizaciones."
            />
          ) : (
            <>
              {quoting.map((request) => (
                <ComparisonCard key={request.id} request={request} />
              ))}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

function ComparisonCard({ request }: { readonly request: PurchaseRequest }): JSX.Element {
  const { can } = usePermissions();
  const open = request.status === 'approved' || request.status === 'quoted';
  const manage = open && can('purchase.order.issue');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {request.code} · {request.description}
        </CardTitle>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>{REQUEST_STATUS[request.status]}</Badge>
          <QuoteCount request={request} />
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {request.quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tiene cotizaciones.</p>
        ) : (
          <QuoteTable request={request} manage={manage} />
        )}
        <NewRecord
          allowed={manage}
          label="Agregar cotización"
          title={`Agregar cotización a ${request.code}`}
          description="Adjunte la cotización del proveedor."
        >
          {(close) => <QuoteForm request={request} onDone={close} />}
        </NewRecord>
        {manage && request.status === 'quoted' ? <IssueOrder request={request} /> : null}
      </CardContent>
    </Card>
  );
}

function QuoteCount({ request }: { readonly request: PurchaseRequest }): JSX.Element {
  const has = quotesText(request.quotes.length);
  if (request.min_quotes === null) return <span>Tiene {has}.</span>;
  return (
    <span>
      Exige {quotesText(request.min_quotes)}; tiene {has}.
    </span>
  );
}

function QuoteTable(props: {
  readonly request: PurchaseRequest;
  readonly manage: boolean;
}): JSX.Element {
  return (
    <SimpleTable
      headers={['Proveedor', 'Valor', 'Entrega', 'Elegida', '']}
      caption={`Cotizaciones de ${props.request.code}`}
    >
      {props.request.quotes.map((quote) => (
        <tr key={quote.id}>
          <td className="p-2">
            {quote.supplier.name}
            {quote.supplier.verified ? null : (
              <span className="block text-xs text-muted-foreground">
                Sin conocimiento del tercero vigente
              </span>
            )}
          </td>
          <td className="p-2">{formatPesos(quote.amount)}</td>
          <td className="p-2">{String(quote.delivery_days)} días</td>
          <td className="p-2">{quote.selected ? <Badge>Elegida</Badge> : 'No'}</td>
          <td className="p-2">
            {props.manage && !quote.selected ? (
              <QuoteActions request={props.request} quote={quote} />
            ) : null}
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function QuoteActions(props: {
  readonly request: PurchaseRequest;
  readonly quote: PurchaseQuote;
}): JSX.Element {
  const api = useApiClient();
  const { request, quote } = props;
  const name = `${quote.supplier.name} en ${request.code}`;
  return (
    <div className="flex flex-wrap gap-2">
      <PurchaseButton
        label="Elegir"
        pendingLabel="Eligiendo…"
        ariaLabel={`Elegir la cotización de ${name}`}
        run={(csrfToken) =>
          api.post(`/v1/purchase-quotes/${quote.id}/selection`, {
            body: {},
            version: request.version,
            csrfToken,
          })
        }
      />
      <PurchaseButton
        label="Quitar"
        pendingLabel="Quitando…"
        ariaLabel={`Quitar la cotización de ${name}`}
        run={(csrfToken) => api.delete(`/v1/purchase-quotes/${quote.id}`, { csrfToken })}
      />
    </div>
  );
}

function IssueOrder({ request }: { readonly request: PurchaseRequest }): JSX.Element {
  const api = useApiClient();
  return (
    <PurchaseButton
      label="Emitir orden de compra"
      pendingLabel="Emitiendo…"
      ariaLabel={`Emitir la orden de compra de ${request.code}`}
      run={(csrfToken) =>
        api.post(`/v1/purchase-requests/${request.id}/order`, {
          body: {},
          schema: purchaseCreatedResponseSchema,
          version: request.version,
          csrfToken,
        })
      }
    />
  );
}
