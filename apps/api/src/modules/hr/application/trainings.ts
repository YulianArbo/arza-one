import { Inject, Injectable } from '@nestjs/common';
import {
  trainingSchema,
  type CancelTraining,
  type RecordAttendance,
  type SaveTraining,
  type Training,
} from '@arza/contracts';

import type { HrTraining, HrTrainingAttendance } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  bogotaToday,
  fromCalendarDate,
  nextBusinessCode,
  toCalendarDate,
} from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import {
  auditHr,
  employeeOfUser,
  employeeRefsById,
  hrConflict,
  hrInvalid,
  hrNotFound,
  lockKey,
  type HrActor,
} from './hr-support.js';

// Formación y bienestar (B36, ficha 17.13): Talento humano programa capacitaciones, inducciones y
// actividades de bienestar con sus participantes; después registra quién asistió y su
// calificación de 1 a 5, con la lista de asistencia firmada. Cada colaborador ve las suyas.

const TRAININGS = { name: 'Formación y bienestar', prefix: 'FOR', padding: 4 } as const;

type TrainingRow = HrTraining & { readonly attendance: readonly HrTrainingAttendance[] };

interface TrainingTarget {
  readonly id: string;
  readonly version: number;
}

async function trainingViews(
  tx: TenantTransaction,
  rows: readonly TrainingRow[],
): Promise<Training[]> {
  const employees = await employeeRefsById(
    tx,
    rows.flatMap((row) => row.attendance.map(({ employeeId }) => employeeId)),
  );
  return rows.map((row) =>
    trainingSchema.parse({
      id: row.id,
      code: row.code,
      title: row.title,
      kind: row.kind,
      scheduled_on: toCalendarDate(row.scheduledOn),
      hours: Number(row.hours),
      facilitator: row.facilitator,
      description: row.description,
      status: row.status,
      evidence_file_id: row.evidenceFileId,
      attendees: row.attendance.map((entry) => ({
        employee: employees.get(entry.employeeId) ?? { id: entry.employeeId, name: 'Colaborador' },
        attended: entry.attended,
        evaluation: entry.evaluation,
        version: entry.version,
      })),
      version: row.version,
    }),
  );
}

async function assertActiveEmployees(tx: TenantTransaction, ids: readonly string[]) {
  const found = await tx.hrEmployee.count({
    where: { id: { in: [...ids] }, status: 'active', deletedAt: null },
  });
  if (found !== ids.length)
    throw hrInvalid('Alguna persona seleccionada no es un colaborador activo.');
}

async function requireTraining(tx: TenantTransaction, target: TrainingTarget) {
  const row = await tx.hrTraining.findFirst({
    where: { id: target.id, deletedAt: null },
    include: { attendance: { where: { deletedAt: null } } },
  });
  if (row === null) throw hrNotFound('La formación no existe.');
  if (row.version !== target.version) throw versionConflict();
  if (row.status !== 'scheduled') throw hrConflict('La formación ya se cerró o se canceló.');
  return row;
}

async function replayed(tx: TenantTransaction, tenantId: string, key: string, input: SaveTraining) {
  await lockKey(tx, `hr.training:${tenantId}:${key}`);
  const existing = await tx.hrTraining.findUnique({
    where: { tenantId_requestKey: { tenantId, requestKey: key } },
  });
  if (existing === null) return null;
  if (
    existing.title !== input.title ||
    toCalendarDate(existing.scheduledOn) !== input.scheduled_on
  ) {
    throw idempotencyKeyReused();
  }
  return existing.id;
}

@Injectable()
export class Trainings {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    principal: Principal,
    meta: RequestMeta,
    key: string,
    input: SaveTraining,
  ): Promise<string> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      const previous = await replayed(tx, actor.tenantId, key, input);
      if (previous !== null) return previous;
      await assertActiveEmployees(tx, input.employee_ids);
      const row = await tx.hrTraining.create({
        data: {
          tenantId: actor.tenantId,
          code: await nextBusinessCode(tx, 'hr.training', actor.at, TRAININGS),
          title: input.title,
          kind: input.kind,
          scheduledOn: fromCalendarDate(input.scheduled_on),
          hours: input.hours,
          facilitator: input.facilitator,
          description: input.description,
          requestKey: key,
        },
      });
      await tx.hrTrainingAttendance.createMany({
        data: input.employee_ids.map((employeeId) => ({
          tenantId: actor.tenantId,
          trainingId: row.id,
          employeeId,
        })),
      });
      await auditHr(tx, actor, {
        action: 'hr.training.create',
        entityType: 'hr_training',
        entityId: row.id,
        changes: { code: row.code, kind: input.kind, participants: input.employee_ids.length },
      });
      return row.id;
    });
  }

  /** Registra asistencia y calificación; la formación queda realizada. */
  async recordAttendance(
    principal: Principal,
    meta: RequestMeta,
    target: TrainingTarget,
    input: RecordAttendance,
  ): Promise<void> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await requireTraining(tx, target);
      if (toCalendarDate(row.scheduledOn) > bogotaToday(actor.at)) {
        throw hrInvalid('La asistencia se registra desde el día de la formación.');
      }
      await assertEvidence(tx, principal, input.evidence_file_id);
      await storeAttendance(tx, actor, row, input);
    });
  }

  async cancel(
    principal: Principal,
    meta: RequestMeta,
    target: TrainingTarget,
    input: CancelTraining,
  ): Promise<void> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await requireTraining(tx, target);
      const updated = await tx.hrTraining.updateMany({
        where: { id: row.id, version: row.version, status: 'scheduled' },
        data: { status: 'cancelled', cancelReason: input.reason },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditHr(tx, actor, {
        action: 'hr.training.cancel',
        entityType: 'hr_training',
        entityId: row.id,
        changes: { status: { from: 'scheduled', to: 'cancelled' } },
      });
    });
  }

  async list(principal: Principal): Promise<Training[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.hrTraining.findMany({
        where: { deletedAt: null },
        include: { attendance: { where: { deletedAt: null } } },
        orderBy: [{ scheduledOn: 'desc' }, { id: 'asc' }],
        take: 300,
      });
      return trainingViews(tx, rows);
    });
  }

  /** Las formaciones en las que participa la persona, con solo su propia asistencia. */
  async mine(principal: Principal): Promise<Training[]> {
    return this.database.withTenant(principal, async (tx) => {
      const own = await employeeOfUser(tx, principal.userId);
      if (own === null) return [];
      const rows = await tx.hrTraining.findMany({
        where: { deletedAt: null, attendance: { some: { employeeId: own.id, deletedAt: null } } },
        include: { attendance: { where: { employeeId: own.id, deletedAt: null } } },
        orderBy: [{ scheduledOn: 'desc' }, { id: 'asc' }],
      });
      return trainingViews(tx, rows);
    });
  }
}

async function assertEvidence(tx: TenantTransaction, principal: Principal, fileId: string | null) {
  if (fileId === null || (await isAttachableFile(tx, principal, fileId))) return;
  throw hrInvalid('La lista de asistencia adjunta no está disponible.');
}

async function storeAttendance(
  tx: TenantTransaction,
  actor: HrActor,
  row: TrainingRow,
  input: RecordAttendance,
): Promise<void> {
  const invited = new Map(row.attendance.map((entry) => [entry.employeeId, entry]));
  if (input.attendance.some(({ employee_id }) => !invited.has(employee_id))) {
    throw hrInvalid('Solo se registra la asistencia de las personas convocadas.');
  }
  for (const entry of input.attendance) {
    await tx.hrTrainingAttendance.updateMany({
      where: { trainingId: row.id, employeeId: entry.employee_id, deletedAt: null },
      data: { attended: entry.attended, evaluation: entry.evaluation },
    });
  }
  const updated = await tx.hrTraining.updateMany({
    where: { id: row.id, version: row.version, status: 'scheduled' },
    data: { status: 'held', evidenceFileId: input.evidence_file_id },
  });
  if (updated.count !== 1) throw versionConflict();
  await auditHr(tx, actor, {
    action: 'hr.training.attendance',
    entityType: 'hr_training',
    entityId: row.id,
    changes: {
      status: { from: 'scheduled', to: 'held' },
      attended: input.attendance.filter(({ attended }) => attended).length,
      registered: input.attendance.length,
    },
  });
}
