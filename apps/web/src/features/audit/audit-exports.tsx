'use client';

import type { AuditExport } from '@arza/contracts';
import { EmptyState, Pager, SimpleTable, TableCell, TableRow, useCursorTrail } from '@arza/ui';
import { Download } from 'lucide-react';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { changesSummary } from './labels';
import { useAuditExports } from './queries';

const HEADERS = ['Fecha y hora', 'Quién', 'Filtros', 'Eventos'];

function ExportRow({ item }: { readonly item: AuditExport }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{formatDateTime(item.exported_at)}</TableCell>
      <TableCell>{item.requested_by.display_name ?? item.requested_by.email ?? '—'}</TableCell>
      <TableCell className="text-sm">
        {Object.keys(item.scope).length === 0 ? 'Todos los eventos' : changesSummary(item.scope)}
      </TableCell>
      <TableCell>{item.row_count.toLocaleString('es-CO')}</TableCell>
    </TableRow>
  );
}

/** Exportaciones de la auditoría ya hechas: quién, cuándo y con qué filtros (numeral 13.2). */
export function AuditExports(): JSX.Element {
  const trail = useCursorTrail();
  const page = useAuditExports(trail.cursor);
  return (
    <QueryState query={page} loadingLabel="Cargando las exportaciones">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            title="Todavía no hay exportaciones"
            description="Cuando el auditor exporte la auditoría, quedará registrado aquí."
            icon={<Download />}
          />
        ) : (
          <>
            <SimpleTable headers={HEADERS} caption="Exportaciones, la más reciente primero">
              {data.data.map((item) => (
                <ExportRow key={item.id} item={item} />
              ))}
            </SimpleTable>
            <Pager page={data} {...trail.pager} />
          </>
        )
      }
    </QueryState>
  );
}
