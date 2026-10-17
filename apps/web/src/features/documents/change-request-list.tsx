'use client';

import {
  CHANGE_REQUEST_ACTIONS,
  CHANGE_REQUEST_STATUSES,
  type ChangeRequest,
} from '@arza/contracts';
import { Badge, buttonVariants, EmptyState, TableCell, TableRow } from '@arza/ui';
import { FilePen } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { usePermissions } from '../session/permissions';
import { NEW_REQUEST_PATH, REQUEST_STATUS_TONES, requestPath } from './labels';
import { useChangeRequests } from './sgc-queries';

// Solicitudes de Acción Documental (B19, FT-SGC-001): lista con su estado y el paso de su trámite.
// Quien solo ve lo propio ve las que pidió.

const STATUS_OPTIONS = [
  { value: '', label: 'Todas' },
  ...Object.entries(CHANGE_REQUEST_STATUSES).map(([value, label]) => ({ value, label })),
];

function RequestRow({ request }: { readonly request: ChangeRequest }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={requestPath(request.id)} className="text-primary hover:underline">
          {request.code}
        </Link>
      </TableCell>
      <TableCell>{CHANGE_REQUEST_ACTIONS[request.action]}</TableCell>
      <TableCell>
        <p>{request.document?.code ?? request.title}</p>
        {request.document === null ? null : (
          <p className="text-xs text-muted-foreground">{request.document.title}</p>
        )}
      </TableCell>
      <TableCell>
        <Badge tone={REQUEST_STATUS_TONES[request.status]}>
          {CHANGE_REQUEST_STATUSES[request.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <p>{request.requested_by?.name ?? '—'}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(request.requested_at)}</p>
      </TableCell>
    </TableRow>
  );
}

function Requests({ requests }: { readonly requests: readonly ChangeRequest[] }): JSX.Element {
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<FilePen />}
        title="No hay solicitudes"
        description="Radique una solicitud para crear, modificar o eliminar un documento del SGC."
      />
    );
  }
  return (
    <SimpleTable headers={['Código', 'Acción', 'Documento', 'Estado', 'Pidió']}>
      {requests.map((request) => (
        <RequestRow key={request.id} request={request} />
      ))}
    </SimpleTable>
  );
}

function NewRequestLink(): JSX.Element | null {
  if (!usePermissions().can('doc.change_request.create')) return null;
  return (
    <Link href={NEW_REQUEST_PATH} className={buttonVariants()}>
      Nueva solicitud
    </Link>
  );
}

export function ChangeRequestList(): JSX.Element {
  const [status, setStatus] = useState('');
  const requests = useChangeRequests({ status });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Solicitudes de Acción Documental"
        description="Para crear, modificar o eliminar un documento del SGC (FT-SGC-001). Calidad las analiza y decide; quien la pide no la decide."
        action={<NewRequestLink />}
      />
      <div className="max-w-xs">
        <SelectField
          id="solicitudes-estado"
          label="Estado"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(event) => {
            setStatus(event.target.value);
          }}
        />
      </div>
      <QueryState query={requests} loadingLabel="Cargando las solicitudes">
        {(data) => <Requests requests={data.data} />}
      </QueryState>
    </div>
  );
}
