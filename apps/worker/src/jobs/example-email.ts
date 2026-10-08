import type { DatabaseService } from '@arza/api/platform';
import { JOBS, type ExampleEmailJob } from '@arza/api/platform';
import { UnrecoverableError } from 'bullmq';

import type { Mailer } from '../mail/mailer.js';

export interface ExampleEmailDependencies {
  readonly database: Pick<DatabaseService, 'withTenant'>;
  readonly mailer: Pick<Mailer, 'send'>;
}

/** Datos del trabajo validados. Si no cumplen el esquema, reintentar no sirve de nada. */
function parseExampleEmailJob(data: unknown): ExampleEmailJob {
  const parsed = JOBS.exampleEmail.schema.safeParse(data);
  if (!parsed.success) {
    throw new UnrecoverableError('Los datos del trabajo no son válidos; no se reintenta.');
  }
  return parsed.data;
}

/**
 * Nombre de la empresa del trabajo, leído dentro de su propio contexto (numeral 13.2): la
 * seguridad por fila solo deja ver esa empresa. Si no existe (o es de otra), no se reintenta.
 */
async function tenantName(database: ExampleEmailDependencies['database'], job: ExampleEmailJob) {
  const context = { tenantId: job.tenantId, userId: job.userId };
  const tenant = await database.withTenant(context, (transaction) =>
    transaction.tenant.findUnique({ where: { id: job.tenantId } }),
  );
  if (tenant === null) {
    throw new UnrecoverableError('La empresa del trabajo no existe; no se reintenta.');
  }
  return tenant.tradeName ?? tenant.legalName;
}

/**
 * Trabajo de ejemplo (B06): envía un correo de prueba con el nombre de la empresa. No escribe
 * datos de negocio. Si el envío falla, el error sube y BullMQ lo reintenta (ADR-014).
 */
export async function processExampleEmail(
  data: unknown,
  deps: ExampleEmailDependencies,
): Promise<void> {
  const job = parseExampleEmailJob(data);
  const name = await tenantName(deps.database, job);
  await deps.mailer.send({
    to: job.recipient,
    subject: `Correo de prueba de ARZA ONE para ${name}`,
    text: [
      `Este correo lo envió el worker de ARZA ONE para la empresa ${name}.`,
      'Si lo está leyendo, las colas de trabajos funcionan de principio a fin.',
      `Identificador de correlación: ${job.correlationId}`,
    ].join('\n\n'),
  });
}
