import { SLA_RULES, type ClockState, type TicketStatus } from '@arza/contracts';

// El reloj del acuerdo de servicio de un tiquete (B28, ficha 17.9). Corre desde que se registra y se
// pausa «en espera del cliente»: el plazo consumido se guarda en minutos del calendario del acuerdo
// (hábiles o corridos) y, al reanudar, los vencimientos se calculan con lo que queda. La alerta
// salta al 80 % del plazo de solución.

/** Plazos del acuerdo, en minutos. */
export interface SlaTerms {
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
}

export function termsOf(firstResponseHours: number, resolutionHours: number): SlaTerms {
  return {
    responseMinutes: Math.round(firstResponseHours * 60),
    resolutionMinutes: Math.round(resolutionHours * 60),
  };
}

/** Minutos que le quedan a cada vencimiento después de consumir `consumed`; nunca negativos. */
export interface Remaining {
  readonly response: number;
  readonly resolution: number;
  readonly warn: number;
}

export function remainingMinutes(terms: SlaTerms, consumed: number): Remaining {
  const warnAt = Math.round((terms.resolutionMinutes * SLA_RULES.warnPct) / 100);
  return {
    response: Math.max(0, terms.responseMinutes - consumed),
    resolution: Math.max(0, terms.resolutionMinutes - consumed),
    warn: Math.max(0, warnAt - consumed),
  };
}

/** Lo que el reloj necesita saber del tiquete para decir cómo va. */
export interface ClockFacts {
  readonly status: TicketStatus;
  readonly warnAt: Date | null;
  readonly resolutionDueAt: Date | null;
  readonly warnedAt: Date | null;
  readonly breachedAt: Date | null;
}

/** Cómo va el plazo de solución, para la bandeja y la ficha. */
export function clockState(ticket: ClockFacts, now: Date): ClockState {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return 'stopped';
  if (ticket.status === 'waiting_customer') return 'paused';
  if (ticket.breachedAt !== null) return 'overdue';
  if (ticket.resolutionDueAt !== null && ticket.resolutionDueAt <= now) return 'overdue';
  if (ticket.warnedAt !== null) return 'at_risk';
  return ticket.warnAt !== null && ticket.warnAt <= now ? 'at_risk' : 'on_time';
}

/** El siguiente nivel de atención, o null si ya está en el último (decisión 3). */
export function nextLevel(level: number, max: number): number | null {
  return level < max ? level + 1 : null;
}
