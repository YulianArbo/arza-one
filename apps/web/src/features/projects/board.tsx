'use client';

import {
  BOARD_REFRESH_SECONDS,
  ITEM_STATUS_ORDER,
  WORKING_STATUSES,
  type ItemStatus,
  type ProjectDetail,
  type ProjectItem,
} from '@arza/contracts';
import { EmptyState } from '@arza/ui';
import { KanbanSquare } from 'lucide-react';
import { useState, type JSX } from 'react';

import { useDropZone } from '../../components/drop-zone';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { DoneDialog, type Evidence } from './done-dialog';
import { ITEM_DRAG, ItemCard } from './item-card';
import { ITEM_STATUSES } from './labels';
import { useBoard, useProjectAction } from './queries';

// Tablero de trabajo (B26, ficha 17.8; numeral 16.4, tablero de tarjetas): una columna por estado.
// Las tarjetas se arrastran con el ratón o se mueven con «Mover a…», con el teclado; la API valida
// el paso igual que el flujo. Se refresca solo cada 10 segundos para ver lo que otros movieron.
// Terminar pide el enlace a la revisión de código y la nota de pruebas.

export interface Move {
  readonly item: ProjectItem;
  readonly status: ItemStatus;
  readonly evidence?: Evidence;
}

function useMove(projectId: string) {
  const api = useApiClient();
  return useProjectAction<Move>(({ item, status, evidence }, csrfToken) =>
    api.post(`/v1/projects/${projectId}/items/${item.id}/actions/move`, {
      body: {
        status,
        review_url: evidence?.review_url ?? null,
        test_note: evidence?.test_note ?? null,
      },
      version: item.version,
      csrfToken,
    }),
  );
}

interface ColumnProps {
  readonly status: ItemStatus;
  readonly items: readonly ProjectItem[];
  readonly canMove: boolean;
  readonly onMove: (item: ProjectItem, status: ItemStatus) => void;
}

function Column(props: ColumnProps): JSX.Element {
  const zone = useDropZone(ITEM_DRAG, props.canMove, (id) => {
    const item = props.items.find((row) => row.id === id);
    if (item === undefined) return;
    props.onMove(item, props.status);
  });
  const headingId = `columna-${props.status}`;
  const mine = props.items.filter((item) => item.status === props.status);
  return (
    <section
      ref={zone}
      aria-labelledby={headingId}
      className="flex min-w-56 flex-1 flex-col gap-2 rounded-xl border bg-muted/40 p-3"
    >
      <h3 id={headingId} className="text-sm font-semibold">
        {ITEM_STATUSES[props.status]} <span className="text-muted-foreground">({mine.length})</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {mine.map((item) => (
          <ItemCard key={item.id} item={item} canMove={props.canMove} onMove={props.onMove} />
        ))}
      </ul>
    </section>
  );
}

/** Mover una tarjeta: terminar sin evidencia abre primero el diálogo que la pide. */
function useBoardMoves(projectId: string) {
  const move = useMove(projectId);
  const [finishing, setFinishing] = useState<ProjectItem | null>(null);
  const onMove = (item: ProjectItem, status: ItemStatus): void => {
    if (status === item.status) return;
    const needsEvidence = item.review_url === null || item.test_note === null;
    if (status === 'done' && needsEvidence) setFinishing(item);
    else move.execute({ item, status });
  };
  const finish = (item: ProjectItem, evidence: Evidence): void => {
    setFinishing(null);
    move.execute({ item, status: 'done', evidence });
  };
  const cancel = (): void => {
    setFinishing(null);
  };
  return { move, finishing, onMove, finish, cancel };
}

function BoardColumns(props: {
  readonly project: ProjectDetail;
  readonly items: readonly ProjectItem[];
}): JSX.Element {
  const { move, finishing, onMove, finish, cancel } = useBoardMoves(props.project.id);
  const canMove = props.project.can.manage_items && WORKING_STATUSES.includes(props.project.status);
  return (
    <>
      {move.error === null ? null : <FormError error={move.error} />}
      <div
        className="flex gap-3 overflow-x-auto pb-2"
        role="group"
        aria-label="Columnas del tablero"
      >
        {ITEM_STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            items={props.items}
            canMove={canMove}
            onMove={onMove}
          />
        ))}
      </div>
      <DoneDialog item={finishing} onClose={cancel} onConfirm={finish} />
      {move.dialog}
    </>
  );
}

function boardNote(project: ProjectDetail): string {
  if (!project.can.manage_items)
    return 'Usted puede ver el tablero; lo mueve el equipo del proyecto.';
  if (!WORKING_STATUSES.includes(project.status)) {
    return 'El tablero se mueve cuando el proyecto está en ejecución.';
  }
  return 'Arrastre las tarjetas o use «Mover a». Un ítem avanza de a una columna.';
}

export function BoardPanel({ project }: { readonly project: ProjectDetail }): JSX.Element {
  const board = useBoard(project.id);
  return (
    <QueryState query={board} loadingLabel="Cargando el tablero">
      {(data) => (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {data.sprint === null
              ? 'Sin iteración en curso: se ven los ítems fuera de iteraciones.'
              : `${data.sprint.name}: ${formatDate(data.sprint.starts_on)} – ${formatDate(data.sprint.ends_on)}.`}{' '}
            {boardNote(project)}
          </p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Actualizado {formatDateTime(data.refreshed_at)}; se actualiza solo cada{' '}
            {String(BOARD_REFRESH_SECONDS)} segundos.
          </p>
          {data.items.length === 0 ? (
            <EmptyState
              icon={<KanbanSquare />}
              title="El tablero está vacío"
              description="Cree ítems en Pendientes y llévelos a la iteración en curso."
            />
          ) : (
            <BoardColumns project={project} items={data.items} />
          )}
        </div>
      )}
    </QueryState>
  );
}
