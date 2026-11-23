'use client';

import {
  PERSONAL_DATA_EXPORT_STATUSES,
  PERSONAL_DATA_OUTCOMES,
  PRIVACY_REQUEST_EVENTS,
  type PrivacyRequest,
} from '@arza/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { FileDown } from 'lucide-react';
import { useState, type JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { save } from '../audit/audit-export-button';
import { EXPORT_STATUS_TONES, OUTCOME_TONES } from './request-labels';
import { useExportPdf } from './request-queries';

// Tarjetas de la ficha de una solicitud (B42): las entregas de datos con su PDF, el resultado de la
// supresión por módulo, la respuesta y la historia.

interface Props {
  readonly request: PrivacyRequest;
}

function PdfButton(props: { readonly requestId: string; readonly exportId: string }): JSX.Element {
  const fetchPdf = useExportPdf();
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setError(null);
          fetchPdf(props.requestId, props.exportId).then(save, setError);
        }}
      >
        <FileDown aria-hidden="true" />
        Descargar PDF
      </Button>
      {error === null ? null : <FormError error={error} />}
    </div>
  );
}

export function ExportsCard({ request }: Props): JSX.Element | null {
  if (request.exports.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Entregas de los datos</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleTable
          caption="Archivos con los datos del titular"
          headers={['Pedida', 'Estado', 'Lista', '']}
        >
          {request.exports.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{formatDateTime(item.requested_at)}</TableCell>
              <TableCell>
                <Badge tone={EXPORT_STATUS_TONES[item.status]}>
                  {PERSONAL_DATA_EXPORT_STATUSES[item.status]}
                </Badge>
              </TableCell>
              <TableCell>{formatDateTime(item.ready_at)}</TableCell>
              <TableCell>
                {item.status === 'ready' ? (
                  <PdfButton requestId={request.id} exportId={item.id} />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </CardContent>
    </Card>
  );
}

export function ErasureCard({ request }: Props): JSX.Element | null {
  if (request.erasure === null) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Resultado de la supresión ({formatDateTime(request.erasure.erased_at)})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleTable
          caption="Qué pasó con los datos en cada módulo"
          headers={['Módulo', 'Resultado', 'Registros', 'Motivo']}
        >
          {request.erasure.sections.map((section) => (
            <TableRow key={section.key}>
              <TableCell>{section.title}</TableCell>
              <TableCell>
                <Badge tone={OUTCOME_TONES[section.outcome]}>
                  {PERSONAL_DATA_OUTCOMES[section.outcome]}
                </Badge>
              </TableCell>
              <TableCell>{section.count}</TableCell>
              <TableCell>{section.reason ?? '—'}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </CardContent>
    </Card>
  );
}

export function ResponseCard({ request }: Props): JSX.Element | null {
  if (request.response === null) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Respuesta enviada el {formatDateTime(request.responded_at)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-line text-sm">{request.response}</p>
      </CardContent>
    </Card>
  );
}

export function HistoryCard({ request }: Props): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historia</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3 text-sm" aria-label="Historia de la solicitud">
          {request.events.map((event) => (
            <li key={`${event.kind}-${event.occurred_at}`} className="border-l-2 pl-3">
              <p className="font-medium">{PRIVACY_REQUEST_EVENTS[event.kind]}</p>
              <p className="text-muted-foreground">
                {formatDateTime(event.occurred_at)} · {event.actor ?? 'El sistema'}
                {event.mailed_at === null ? '' : ' · enviado al titular por correo'}
              </p>
              {event.note === null ? null : <p className="whitespace-pre-line">{event.note}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
