import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Las cifras de Servicio al cliente que Calidad usa para sus indicadores automáticos y para la
// revisión por la dirección (B39, decisión 6). Solo conteos y promedios del periodo: Calidad nunca
// lee las tablas de Servicio ni recibe datos de quien pidió o se quejó.

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

/** La fecha límite vence al terminar ese día en Colombia: 24 horas más las 5 de diferencia con UTC. */
const DUE_DAY_END_MS = 29 * 60 * 60 * 1000;

async function ticketFigures(tx: TenantTransaction, period: ServicePeriod) {
  const resolved = { resolvedAt: { gte: period.from, lt: period.to }, deletedAt: null };
  const [all, breached] = await Promise.all([
    tx.svcTicket.count({ where: resolved }),
    tx.svcTicket.count({ where: { ...resolved, breachedAt: { not: null } } }),
  ]);
  return { ticketsResolved: all, ticketsWithinSla: all - breached };
}

async function pqrsfFigures(tx: TenantTransaction, period: ServicePeriod) {
  const range = { gte: period.from, lt: period.to };
  const responded = await tx.svcPqrsf.findMany({
    where: { respondedAt: range, deletedAt: null },
    select: { respondedAt: true, dueOn: true },
  });
  const onTime = responded.filter(
    (row) =>
      row.respondedAt !== null && row.respondedAt.getTime() < row.dueOn.getTime() + DUE_DAY_END_MS,
  );
  const [received, wellFounded] = await Promise.all([
    tx.svcPqrsf.count({ where: { receivedAt: range, deletedAt: null } }),
    tx.svcPqrsf.count({ where: { respondedAt: range, wellFounded: true, deletedAt: null } }),
  ]);
  return {
    pqrsfResponded: responded.length,
    pqrsfOnTime: onTime.length,
    pqrsfReceived: received,
    pqrsfWellFounded: wellFounded,
  };
}

async function surveyFigures(tx: TenantTransaction, period: ServicePeriod) {
  const answered = await tx.svcSurveyResponse.aggregate({
    where: {
      answeredAt: { gte: period.from, lt: period.to },
      satisfaction: { not: null },
      deletedAt: null,
    },
    _count: { satisfaction: true },
    _sum: { satisfaction: true },
  });
  return {
    surveysAnswered: answered._count.satisfaction,
    satisfactionTotal: answered._sum.satisfaction ?? 0,
  };
}

/** Las cifras del periodo, en la transacción de la empresa. */
export async function serviceQualityFigures(
  tx: TenantTransaction,
  period: ServicePeriod,
): Promise<ServiceQualityFigures> {
  return {
    ...(await ticketFigures(tx, period)),
    ...(await pqrsfFigures(tx, period)),
    ...(await surveyFigures(tx, period)),
  };
}
