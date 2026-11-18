import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HR_ERROR_CODES, type RegisterCandidate } from '@arza/contracts';
import { ZodError } from 'zod';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import { registerCandidateParty } from '../../party/index.js';

function invalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, HR_ERROR_CODES.recordInvalid, detail);
}

/** Candidatura ya registrada con la misma clave de petición, o nulo si es nueva. */
async function replayedCandidate(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  requestKey: string,
  input: RegisterCandidate,
): Promise<string | null> {
  const existing = await tx.hrCandidate.findUnique({
    where: { tenantId_requestKey: { tenantId, requestKey } },
  });
  if (existing === null) return null;
  if (
    existing.createdBy !== userId ||
    existing.vacancyId !== input.vacancy_id ||
    existing.source !== input.source ||
    existing.talentBank !== input.talent_bank ||
    toCalendarDate(existing.appliedOn) !== input.applied_on
  ) {
    throw idempotencyKeyReused();
  }
  return existing.id;
}

/** Vacante abierta de la empresa y fecha de postulación dentro de su vigencia. */
async function assertOpenVacancy(
  tx: TenantTransaction,
  tenantId: string,
  input: RegisterCandidate,
  at: Date,
): Promise<void> {
  const vacancies = await tx.$queryRaw<{ status: string; opened_on: Date }[]>`
    SELECT status, opened_on FROM hr_vacancies
    WHERE id = ${input.vacancy_id}::uuid AND tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
    FOR SHARE
  `;
  const vacancy = vacancies[0];
  if (vacancy?.status !== 'open') {
    throw invalid('Seleccione una vacante abierta de la empresa.');
  }
  if (input.applied_on < toCalendarDate(vacancy.opened_on) || input.applied_on > bogotaToday(at)) {
    throw invalid('La fecha de postulación debe estar entre la apertura de la vacante y hoy.');
  }
}

/** Persona de la candidatura, traduciendo los errores de validación a un mensaje de negocio. */
async function candidateParty(
  tx: TenantTransaction,
  principal: Principal,
  meta: RequestMeta,
  at: Date,
  input: RegisterCandidate,
) {
  return registerCandidateParty(tx, { principal, meta, at }, input.person, input.consent).catch(
    (error: unknown) => {
      if (error instanceof ZodError) {
        throw invalid('Revise los datos de identificación de la persona.');
      }
      throw error;
    },
  );
}

/** Alta de la persona y su candidatura, con auditoría, dentro de la misma transacción. */
async function registerCandidate(
  tx: TenantTransaction,
  principal: Principal,
  meta: RequestMeta,
  at: Date,
  requestKey: string,
  input: RegisterCandidate,
): Promise<string> {
  const { tenantId, userId } = principal;
  const party = await candidateParty(tx, principal, meta, at, input);
  const candidate = await tx.hrCandidate.create({
    data: {
      ...party,
      tenantId,
      requestKey,
      vacancyId: input.vacancy_id,
      source: input.source,
      appliedOn: fromCalendarDate(input.applied_on),
      resumeFileId: input.resume_file_id,
      talentBank: input.talent_bank,
    },
  });
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: at,
    actor: { kind: 'user', id: userId },
    action: 'hr.candidate.create',
    entityType: 'hr_candidate',
    entityId: candidate.id,
    result: 'success',
    changes: { stage: 'applied', vacancy_id: candidate.vacancyId },
    meta,
  });
  return candidate.id;
}

@Injectable()
export class CandidateRegistration {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    principal: Principal,
    meta: RequestMeta,
    requestKey: string,
    input: RegisterCandidate,
  ): Promise<string> {
    const { tenantId, userId } = principal;
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr.candidate:${tenantId}:${requestKey}`}, 0))`;
      const replay = await replayedCandidate(tx, tenantId, userId, requestKey, input);
      if (replay !== null) return replay;
      await assertOpenVacancy(tx, tenantId, input, at);
      if (
        input.resume_file_id !== null &&
        !(await isAttachableFile(tx, principal, input.resume_file_id))
      ) {
        throw invalid('La hoja de vida adjunta no está disponible.');
      }
      return registerCandidate(tx, principal, meta, at, requestKey, input);
    });
  }
}
