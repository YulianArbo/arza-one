'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Pager,
  useCursorTrail,
} from '@arza/ui';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { AuditEventTable } from './audit-event-table';
import { useEntityHistory } from './queries';

interface EntityHistoryProps {
  /** Tipo de registro como lo guarda la auditoría, por ejemplo «iam_user». */
  readonly entityType: string;
  readonly entityId: string;
}

function HistoryTable({ entityType, entityId }: EntityHistoryProps): JSX.Element {
  const trail = useCursorTrail();
  const history = useEntityHistory({ type: entityType, id: entityId }, trail.cursor);
  return (
    <QueryState query={history} loadingLabel="Cargando el historial">
      {(page) => (
        <>
          <AuditEventTable
            events={page.data}
            caption="Historial del registro"
            emptyTitle="Todavía no hay historial"
            emptyDescription="Aquí aparecerá cada cambio que se haga a este registro."
          />
          <Pager page={page} {...trail.pager} />
        </>
      )}
    </QueryState>
  );
}

/**
 * Historial de un registro (ficha 17.20, numeral 16.4: pestaña Historial de cada ficha): quién
 * hizo qué y cuándo. Solo se muestra a quien puede leer la auditoría; la API lo vuelve a revisar.
 */
export function EntityHistory(props: EntityHistoryProps): JSX.Element | null {
  const permissions = usePermissions();
  if (!permissions.can('audit.event.read')) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historial</CardTitle>
        <CardDescription>
          Todo lo que le ha pasado a este registro, lo más reciente primero.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <HistoryTable {...props} />
      </CardContent>
    </Card>
  );
}
