'use client';

import {
  IDENTITY_METHODS,
  PRIVACY_REQUEST_CHANNELS,
  PRIVACY_REQUEST_KINDS,
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_RIGHTS,
  type PrivacyRequest,
} from '@arza/contracts';
import { Alert, AlertDescription, Badge } from '@arza/ui';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { FactsCard, type Fact } from '../crm/crm-facts';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { ErasureCard, ExportsCard, HistoryCard, ResponseCard } from './request-cards';
import { dialogsOf, ExportClick, OPEN_STATUSES, StepClick } from './request-dialogs';
import { REQUEST_STATUS_TONES } from './request-labels';
import { usePrivacyRequest } from './request-queries';

// Ficha de la solicitud de un titular (B42, ficha 17.19): su plazo legal, lo que se puede hacer según
// el estado y el permiso, la entrega y la supresión de sus datos, la respuesta y la historia.

interface Props {
  readonly request: PrivacyRequest;
}

const OPEN = OPEN_STATUSES;

function messages(request: PrivacyRequest): { tone: 'info' | 'warning'; text: string }[] {
  const found: { tone: 'info' | 'warning'; text: string }[] = [];
  if (request.overdue)
    found.push({
      tone: 'warning',
      text: `Venció el ${formatDate(request.due_on)}: respóndala cuanto antes.`,
    });
  if (request.paused && request.requirement !== null) {
    found.push({
      tone: 'info',
      text: `Plazo suspendido: se le pidió al titular «${request.requirement.text}».`,
    });
  }
  if (
    request.requirement_open_until !== null &&
    request.requirement === null &&
    OPEN.has(request.status)
  ) {
    found.push({
      tone: 'info',
      text: `Si el reclamo está incompleto, pídale lo que falta hasta el ${formatDate(request.requirement_open_until)}.`,
    });
  }
  return found;
}

function facts(request: PrivacyRequest): Fact[] {
  const due = request.paused ? 'Suspendido' : formatDate(request.due_on);
  return [
    ['Qué pide', PRIVACY_RIGHTS[request.right]],
    ['Tipo', PRIVACY_REQUEST_KINDS[request.kind]],
    [
      'Canal',
      PRIVACY_REQUEST_CHANNELS[request.channel] +
        (request.source_code === null ? '' : ` (${request.source_code})`),
    ],
    ['Titular', request.party?.name ?? `${request.requester_name} (sin verificar)`],
    ['Correo', request.requester_email ?? 'Sin correo'],
    ['Teléfono', request.requester_phone ?? '—'],
    ['Documento', request.document_number ?? '—'],
    ['Recibida', formatDateTime(request.received_at)],
    [
      'Fecha límite',
      request.extended ? `${due} (con prórroga: ${request.extension_reason ?? ''})` : due,
    ],
    [
      'Identidad',
      request.verification === null
        ? 'Sin verificar'
        : `${IDENTITY_METHODS[request.verification.method]}: ${request.verification.note}`,
    ],
    ['Descripción', request.description],
  ];
}

function RequestActions({ request }: Props): JSX.Element | null {
  const { can } = usePermissions();
  const dialogs = dialogsOf(request, can);
  const canExport = request.status === 'in_progress' && can('privacy.data.export');
  if (
    dialogs.length === 0 &&
    !canExport &&
    request.status !== 'received' &&
    request.status !== 'responded'
  )
    return null;
  return (
    <div
      className="flex flex-wrap items-start gap-2"
      role="group"
      aria-label="Acciones de la solicitud"
    >
      {request.status === 'received' ? (
        <StepClick request={request} action="start-verification" label="Empezar la verificación" />
      ) : null}
      {dialogs.map((spec) => (
        <RecordDialog
          key={spec.label}
          triggerLabel={spec.label}
          variant="outline"
          title={spec.title}
          description={spec.description}
        >
          {spec.render}
        </RecordDialog>
      ))}
      {canExport ? <ExportClick request={request} /> : null}
      {request.status === 'responded' ? (
        <StepClick request={request} action="close" label="Cerrar la solicitud" />
      ) : null}
    </div>
  );
}

function Detail({ request }: Props): JSX.Element {
  return (
    <>
      <PageHeader
        title={request.code}
        description={`${PRIVACY_RIGHTS[request.right]} · ${request.party?.name ?? request.requester_name}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={REQUEST_STATUS_TONES[request.status]}>
          {PRIVACY_REQUEST_STATUSES[request.status]}
        </Badge>
        <Badge tone="neutral">{PRIVACY_REQUEST_KINDS[request.kind]}</Badge>
        {request.overdue ? <Badge tone="destructive">Vencida</Badge> : null}
      </div>
      {messages(request).map((message) => (
        <Alert key={message.text} tone={message.tone}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ))}
      <RequestActions request={request} />
      <FactsCard title="La solicitud" facts={facts(request)} />
      <ExportsCard request={request} />
      <ErasureCard request={request} />
      <ResponseCard request={request} />
      <HistoryCard request={request} />
    </>
  );
}

export function RequestDetail({ id }: { readonly id: string }): JSX.Element {
  const request = usePrivacyRequest(id);
  return (
    <div className="flex flex-col gap-4">
      <QueryState query={request} loadingLabel="Cargando la solicitud">
        {(found) => <Detail request={found} />}
      </QueryState>
    </div>
  );
}
