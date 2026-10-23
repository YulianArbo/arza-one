import {
  OPPORTUNITY_STAGES,
  type FunnelReport,
  type FunnelRow,
  type FunnelRowStatus,
} from '@arza/contracts';

import { toCsv, type CsvCell } from '../../../platform/export/csv.js';

// RE-COM-001 Registro de Oportunidades en CSV (B22), para abrir en Excel con la configuración de
// Colombia: fechas dd/mm/aaaa y pesos con coma decimal, sin puntos de miles.

const FUNNEL_CSV_COLUMNS = [
  'Código',
  'Fecha de creación',
  'Cliente',
  'Oportunidad',
  'Etapa',
  'Valor estimado',
  'Probabilidad (%)',
  'Valor ponderado',
  'Fecha esperada de cierre',
  'Responsable',
  'Estado',
  'Motivo de pérdida',
  'Fecha de cierre',
] as const;

const STATUS_LABELS: Readonly<Record<FunnelRowStatus, string>> = {
  open: 'Abierta',
  won: 'Ganada',
  lost: 'Perdida',
};

/** «2026-10-22» → «22/10/2026». */
function dayText(date: string | null): CsvCell {
  if (date === null) return null;
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

function pesos(value: string): string {
  return value.replace('.', ',');
}

function csvRow(row: FunnelRow): CsvCell[] {
  return [
    row.code,
    dayText(row.created_on),
    row.client,
    row.title,
    OPPORTUNITY_STAGES[row.stage],
    pesos(row.estimated_value),
    String(row.probability),
    pesos(row.weighted_value),
    dayText(row.expected_close),
    row.owner,
    STATUS_LABELS[row.status],
    row.lost_reason,
    dayText(row.closed_on),
  ];
}

export function funnelCsv(report: FunnelReport): string {
  return toCsv(FUNNEL_CSV_COLUMNS, report.rows.map(csvRow));
}
