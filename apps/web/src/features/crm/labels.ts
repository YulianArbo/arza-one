import {
  ACTIVITY_TYPES,
  CAMPAIGN_CHANNELS,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
  QUOTE_STATUSES,
  SERVICE_UNITS,
  type LeadStatus,
  type OpportunityStage,
  type QuoteStatus,
} from '@arza/contracts';

// Textos y rutas del CRM (B22). Las etiquetas vienen de los contratos; aquí solo los tonos, las
// rutas y el formato de los pesos.

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const CRM_BASE = '/app/comercial';

export const CRM_PATHS = {
  funnel: CRM_BASE,
  leads: `${CRM_BASE}/prospectos`,
  newLead: `${CRM_BASE}/prospectos/nuevo`,
  lead: (id: string) => `${CRM_BASE}/prospectos/${id}`,
  newOpportunity: `${CRM_BASE}/oportunidades/nueva`,
  opportunity: (id: string) => `${CRM_BASE}/oportunidades/${id}`,
  activities: `${CRM_BASE}/actividades`,
  campaigns: `${CRM_BASE}/campanas`,
  report: `${CRM_BASE}/informe`,
  services: `${CRM_BASE}/portafolio`,
  quotes: `${CRM_BASE}/cotizaciones`,
  newQuote: (opportunityId: string) =>
    `${CRM_BASE}/cotizaciones/nueva?oportunidad=${opportunityId}`,
  quote: (id: string) => `${CRM_BASE}/cotizaciones/${id}`,
  editQuote: (id: string) => `${CRM_BASE}/cotizaciones/${id}/editar`,
} as const;

export {
  ACTIVITY_TYPES,
  CAMPAIGN_CHANNELS,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
  QUOTE_STATUSES,
  SERVICE_UNITS,
};

export const QUOTE_STATUS_TONES: Readonly<Record<QuoteStatus, Tone>> = {
  draft: 'neutral',
  in_approval: 'warning',
  approved: 'info',
  sent: 'info',
  accepted: 'success',
  rejected: 'destructive',
  expired: 'neutral',
  superseded: 'neutral',
};

/** «19.00» → «19 %»; «7.50» → «7,5 %». */
export function formatRate(value: string): string {
  const trimmed = value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value;
  return `${trimmed.replace('.', ',')} %`;
}

export const LEAD_STATUS_TONES: Readonly<Record<LeadStatus, Tone>> = {
  new: 'info',
  qualified: 'warning',
  converted: 'success',
  discarded: 'neutral',
};

export const STAGE_TONES: Readonly<Record<OpportunityStage, Tone>> = {
  prospecting: 'neutral',
  diagnosis: 'info',
  proposal: 'info',
  negotiation: 'warning',
  won: 'success',
  lost: 'destructive',
};

const PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** «1500000.50» → «$ 1.500.000,5». La API manda texto: aquí solo se muestra. */
export function formatPesos(value: string | null): string {
  if (value === null) return '—';
  return PESOS.format(Number(value));
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${String(value).replace('.', ',')} %`;
}

/** Valores de un contrato, en su orden, como opciones de una lista desplegable. */
export function optionsOf<K extends string>(
  values: readonly K[],
  labels: Readonly<Record<K, string>>,
  placeholder?: string,
): { value: string; label: string }[] {
  const options = values.map((value) => ({ value, label: labels[value] }));
  return placeholder === undefined ? options : [{ value: '', label: placeholder }, ...options];
}

const BOGOTA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** La fecha de hoy en Colombia, AAAA-MM-DD, para saber qué cierre ya pasó. */
export function bogotaToday(now: Date = new Date()): string {
  return BOGOTA_DAY.format(now);
}
