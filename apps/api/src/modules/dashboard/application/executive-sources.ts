import { Decimal } from 'decimal.js';
import { LEGAL_RESULTS, type ExecutiveFigureKey, type LegalRequirement } from '@arza/contracts';

import { openPipeline } from '../../crm/index.js';
import { receivableFigures, salesFigure, type FinanceFigure } from '../../fin/index.js';
import { projectsAtRisk } from '../../project/index.js';
import { legalFigures, type LegalFigures } from '../../qms/index.js';
import { satisfactionAnswers } from '../../service/index.js';
import {
  countDetail,
  shownBogotaDate,
  shownDate,
  shownPesos,
  type FigureContext,
  type FigureResult,
  type FigureSource,
} from './figure-context.js';

// Cifras del tablero gerencial (B46, ficha 17.17 y decisión 2). Cada una sale de la lectura que
// publica el módulo dueño de los datos y trae los registros que la originan.

const SATISFACTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const INVOICE_COLUMNS = [
  { key: 'code', label: 'Documento' },
  { key: 'client', label: 'Cliente' },
  { key: 'date', label: 'Fecha' },
  { key: 'amount', label: 'Valor' },
];

function financeResult(figure: FinanceFigure, dateLabel: string): FigureResult {
  return {
    value: figure.total,
    detail: countDetail(figure.rows.length, 'documento', 'documentos'),
    columns: INVOICE_COLUMNS.map((column) =>
      column.key === 'date' ? { ...column, label: dateLabel } : column,
    ),
    rows: figure.rows.map((row) => ({
      id: row.id,
      cells: {
        code: row.code,
        client: row.client,
        date: shownDate(row.date),
        amount: shownPesos(row.amount),
      },
    })),
  };
}

function sales(context: FigureContext, from: string): Promise<FigureResult> {
  return context.once(`sales:${from}`, async () =>
    financeResult(await salesFigure(context.tx, { from, to: context.today }), 'Emisión'),
  );
}

function receivables(context: FigureContext) {
  return context.once('receivables', () => receivableFigures(context.tx, context.today));
}

const pipeline: FigureSource = async ({ tx }) => {
  const result = await openPipeline(tx);
  return {
    value: result.total,
    detail: countDetail(result.rows.length, 'oportunidad', 'oportunidades'),
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'title', label: 'Oportunidad' },
      { key: 'client', label: 'Cliente' },
      { key: 'close', label: 'Cierre esperado' },
      { key: 'value', label: 'Valor estimado' },
    ],
    rows: result.rows.map((row) => ({
      id: row.id,
      cells: {
        code: row.code,
        title: row.title,
        client: row.client,
        close: shownDate(row.expectedClose),
        value: shownPesos(row.value),
      },
    })),
  };
};

const atRisk: FigureSource = async ({ tx }) => {
  const rows = await projectsAtRisk(tx);
  return {
    value: String(rows.length),
    detail: null,
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Proyecto' },
      { key: 'client', label: 'Cliente' },
      { key: 'ends', label: 'Fecha de fin' },
      { key: 'reason', label: 'Motivo' },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        code: row.code,
        name: row.name,
        client: row.client,
        ends: shownDate(row.endsOn),
        reason: row.reason,
      },
    })),
  };
};

const satisfaction: FigureSource = async ({ tx, now }) => {
  const from = new Date(now.getTime() - SATISFACTION_DAYS * DAY_MS);
  const rows = await satisfactionAnswers(tx, { from, to: now });
  const total = rows.reduce((sum, row) => sum + row.satisfaction, 0);
  return {
    value: rows.length === 0 ? null : new Decimal(total).dividedBy(rows.length).toFixed(2),
    detail: countDetail(rows.length, 'encuesta respondida', 'encuestas respondidas'),
    columns: [
      { key: 'date', label: 'Respondida' },
      { key: 'satisfaction', label: 'Satisfacción (1 a 5)' },
      { key: 'score', label: 'Recomendación (0 a 10)' },
    ],
    rows: rows.map((row) => ({
      id: row.id,
      cells: {
        date: shownBogotaDate(row.answeredAt),
        satisfaction: String(row.satisfaction),
        score: row.score === null ? '' : String(row.score),
      },
    })),
  };
};

export const LEGAL_COLUMNS = [
  { key: 'code', label: 'Código' },
  { key: 'norm', label: 'Norma' },
  { key: 'article', label: 'Artículos' },
  { key: 'result', label: 'Última evaluación' },
  { key: 'date', label: 'Fecha' },
];

export function legalRows(items: readonly LegalRequirement[]): FigureResult['rows'] {
  return items.map((item) => ({
    id: item.id,
    cells: {
      code: item.code,
      norm: item.norm,
      article: item.article ?? '',
      result:
        item.last_evaluation === null ? 'Sin evaluar' : LEGAL_RESULTS[item.last_evaluation.result],
      date: shownDate(item.last_evaluation?.evaluated_on ?? null),
    },
  }));
}

export function legal(context: FigureContext): Promise<LegalFigures> {
  return context.once('legal', () => legalFigures(context.tx, context.today));
}

const compliance: FigureSource = async (context) => {
  const figures = await legal(context);
  return {
    value: figures.compliance,
    detail: countDetail(figures.evaluated.length, 'requisito evaluado', 'requisitos evaluados'),
    columns: LEGAL_COLUMNS,
    rows: legalRows(figures.evaluated),
  };
};

export const EXECUTIVE_SOURCES: Readonly<Record<ExecutiveFigureKey, FigureSource>> = {
  sales_month: (context) => sales(context, `${context.today.slice(0, 7)}-01`),
  sales_year: (context) => sales(context, `${context.today.slice(0, 4)}-01-01`),
  pipeline_open: pipeline,
  receivables_open: async (context) =>
    financeResult((await receivables(context)).open, 'Vencimiento'),
  receivables_overdue: async (context) =>
    financeResult((await receivables(context)).overdue, 'Vencimiento'),
  projects_at_risk: atRisk,
  satisfaction,
  legal_compliance: compliance,
};
