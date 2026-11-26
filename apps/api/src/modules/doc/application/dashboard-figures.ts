import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { readerOf, visibleDocuments } from './doc-support.js';
import { visibleRequests } from './change-request-views.js';

// Documentos por revisar para el tablero de cumplimiento (B46, decisión 10). Usa los mismos
// filtros de visibilidad que el listado de documentos y el de solicitudes, para que nadie vea por
// el tablero un documento reservado que no ve en su listado.

export interface DocumentFigureRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
}

const VERSION_STATUS: Readonly<Record<string, string>> = {
  in_review: 'En revisión',
  approved: 'Aprobada, sin publicar',
};

const REQUEST_STATUS: Readonly<Record<string, string>> = {
  filed: 'Radicada',
  in_analysis: 'En análisis',
};

export interface DocumentFigures {
  readonly versionsInReview: readonly DocumentFigureRow[];
  readonly pendingRequests: readonly DocumentFigureRow[];
}

export async function documentReviewFigures(
  tx: TenantTransaction,
  principal: Principal,
  ability: AppAbility,
): Promise<DocumentFigures> {
  const reader = await readerOf(tx, principal, ability);
  const [versions, requests] = await Promise.all([
    tx.docVersion.findMany({
      where: {
        status: { in: Object.keys(VERSION_STATUS) },
        deletedAt: null,
        document: visibleDocuments(reader),
      },
      include: { document: { select: { code: true } } },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    }),
    tx.docChangeRequest.findMany({
      where: { ...visibleRequests(reader), status: { in: Object.keys(REQUEST_STATUS) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return {
    versionsInReview: versions.map((row) => ({
      id: row.id,
      code: `${row.document.code} v${row.versionLabel}`,
      title: row.title,
      status: VERSION_STATUS[row.status] ?? row.status,
    })),
    pendingRequests: requests.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      status: REQUEST_STATUS[row.status] ?? row.status,
    })),
  };
}
