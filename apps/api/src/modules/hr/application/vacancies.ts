import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  HR_ERROR_CODES,
  vacancySchema,
  type CloseVacancy,
  type SaveVacancy,
  type Vacancy,
} from '@arza/contracts';

import type { HrVacancy } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import {
  activePositions,
  bogotaToday,
  fromCalendarDate,
  nextBusinessCode,
  positionsById,
} from '../../core/index.js';

const VACANCIES = { name: 'Vacantes', prefix: 'VAC', padding: 4 } as const;

interface VacancyActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
}

/** Bloquea por clave de petición para que un reintento no duplique la vacante. */
async function lockRequest(
  tx: TenantTransaction,
  tenantId: string,
  requestKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr.vacancy:${tenantId}:${requestKey}`}, 0))`;
}

/** Devuelve la vacante previa si la petición repite exactamente los mismos datos. */
async function replayedVacancy(
  tx: TenantTransaction,
  tenantId: string,
  requestKey: string,
  input: SaveVacancy,
): Promise<string | null> {
  const existing = await tx.hrVacancy.findUnique({
    where: { tenantId_requestKey: { tenantId, requestKey } },
  });
  if (existing === null) return null;
  const same =
    existing.positionId === input.position_id &&
    existing.reason === input.reason &&
    existing.description === input.description &&
    existing.openedOn.toISOString().slice(0, 10) === input.opened_on;
  if (!same) throw idempotencyKeyReused();
  return existing.id;
}

/** Cargo activo y fecha de apertura ya alcanzada. */
async function assertCreatable(tx: TenantTransaction, input: SaveVacancy, at: Date): Promise<void> {
  const position = (await positionsById(tx, [input.position_id])).get(input.position_id);
  if (position?.isActive === true && input.opened_on <= bogotaToday(at)) return;
  throw new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HR_ERROR_CODES.recordInvalid,
    'Seleccione un cargo activo y una fecha de apertura que ya haya llegado.',
  );
}

/** Alta de la vacante con su consecutivo, auditoría y evento de outbox. */
async function storeVacancy(
  tx: TenantTransaction,
  actor: VacancyActor,
  requestKey: string,
  input: SaveVacancy,
): Promise<string> {
  const vacancy = await tx.hrVacancy.create({
    data: {
      tenantId: actor.tenantId,
      code: await nextBusinessCode(tx, 'hr.vacancy', actor.at, VACANCIES),
      positionId: input.position_id,
      reason: input.reason,
      description: input.description,
      openedOn: fromCalendarDate(input.opened_on),
      requestKey,
    },
    select: { id: true },
  });
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: 'hr.vacancy.create',
    entityType: 'hr_vacancy',
    entityId: vacancy.id,
    result: 'success',
    changes: { status: 'open', position_id: input.position_id },
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actorId: actor.userId,
    eventType: 'hr.vacancy.created',
    payload: { vacancy_id: vacancy.id },
  });
  return vacancy.id;
}

/** Vacante abierta con la versión esperada por el cliente. */
async function openVacancy(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  version: number,
): Promise<HrVacancy> {
  const vacancy = await tx.hrVacancy.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (vacancy === null) {
    throw new AppError(
      HttpStatus.NOT_FOUND,
      HR_ERROR_CODES.recordNotFound,
      'La vacante no existe.',
    );
  }
  if (vacancy.version !== version) throw versionConflict();
  if (vacancy.status !== 'open') {
    throw new AppError(
      HttpStatus.CONFLICT,
      HR_ERROR_CODES.statusInvalid,
      'La vacante ya se cerró.',
    );
  }
  return vacancy;
}

function assertCloseDate(vacancy: HrVacancy, input: CloseVacancy, at: Date): void {
  const closedOn = fromCalendarDate(input.closed_on);
  if (closedOn >= vacancy.openedOn && input.closed_on <= bogotaToday(at)) return;
  throw new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HR_ERROR_CODES.recordInvalid,
    'La fecha de cierre debe estar entre la apertura y hoy.',
  );
}

/** Cierre de la vacante con auditoría y evento de outbox. */
async function storeClosing(
  tx: TenantTransaction,
  actor: VacancyActor,
  id: string,
  version: number,
  input: CloseVacancy,
): Promise<void> {
  const updated = await tx.hrVacancy.updateMany({
    where: { id, tenantId: actor.tenantId, deletedAt: null, version, status: 'open' },
    data: {
      status: input.outcome,
      closedOn: fromCalendarDate(input.closed_on),
      closeNote: input.note,
      closedBy: actor.userId,
    },
  });
  if (updated.count !== 1) throw versionConflict();
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: 'hr.vacancy.close',
    entityType: 'hr_vacancy',
    entityId: id,
    result: 'success',
    changes: { status: { from: 'open', to: input.outcome } },
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actorId: actor.userId,
    eventType: 'hr.vacancy.closed',
    payload: { vacancy_id: id, outcome: input.outcome },
  });
}

@Injectable()
export class VacanciesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async positions(principal: Principal): Promise<{ readonly id: string; readonly name: string }[]> {
    return this.database.withTenant(principal, async (tx) =>
      (await activePositions(tx)).map(({ id, name }) => ({ id, name })),
    );
  }

  async create(
    principal: Principal,
    meta: RequestMeta,
    requestKey: string,
    input: SaveVacancy,
  ): Promise<string> {
    const actor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      await lockRequest(tx, actor.tenantId, requestKey);
      const replayed = await replayedVacancy(tx, actor.tenantId, requestKey, input);
      if (replayed !== null) return replayed;
      await assertCreatable(tx, input, actor.at);
      return storeVacancy(tx, actor, requestKey, input);
    });
  }

  async close(
    principal: Principal,
    meta: RequestMeta,
    id: string,
    version: number,
    input: CloseVacancy,
  ): Promise<void> {
    const actor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const vacancy = await openVacancy(tx, actor.tenantId, id, version);
      assertCloseDate(vacancy, input, actor.at);
      await storeClosing(tx, actor, id, version, input);
    });
  }

  async list(principal: Principal): Promise<Vacancy[]> {
    return this.database.withTenant(principal, async (tx) => {
      const vacancies = await tx.hrVacancy.findMany({
        where: { tenantId: principal.tenantId, deletedAt: null },
        orderBy: [{ openedOn: 'desc' }, { code: 'asc' }],
        include: { _count: { select: { candidates: { where: { deletedAt: null } } } } },
      });
      const positions = await positionsById(
        tx,
        vacancies.map(({ positionId }) => positionId),
      );
      return vacancies.map((vacancy) =>
        vacancySchema.parse({
          id: vacancy.id,
          code: vacancy.code,
          position: {
            id: vacancy.positionId,
            name: positions.get(vacancy.positionId)?.name ?? 'Cargo no disponible',
          },
          reason: vacancy.reason,
          description: vacancy.description,
          status: vacancy.status,
          opened_on: vacancy.openedOn.toISOString().slice(0, 10),
          closed_on: vacancy.closedOn?.toISOString().slice(0, 10) ?? null,
          close_note: vacancy.closeNote,
          candidate_count: vacancy._count.candidates,
          version: vacancy.version,
        }),
      );
    });
  }
}
