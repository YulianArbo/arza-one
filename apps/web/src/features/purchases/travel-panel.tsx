'use client';

import { travelRequestListResponseSchema, type TravelRequest } from '@arza/contracts';
import { Badge, EmptyState, SimpleTable } from '@arza/ui';
import { Plane } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { NewRecord } from '../finance/ledger-ui';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { TRAVEL_STATUS_LABELS } from './labels';
import { PurchaseButton, RejectForm, usePurchaseQuery } from './purchase-ui';
import { TravelForm } from './travel-form';
import { ExpenseTable, TravelLegalization, balanceText } from './travel-legalization';

// Viajes y legalizaciones (B33): el viajero pide el viaje y lo envía; otra persona lo aprueba; al
// volver, el viajero lo legaliza con sus gastos y soportes.

const DESCRIPTIONS = {
  all: 'Viajes de la empresa con su anticipo y su legalización. Los aprueba otra persona que el viajero.',
  mine: 'Pida sus viajes, siga su aprobación y legalícelos con sus gastos y soportes.',
};

export function TravelPanel(): JSX.Element {
  const { can } = usePermissions();
  const all = can('purchase.read');
  const path = all ? '/v1/travel-requests' : '/v1/travel-requests/mine';
  const travels = usePurchaseQuery(path, travelRequestListResponseSchema);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Viajes y legalizaciones"
        description={all ? DESCRIPTIONS.all : DESCRIPTIONS.mine}
      />
      <NewRecord
        allowed={can('purchase.travel.request')}
        label="Nueva solicitud de viaje"
        title="Nueva solicitud de viaje"
        description="Queda en borrador hasta que usted la envíe a aprobación."
      >
        {(close) => <TravelForm onDone={close} />}
      </NewRecord>
      <QueryState query={travels} loadingLabel="Cargando viajes">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<Plane />}
              title="Aún no hay viajes"
              description="Las solicitudes de viaje aparecerán aquí con su estado."
            />
          ) : (
            <TravelTable travels={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

function TravelTable({ travels }: { readonly travels: readonly TravelRequest[] }): JSX.Element {
  return (
    <SimpleTable
      headers={['Código', 'Viajero', 'Destino', 'Fechas', 'Anticipo', 'Estado', '']}
      caption="Viajes"
    >
      {travels.map((travel) => (
        <tr key={travel.id}>
          <td className="p-2 font-medium">{travel.code}</td>
          <td className="p-2">{travel.traveler.name}</td>
          <td className="p-2">
            {travel.destination}
            <span className="block text-xs text-muted-foreground">{travel.purpose}</span>
          </td>
          <td className="p-2">
            {formatDate(travel.starts_on)} a {formatDate(travel.ends_on)}
          </td>
          <td className="p-2">{formatPesos(travel.advance_amount)}</td>
          <td className="p-2">
            <TravelState travel={travel} />
          </td>
          <td className="p-2">
            <TravelActions travel={travel} />
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function TravelState({ travel }: { readonly travel: TravelRequest }): JSX.Element {
  return (
    <>
      <Badge>{TRAVEL_STATUS_LABELS[travel.status]}</Badge>
      {travel.decision_note === null ? null : (
        <span className="block text-xs text-muted-foreground">{travel.decision_note}</span>
      )}
      {travel.status === 'legalized' ? (
        <span className="block text-xs text-muted-foreground">{balanceText(travel.balance)}</span>
      ) : null}
    </>
  );
}

function TravelActions({ travel }: { readonly travel: TravelRequest }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  if (travel.status === 'draft' && travel.mine) {
    return (
      <PurchaseButton
        label="Enviar a aprobación"
        pendingLabel="Enviando…"
        ariaLabel={`Enviar a aprobación el viaje ${travel.code}`}
        run={(csrfToken) =>
          api.post(`/v1/travel-requests/${travel.id}/submission`, {
            body: {},
            version: travel.version,
            csrfToken,
          })
        }
      />
    );
  }
  if (travel.status === 'in_approval' && can('purchase.travel.approve')) {
    return <TravelDecision travel={travel} />;
  }
  if (travel.status === 'approved' && travel.mine) return <LegalizeDialog travel={travel} />;
  if (travel.status === 'legalized') return <ExpensesDialog travel={travel} />;
  return null;
}

function LegalizeDialog({ travel }: { readonly travel: TravelRequest }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Legalizar"
      triggerAriaLabel={`Legalizar viaje ${travel.code}`}
      title={`Legalizar el viaje ${travel.code}`}
      description="Registre cada gasto con su soporte. Se legaliza desde el día de salida."
      variant="outline"
    >
      {(close) => <TravelLegalization travel={travel} onDone={close} />}
    </RecordDialog>
  );
}

function ExpensesDialog({ travel }: { readonly travel: TravelRequest }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Ver gastos"
      triggerAriaLabel={`Ver los gastos del viaje ${travel.code}`}
      title={`Gastos del viaje ${travel.code}`}
      description="Gastos legalizados con su saldo frente al anticipo."
      variant="outline"
    >
      {() => <ExpenseTable travel={travel} />}
    </RecordDialog>
  );
}

function TravelDecision({ travel }: { readonly travel: TravelRequest }): JSX.Element {
  const api = useApiClient();
  const path = `/v1/travel-requests/${travel.id}`;
  if (travel.mine) {
    return <span className="text-xs text-muted-foreground">Lo aprueba otra persona</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <PurchaseButton
        label="Aprobar"
        pendingLabel="Aprobando…"
        ariaLabel={`Aprobar el viaje ${travel.code}`}
        run={(csrfToken) =>
          api.post(`${path}/approval`, { body: {}, version: travel.version, csrfToken })
        }
      />
      <RecordDialog
        triggerLabel="Rechazar"
        triggerAriaLabel={`Rechazar el viaje ${travel.code}`}
        title={`Rechazar el viaje ${travel.code}`}
        description="Escriba el motivo; el viajero lo verá."
        variant="outline"
      >
        {(close) => (
          <RejectForm
            fieldId="travel-reject-reason"
            submitLabel="Rechazar viaje"
            onDone={close}
            run={(body, csrfToken) =>
              api.post(`${path}/rejection`, { body, version: travel.version, csrfToken })
            }
          />
        )}
      </RecordDialog>
    </div>
  );
}
