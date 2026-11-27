import type { ComplianceFigureKey } from '@arza/contracts';

import { documentReviewFigures } from '../../doc/index.js';
import { accessFigures, type AccessFigureRow } from '../../iam/index.js';
import { overdueTasks } from '../../wf/index.js';
import { legal, LEGAL_COLUMNS, legalRows } from './executive-sources.js';
import {
  countDetail,
  shownBogotaDate,
  type FigureContext,
  type FigureResult,
  type FigureSource,
} from './figure-context.js';

// Cifras del tablero de cumplimiento (B46, ficha 17.17 y decisión 10): accesos, segregación de
// funciones, tareas vencidas, documentos por revisar y requisitos legales.

function access(context: FigureContext) {
  return context.once('access', () => accessFigures(context.tx, context.now));
}

function documents(context: FigureContext) {
  return context.once('documents', () =>
    documentReviewFigures(context.tx, context.principal, context.ability),
  );
}

function peopleResult(rows: readonly AccessFigureRow[], detailLabel: string): FigureResult {
  return {
    value: String(rows.length),
    detail: null,
    columns: [
      { key: 'name', label: 'Persona' },
      { key: 'roles', label: 'Roles vigentes' },
      { key: 'detail', label: detailLabel },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: { name: row.name, roles: row.roles, detail: row.detail },
    })),
  };
}

function documentResult(
  rows: readonly { id: string; code: string; title: string; status: string }[],
): FigureResult {
  return {
    value: String(rows.length),
    detail: null,
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'title', label: 'Título' },
      { key: 'status', label: 'Estado' },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: { code: row.code, title: row.title, status: row.status },
    })),
  };
}

const tasks: FigureSource = async ({ tx }) => {
  const rows = await overdueTasks(tx);
  return {
    value: String(rows.length),
    detail: null,
    columns: [
      { key: 'title', label: 'Tarea' },
      { key: 'assignee', label: 'Responsable' },
      { key: 'due', label: 'Fecha límite' },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: { title: row.title, assignee: row.assignee, due: shownBogotaDate(row.dueAt) },
    })),
  };
};

export const COMPLIANCE_SOURCES: Readonly<Record<ComplianceFigureKey, FigureSource>> = {
  accounts_without_mfa: async (context) =>
    peopleResult((await access(context)).withoutSecondFactor, 'Situación'),
  inactive_accounts: async (context) => peopleResult((await access(context)).unused, 'Situación'),
  platform_admins: async (context) =>
    peopleResult((await access(context)).platformAdmins, 'Situación'),
  sod_conflicts: async (context) =>
    peopleResult((await access(context)).sodConflicts, 'Funciones en conflicto'),
  overdue_tasks: tasks,
  documents_in_review: async (context) =>
    documentResult((await documents(context)).versionsInReview),
  change_requests_pending: async (context) =>
    documentResult((await documents(context)).pendingRequests),
  legal_pending: async (context) => {
    const figures = await legal(context);
    const count = figures.pending.length;
    return {
      value: String(count),
      detail: countDetail(count, 'requisito', 'requisitos'),
      columns: LEGAL_COLUMNS,
      rows: legalRows(figures.pending),
    };
  },
  legal_failing: async (context) => {
    const figures = await legal(context);
    return {
      value: String(figures.failing.length),
      detail: null,
      columns: LEGAL_COLUMNS,
      rows: legalRows(figures.failing),
    };
  },
};
