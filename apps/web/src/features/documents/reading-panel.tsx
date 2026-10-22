'use client';

import type { AcknowledgementReport } from '@arza/contracts';
import { Badge, Button, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { BookOpenCheck } from 'lucide-react';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormError, FormSuccess } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { useConfirmReading, useReading, useRequestReading } from './sgc-queries';

// Constancia de lectura (B19, ficha 17.4 y numeral 16.3): la persona confirma que leyó la versión
// vigente; quien ve todos los documentos ve, cargo por cargo, quién confirmó y quién falta, y
// quien publica puede volver a pedir la lectura.

function MyReading({ report }: { readonly report: AcknowledgementReport }): JSX.Element {
  const confirm = useConfirmReading(report.document_id);
  const read = report.mine?.acknowledged_at ?? null;
  const requested = report.mine?.requested_at ?? null;
  if (read !== null) {
    return <FormSuccess message={`Usted confirmó la lectura el ${formatDateTime(read)}.`} />;
  }
  return (
    <div className="flex flex-col gap-2">
      {requested === null ? null : (
        <p className="text-sm">Se le pidió leer esta versión el {formatDateTime(requested)}.</p>
      )}
      <div>
        <Button
          type="button"
          disabled={confirm.pending || !report.can_acknowledge}
          onClick={() => {
            confirm.execute(undefined);
          }}
        >
          <BookOpenCheck aria-hidden="true" />
          {confirm.pending ? 'Guardando…' : 'Confirmo que leí este documento'}
        </Button>
      </div>
      {confirm.error === null ? null : <FormError error={confirm.error} />}
      {confirm.dialog}
    </div>
  );
}

function AskAgain({ documentId }: { readonly documentId: string }): JSX.Element | null {
  const ask = useRequestReading(documentId);
  if (!usePermissions().can('doc.version.publish')) return null;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={ask.pending}
          onClick={() => {
            ask.execute(undefined);
          }}
        >
          {ask.pending ? 'Pidiendo…' : 'Solicitar constancia de lectura'}
        </Button>
      </div>
      <div aria-live="polite">
        {ask.result === undefined ? null : (
          <FormSuccess
            message={`Se pidió la lectura a ${String(ask.result.requested)} personas que aún no la confirman.`}
          />
        )}
      </div>
      {ask.error === null ? null : <FormError error={ask.error} />}
      {ask.dialog}
    </div>
  );
}

function ByPosition({ report }: { readonly report: AcknowledgementReport }): JSX.Element | null {
  if (report.positions.length === 0) return null;
  return (
    <SimpleTable headers={['Cargo', 'Persona', 'Lectura']}>
      {report.positions.flatMap((section) =>
        section.readers.map((reader) => (
          <TableRow key={`${section.position?.id ?? 'sin-cargo'}-${reader.user.id}`}>
            <TableCell>{section.position?.name ?? 'Sin cargo'}</TableCell>
            <TableCell>{reader.user.name}</TableCell>
            <TableCell>
              {reader.acknowledged_at === null ? (
                <Badge tone="warning">Pendiente</Badge>
              ) : (
                <Badge tone="success">Leído el {formatDateTime(reader.acknowledged_at)}</Badge>
              )}
            </TableCell>
          </TableRow>
        )),
      )}
    </SimpleTable>
  );
}

function ReadingBody({ report }: { readonly report: AcknowledgementReport }): JSX.Element {
  if (report.version === null) {
    return (
      <EmptyState
        icon={<BookOpenCheck />}
        title="Todavía no hay una versión vigente"
        description="La constancia de lectura se pide cuando se publica una versión."
      />
    );
  }
  const { requested, acknowledged } = report.totals;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Versión vigente {report.version.label}: {String(acknowledged)} de {String(requested)}{' '}
        personas confirmaron su lectura.
      </p>
      <MyReading report={report} />
      <AskAgain documentId={report.document_id} />
      <ByPosition report={report} />
    </div>
  );
}

export function ReadingPanel({ documentId }: { readonly documentId: string }): JSX.Element {
  const reading = useReading(documentId);
  return (
    <QueryState query={reading} loadingLabel="Cargando la constancia de lectura">
      {(data) => <ReadingBody report={data} />}
    </QueryState>
  );
}
