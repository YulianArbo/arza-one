import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Lo que Calidad necesita de Servicio al cliente para sus indicadores y la revisión por la
// dirección (B39, decisión 6): conteos y promedios de un periodo. Servicio ya usa a Calidad (una
// queja procedente abre su no conformidad, B38), así que Calidad no puede importar a Servicio sin
// crear un ciclo: declara aquí lo que necesita y Servicio se lo entrega al arrancar la aplicación
// (SERVICE_FIGURES) y en el worker. Calidad nunca lee las tablas de Servicio.

export interface ServicePeriod {
  /** Desde este instante (incluido) … */
  readonly from: Date;
  /** … hasta este instante (excluido). */
  readonly to: Date;
}

export interface ServiceQualityFigures {
  readonly ticketsResolved: number;
  readonly ticketsWithinSla: number;
  readonly pqrsfResponded: number;
  readonly pqrsfOnTime: number;
  readonly pqrsfReceived: number;
  readonly pqrsfWellFounded: number;
  readonly surveysAnswered: number;
  /** Suma de la satisfacción (1 a 5) de las encuestas respondidas. */
  readonly satisfactionTotal: number;
}

export type ServiceFiguresReader = (
  tx: TenantTransaction,
  period: ServicePeriod,
) => Promise<ServiceQualityFigures>;

/** Token con que Servicio entrega su lector de cifras a Calidad. */
export const SERVICE_FIGURES = Symbol('QMS_SERVICE_FIGURES');
