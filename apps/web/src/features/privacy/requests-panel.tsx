'use client';

import {
  PRIVACY_REQUEST_KINDS,
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_RIGHTS,
  type PrivacyRequestListResponse,
  type PrivacyRequestSummary,
} from '@arza/contracts';
import {
  Badge,
  Button,
  EmptyState,
  Pager,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
  useCursorTrail,
} from '@arza/ui';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { optionsOf } from '../projects/form-bits';
import { RequestForm } from './request-form';
import { B42_PATHS, REQUEST_STATUS_TONES } from './request-labels';
import { usePrivacyRequests, useRegisterDownload } from './request-queries';

// Privacidad › Solicitudes de titulares (B42, ficha 17.19): la bandeja del Oficial con la fecha
// límite legal de cada una, lo vencido resaltado, el registro de lo que llega por otros canales y
// la descarga del registro en CSV.

const STATUS_OPTIONS = [{ value: '', label: 'Todas' }, ...optionsOf(PRIVACY_REQUEST_STATUSES)];

function DueCell({ request }: { readonly request: PrivacyRequestSummary }): JSX.Element {
  if (request.paused) return <Badge tone="info">Plazo suspendido</Badge>;
  const text = formatDate(request.due_on);
  if (request.overdue) return <Badge tone="destructive">Vencida: {text}</Badge>;
  return (
    <span>
      {text}
      {request.extended ? ' (con prórroga)' : ''}
    </span>
  );
}

function RequestRow({ request }: { readonly request: PrivacyRequestSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={B42_PATHS.request(request.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {request.code}
        </Link>
      </TableCell>
      <TableCell>{request.party?.name ?? request.requester_name}</TableCell>
      <TableCell>
        {PRIVACY_RIGHTS[request.right]}
        <span className="block text-xs text-muted-foreground">
          {PRIVACY_REQUEST_KINDS[request.kind]}
        </span>
      </TableCell>
      <TableCell>{formatDateTime(request.received_at)}</TableCell>
      <TableCell>
        <DueCell request={request} />
      </TableCell>
      <TableCell>
        <Badge tone={REQUEST_STATUS_TONES[request.status]}>
          {PRIVACY_REQUEST_STATUSES[request.status]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

const HEADERS = ['Código', 'Titular', 'Qué pide', 'Recibida', 'Fecha límite', 'Estado'];

type PagerControls = ReturnType<typeof useCursorTrail>['pager'];

function RequestPage(props: {
  readonly page: PrivacyRequestListResponse;
  readonly pager: PagerControls;
}) {
  if (props.page.data.length === 0) {
    return (
      <EmptyState
        title="No hay solicitudes"
        description="Llegan por el sitio web, el portal del cliente, una PQRSF o las registra usted."
      />
    );
  }
  return (
    <>
      <SimpleTable caption="Solicitudes de titulares, las más recientes primero" headers={HEADERS}>
        {props.page.data.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </SimpleTable>
      <Pager page={props.page} {...props.pager} />
    </>
  );
}

export function RegisterButton(props: {
  readonly path: string;
  readonly label: string;
}): JSX.Element {
  const download = useRegisterDownload(props.path);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={download.pending}
        onClick={() => {
          download.execute(null);
        }}
      >
        <Download aria-hidden="true" />
        {download.pending ? 'Descargando…' : props.label}
      </Button>
      {download.error === null ? null : <FormError error={download.error} />}
      {download.dialog}
    </div>
  );
}

export function RequestsPanel(): JSX.Element {
  const [status, setStatus] = useState('');
  const trail = useCursorTrail();
  const requests = usePrivacyRequests(status, trail.cursor);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs">
          <SelectField
            id="solicitudes-estado"
            label="Estado"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              trail.reset();
            }}
          />
        </div>
        <RecordDialog
          triggerLabel="Registrar solicitud"
          title="Registrar una solicitud"
          description="Para lo que llega por correo, teléfono, en persona o por escrito."
        >
          {() => <RequestForm />}
        </RecordDialog>
        <RegisterButton path="/v1/privacy-requests/export" label="Descargar el registro (CSV)" />
      </div>
      <QueryState query={requests} loadingLabel="Cargando las solicitudes">
        {(page) => <RequestPage page={page} pager={trail.pager} />}
      </QueryState>
    </div>
  );
}
