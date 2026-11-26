import { Decimal } from 'decimal.js';
import {
  PERSPECTIVE_ORDER,
  SCORECARD_PERSPECTIVES,
  scorecardStatusOf,
  type Indicator,
  type LegalRequirement,
  type Scorecard,
  type ScorecardIndicator,
  type ScorecardObjective,
} from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { processesOfPosition } from '../../core/index.js';
import { positionOfUser } from '../../iam/index.js';
import { loadIndicators } from './indicators.js';
import { loadRequirements } from './legal-views.js';

// Cifras de Calidad para los tableros de la Dirección (B46): cumplimiento legal (tablero
// gerencial), requisitos pendientes y que no se cumplen (tablero de cumplimiento) y el cuadro de
// mando con los objetivos estratégicos y sus indicadores (decisiones 4 y 5).

export interface LegalFigures {
  /** Porcentaje con dos decimales; sin requisitos evaluados no hay cifra. */
  readonly compliance: string | null;
  readonly evaluated: readonly LegalRequirement[];
  readonly pending: readonly LegalRequirement[];
  readonly failing: readonly LegalRequirement[];
}

export async function legalFigures(tx: TenantTransaction, today: string): Promise<LegalFigures> {
  const applicable = (await loadRequirements(tx, today)).filter((item) => item.applies);
  const evaluated = applicable.filter(
    (item) => item.last_evaluation !== null && item.last_evaluation.result !== 'not_applicable',
  );
  const complying = evaluated.filter((item) => item.last_evaluation?.result === 'complies');
  const compliance =
    evaluated.length === 0
      ? null
      : new Decimal(complying.length).times(100).dividedBy(evaluated.length).toFixed(2);
  return {
    compliance,
    evaluated,
    pending: applicable.filter((item) => item.pending),
    failing: evaluated.filter((item) => item.last_evaluation?.result !== 'complies'),
  };
}

function scorecardIndicator(indicator: Indicator): ScorecardIndicator {
  return {
    id: indicator.id,
    code: indicator.code,
    name: indicator.name,
    process: indicator.process.name,
    unit: indicator.unit,
    target: indicator.target,
    value: indicator.last?.value ?? null,
    period: indicator.last?.period ?? null,
    meets: indicator.last?.meets ?? null,
    trend: indicator.last?.trend ?? null,
  };
}

/** Los procesos del cargo de la persona (decisión 5). */
async function ownProcesses(tx: TenantTransaction, userId: string): Promise<string[]> {
  const positionId = await positionOfUser(tx, userId);
  return positionId === null ? [] : processesOfPosition(tx, positionId);
}

interface ObjectiveRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly perspective: string;
}

interface LinkedIndicator {
  readonly id: string;
  readonly strategicObjectiveId: string | null;
}

/** Cada objetivo con sus indicadores y su estado. */
function objectiveViews(
  objectives: readonly ObjectiveRow[],
  indicators: readonly LinkedIndicator[],
  views: ReadonlyMap<string, ScorecardIndicator>,
): { perspective: string; view: ScorecardObjective }[] {
  return objectives.map((objective) => {
    const own = indicators.flatMap((row) =>
      row.strategicObjectiveId === objective.id ? (views.get(row.id) ?? []) : [],
    );
    const status = scorecardStatusOf(own.map((item) => item.meets));
    return {
      perspective: objective.perspective,
      view: {
        id: objective.id,
        code: objective.code,
        name: objective.name,
        status,
        indicators: own,
      },
    };
  });
}

async function scorecardRows(tx: TenantTransaction, processIds: readonly string[] | null) {
  const where = processIds === null ? {} : { processId: { in: [...processIds] } };
  return Promise.all([
    tx.qmsStrategicObjective.findMany({
      where: { active: true, deletedAt: null },
      orderBy: [{ code: 'asc' }],
    }),
    tx.qmsIndicator.findMany({
      where: { ...where, active: true, deletedAt: null, strategicObjectiveId: { not: null } },
      select: { id: true, strategicObjectiveId: true },
    }),
  ]);
}

/** El cuadro de mando: objetivos activos por perspectiva con sus indicadores activos. */
export async function scorecard(
  tx: TenantTransaction,
  viewer: { readonly userId: string; readonly seesAll: boolean },
  today: string,
): Promise<Omit<Scorecard, 'generated_at'>> {
  const processIds = viewer.seesAll ? null : await ownProcesses(tx, viewer.userId);
  const [objectives, indicators] = await scorecardRows(tx, processIds);
  const loaded = await loadIndicators(tx, { id: { in: indicators.map((row) => row.id) } }, today);
  const views = new Map(loaded.map((view) => [view.id, scorecardIndicator(view)]));
  // Quien ve solo lo propio ve los objetivos que sus procesos miden.
  const visible = objectiveViews(objectives, indicators, views).filter(
    (item) => processIds === null || item.view.indicators.length > 0,
  );
  return {
    scope: processIds === null ? 'all' : 'own',
    perspectives: PERSPECTIVE_ORDER.map((perspective) => ({
      perspective,
      label: SCORECARD_PERSPECTIVES[perspective],
      objectives: visible
        .filter((item) => item.perspective === perspective)
        .map((item) => item.view),
    })),
  };
}
