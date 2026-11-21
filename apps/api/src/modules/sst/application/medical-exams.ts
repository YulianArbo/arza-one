import { Inject, Injectable } from '@nestjs/common';
import type { MedicalExam, MedicalExamSummary, RecordMedicalExam } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { SstMedicalExam } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addDays, bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import {
  activeEmployeeForSst,
  employeeIdOfUser,
  employeeNamesForSst,
  linkOccupationalExam,
} from '../../hr/index.js';
import {
  auditSst,
  cipherContext,
  dateOf,
  lockKey,
  refOf,
  sstInvalid,
  sstNotFound,
  type SstActor,
} from './sst-support.js';

// Evaluaciones médicas ocupacionales (B37, decisiones 7 y 13; Resolución 2346 de 2007). Solo el
// concepto de aptitud, las restricciones y la próxima fecha; nunca diagnósticos. Las restricciones
// van cifradas, cada consulta del registro completo queda en la auditoría y nunca salen en
// exportaciones. Las ven SST (sst.medical.read) y la propia persona.

const TABLE = 'sst_medical_exams';
const DUE_SOON_DAYS = 30;

function examSummary(row: SstMedicalExam, employeeName: string, today: string): MedicalExamSummary {
  const next = dateOf(row.nextDueOn);
  return {
    id: row.id,
    employee: { id: row.employeeId, name: employeeName },
    kind: row.kind as MedicalExamSummary['kind'],
    exam_date: toCalendarDate(row.examDate),
    provider: row.provider,
    concept: row.concept as MedicalExamSummary['concept'],
    has_restrictions: row.restrictionsEncrypted !== null,
    next_due_on: next,
    due_soon: next !== null && next <= addDays(today, DUE_SOON_DAYS),
    version: row.version,
  };
}

/** El registro completo con las restricciones; quien lo llama deja la consulta en la auditoría. */
function fullExam(
  cipher: FieldCipher,
  row: SstMedicalExam,
  employeeName: string,
  today: string,
): MedicalExam {
  const stored = row.restrictionsEncrypted;
  return {
    ...examSummary(row, employeeName, today),
    restrictions:
      stored === null
        ? null
        : cipher.decrypt(stored, cipherContext(TABLE, row.tenantId, row.id, 'restrictions')),
  };
}

/** Lo que queda en la auditoría del registro: nunca el texto de las restricciones. */
function recordedChanges(input: RecordMedicalExam, linked: boolean) {
  return {
    employee_id: input.employee_id,
    kind: input.kind,
    concept: input.concept,
    with_restrictions: input.restrictions !== null,
    next_due_on: input.next_due_on,
    closes_hr_task: linked,
  };
}

async function auditRead(
  tx: TenantTransaction,
  actor: SstActor,
  row: SstMedicalExam,
  action: string,
): Promise<void> {
  await auditSst(tx, actor, {
    action,
    entityType: 'sst_medical_exam',
    entityId: row.id,
    changes: { employee_id: row.employeeId },
  });
}

@Injectable()
export class MedicalExams {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FieldCipher) private readonly cipher: FieldCipher,
  ) {}

  /** La lista sin restricciones: las que vencen primero, arriba. */
  async list(principal: Principal): Promise<MedicalExamSummary[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.sstMedicalExam.findMany({
        where: { deletedAt: null },
        orderBy: [{ examDate: 'desc' }, { id: 'asc' }],
        take: 500,
      });
      const names = await employeeNamesForSst(
        tx,
        rows.map((row) => row.employeeId),
      );
      return rows.map((row) =>
        examSummary(row, refOf(names, row.employeeId, 'Colaborador').name, today),
      );
    });
  }

  async detail(principal: Principal, meta: RequestMeta, id: string): Promise<MedicalExam> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.sstMedicalExam.findFirst({ where: { id, deletedAt: null } });
      if (row === null) throw sstNotFound('La evaluación médica no existe.');
      await auditRead(tx, actor, row, 'sst.medical.read');
      const name = refOf(await employeeNamesForSst(tx, [row.employeeId]), row.employeeId).name;
      return fullExam(this.cipher, row, name, bogotaToday(actor.at));
    });
  }

  /** Las evaluaciones propias con sus restricciones; la consulta también queda registrada. */
  async mine(principal: Principal, meta: RequestMeta): Promise<MedicalExam[]> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      const own = await employeeIdOfUser(tx, actor.userId);
      if (own === null) return [];
      const rows = await tx.sstMedicalExam.findMany({
        where: { employeeId: own, deletedAt: null },
        orderBy: [{ examDate: 'desc' }, { id: 'asc' }],
        take: 20,
      });
      const name = refOf(await employeeNamesForSst(tx, [own]), own).name;
      for (const row of rows) await auditRead(tx, actor, row, 'sst.medical.read_own');
      return rows.map((row) => fullExam(this.cipher, row, name, bogotaToday(actor.at)));
    });
  }

  async record(
    principal: Principal,
    meta: RequestMeta,
    key: string,
    input: RecordMedicalExam,
  ): Promise<string> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    if (input.exam_date > bogotaToday(actor.at)) {
      throw sstInvalid('La fecha de la evaluación no puede ser futura.');
    }
    return this.database.withTenant(principal, async (tx) => {
      await lockKey(tx, `sst.medical:${actor.tenantId}:${key}`);
      const existing = await tx.sstMedicalExam.findUnique({
        where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: key } },
      });
      if (existing !== null) {
        if (existing.employeeId !== input.employee_id) throw idempotencyKeyReused();
        return existing.id;
      }
      if ((await activeEmployeeForSst(tx, input.employee_id)) === null) {
        throw sstInvalid('El colaborador no existe o no está activo.');
      }
      return this.store(tx, actor, key, input);
    });
  }

  private async store(
    tx: TenantTransaction,
    actor: SstActor,
    key: string,
    input: RecordMedicalExam,
  ): Promise<string> {
    const id = uuidv7();
    const context = cipherContext(TABLE, actor.tenantId, id, 'restrictions');
    const row = await tx.sstMedicalExam.create({
      data: {
        id,
        tenantId: actor.tenantId,
        employeeId: input.employee_id,
        kind: input.kind,
        examDate: fromCalendarDate(input.exam_date),
        provider: input.provider,
        concept: input.concept,
        restrictionsEncrypted:
          input.restrictions === null ? null : this.cipher.encrypt(input.restrictions, context),
        nextDueOn: input.next_due_on === null ? null : fromCalendarDate(input.next_due_on),
        requestKey: key,
      },
    });
    const linked = await linkOccupationalExam(tx, actor, {
      employeeId: input.employee_id,
      kind: input.kind,
      examDate: row.examDate,
    });
    await auditSst(tx, actor, {
      action: 'sst.medical.record',
      entityType: 'sst_medical_exam',
      entityId: row.id,
      changes: recordedChanges(input, linked),
    });
    return row.id;
  }
}
