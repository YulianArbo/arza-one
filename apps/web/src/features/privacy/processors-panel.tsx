'use client';

import type { Processor } from '@arza/contracts';
import { Badge, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { ActiveBadge, RecordDialog } from '../organization/record-dialog';
import { ProcessorForm } from './processor-form';
import { useProcessors } from './queries';

// Privacidad › Encargados (B17; Ley 1581, arts. 17, 18 y 26): proveedores con acceso a datos
// personales, el país donde los tratan y su contrato de transmisión. Sin contrato, la alerta.

function ProcessorRow({ processor }: { readonly processor: Processor }): JSX.Element {
  const name = processor.party.name ?? 'Tercero retirado';
  return (
    <TableRow>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell>{processor.service}</TableCell>
      <TableCell>{processor.country}</TableCell>
      <TableCell>
        {processor.has_contract ? (
          <Badge tone="success">Con contrato</Badge>
        ) : (
          <Badge tone="destructive">Falta contrato de transmisión</Badge>
        )}
      </TableCell>
      <TableCell>{formatDate(processor.review_on)}</TableCell>
      <TableCell>
        <ActiveBadge active={processor.status === 'active'} />
      </TableCell>
      <TableCell>
        <RecordDialog
          triggerLabel="Editar"
          triggerAriaLabel={`Editar el encargado ${name}`}
          variant="outline"
          title={`Editar ${name}`}
          description="Los cambios quedan en la auditoría."
        >
          {(close) => <ProcessorForm processor={processor} onDone={close} />}
        </RecordDialog>
      </TableCell>
    </TableRow>
  );
}

export function ProcessorsPanel(): JSX.Element {
  const processors = useProcessors();
  return (
    <div className="flex flex-col gap-4">
      <RecordDialog
        triggerLabel="Registrar encargado"
        title="Registrar un encargado"
        description="Un proveedor que trata datos personales por cuenta de la empresa."
      >
        {(close) => <ProcessorForm processor={null} onDone={close} />}
      </RecordDialog>
      <QueryState query={processors} loadingLabel="Cargando los encargados">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay encargados"
              description="Registre a los proveedores que tratan datos personales, como la nube o el correo."
            />
          ) : (
            <SimpleTable
              caption="Encargados del tratamiento"
              headers={['Organización', 'Servicio', 'País', 'Contrato', 'Revisión', 'Estado', '']}
            >
              {data.data.map((processor) => (
                <ProcessorRow key={processor.id} processor={processor} />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
    </div>
  );
}
