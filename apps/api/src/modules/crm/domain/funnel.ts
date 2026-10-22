import {
  OPPORTUNITY_STAGES,
  type FunnelReport,
  type FunnelRow,
  type FunnelRowStatus,
  type OpportunityStage,
  type OptionRef,
} from '@arza/contracts';

import { moneyText, percent, sumMoney, weightedValue } from './money.js';

// Informe del embudo, RE-COM-001 (B22). Cálculo puro: recibe las oportunidades y los prospectos
// del periodo y devuelve las etapas, los totales, los motivos de pérdida y las filas del registro.

export interface FunnelOpportunity {
  readonly code: string;
  readonly createdOn: string;
  readonly client: string;
  readonly title: string;
  readonly stage: OpportunityStage;
  readonly estimatedValue: string;
  readonly probability: number;
  readonly expectedClose: string;
  readonly owner: string | null;
  readonly lostReason: OptionRef | null;
  readonly closedOn: string | null;
}

export interface FunnelLeads {
  readonly count: number;
  readonly converted: number;
}

const STAGES = Object.keys(OPPORTUNITY_STAGES) as OpportunityStage[];

function statusOf(stage: OpportunityStage): FunnelRowStatus {
  if (stage === 'won' || stage === 'lost') return stage;
  return 'open';
}

function rowOf(opportunity: FunnelOpportunity): FunnelRow {
  return {
    code: opportunity.code,
    created_on: opportunity.createdOn,
    client: opportunity.client,
    title: opportunity.title,
    stage: opportunity.stage,
    estimated_value: moneyText(opportunity.estimatedValue),
    probability: opportunity.probability,
    weighted_value: weightedValue(opportunity.estimatedValue, opportunity.probability),
    expected_close: opportunity.expectedClose,
    owner: opportunity.owner,
    status: statusOf(opportunity.stage),
    lost_reason: opportunity.lostReason?.label ?? null,
    closed_on: opportunity.closedOn,
  };
}

function stagesOf(rows: readonly FunnelRow[]): FunnelReport['stages'] {
  return STAGES.map((stage) => {
    const inStage = rows.filter((row) => row.stage === stage);
    return {
      stage,
      label: OPPORTUNITY_STAGES[stage],
      count: inStage.length,
      value: sumMoney(inStage.map((row) => row.estimated_value)),
      weighted_value: sumMoney(inStage.map((row) => row.weighted_value)),
    };
  });
}

function totalsOf(rows: readonly FunnelRow[], leads: FunnelLeads): FunnelReport['totals'] {
  const open = rows.filter((row) => row.status === 'open');
  const won = rows.filter((row) => row.status === 'won');
  const lost = rows.filter((row) => row.status === 'lost');
  return {
    open_count: open.length,
    open_value: sumMoney(open.map((row) => row.estimated_value)),
    weighted_value: sumMoney(open.map((row) => row.weighted_value)),
    won_count: won.length,
    won_value: sumMoney(won.map((row) => row.estimated_value)),
    lost_count: lost.length,
    lost_value: sumMoney(lost.map((row) => row.estimated_value)),
    win_rate: percent(won.length, won.length + lost.length),
    leads_count: leads.count,
    converted_leads: leads.converted,
    lead_conversion_rate: percent(leads.converted, leads.count),
  };
}

/** Motivos de pérdida, del más frecuente al menos frecuente. */
function lostReasonsOf(opportunities: readonly FunnelOpportunity[]): FunnelReport['lost_reasons'] {
  const byCode = new Map<string, { reason: OptionRef; values: string[] }>();
  for (const { lostReason, estimatedValue } of opportunities) {
    if (lostReason === null) continue;
    const entry = byCode.get(lostReason.code) ?? { reason: lostReason, values: [] };
    entry.values.push(estimatedValue);
    byCode.set(lostReason.code, entry);
  }
  return [...byCode.values()]
    .map(({ reason, values }) => ({ ...reason, count: values.length, value: sumMoney(values) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
}

export function funnelReport(
  opportunities: readonly FunnelOpportunity[],
  leads: FunnelLeads,
  generatedAt: Date,
): FunnelReport {
  const rows = opportunities.map(rowOf);
  return {
    generated_at: generatedAt.toISOString(),
    stages: stagesOf(rows),
    totals: totalsOf(rows, leads),
    lost_reasons: lostReasonsOf(opportunities),
    rows,
  };
}
