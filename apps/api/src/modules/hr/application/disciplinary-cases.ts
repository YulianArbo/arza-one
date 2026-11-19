import { Inject, Injectable } from '@nestjs/common';
import type {
  CiteDisciplinary,
  DecideDisciplinary,
  DisciplinaryCase,
  DisciplinarySummary,
  OpenDisciplinary,
  OwnDisciplinaryCase,
  RecordHearing,
} from '@arza/contracts';

import { v7 as uuidv7 } from 'uuid';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import {
  auditHr,
  employeeOfUser,
  employeeRefsById,
  hrNotFound,
  lockKey,
  requireActiveEmployee,
  type HrActor,
} from './hr-support.js';
import { citeCase, decideCase, recordHearing, type StepContext } from './disciplinary-steps.js';
import {
  disciplinaryContext,
  disciplinarySummaries,
  fullCase,
  ownCase,
} from './disciplinary-views.js';

// Proceso disciplinario (B36, ficha 17.13, decisión 8). Información restringida: solo Talento
// humano lo gestiona (hr.disciplinary.manage), cada lectura del caso completo queda en la auditoría
// y nunca sale en exportaciones. El colaborador ve su caso desde la citación.

const CASES = { name: 'Procesos disciplinarios', prefix: 'DIS', padding: 4 } as const;

interface CaseTarget {
  readonly id: string;
  readonly version: number;
}

async function requireCase(tx: TenantTransaction, id: string) {
  const row = await tx.hrDisciplinaryCase.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw hrNotFound('El proceso disciplinario no existe.');
  return row;
}

@Injectable()
export class DisciplinaryCases {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FieldCipher) private readonly cipher: FieldCipher,
  ) {}

  async open(
    principal: Principal,
    meta: RequestMeta,
    key: string,
    input: OpenDisciplinary,
  ): Promise<string> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      await lockKey(tx, `hr.disciplinary:${actor.tenantId}:${key}`);
      const existing = await tx.hrDisciplinaryCase.findUnique({
        where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: key } },
      });
      if (existing !== null) {
        if (existing.employeeId !== input.employee_id) throw idempotencyKeyReused();
        return existing.id;
      }
      const employee = await requireActiveEmployee(tx, input.employee_id);
      const id = await this.storeOpened(tx, actor, employee.id, { key, facts: input.facts });
      return id;
    });
  }

  private async storeOpened(
    tx: TenantTransaction,
    actor: HrActor,
    employeeId: string,
    input: { readonly key: string; readonly facts: string },
  ): Promise<string> {
    const id = uuidv7();
    const code = await nextBusinessCode(tx, 'hr.disciplinary', actor.at, CASES);
    const row = await tx.hrDisciplinaryCase.create({
      data: {
        id,
        tenantId: actor.tenantId,
        code,
        employeeId,
        factsEncrypted: this.cipher.encrypt(
          input.facts,
          disciplinaryContext(actor.tenantId, id, 'facts'),
        ),
        openedOn: fromCalendarDate(bogotaToday(actor.at)),
        requestKey: input.key,
      },
    });
    await auditHr(tx, actor, {
      action: 'hr.disciplinary.open',
      entityType: 'hr_disciplinary_case',
      entityId: row.id,
      changes: { code, status: 'opened' },
    });
    return row.id;
  }

  async list(principal: Principal): Promise<DisciplinarySummary[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.hrDisciplinaryCase.findMany({
        where: { deletedAt: null },
        orderBy: [{ openedOn: 'desc' }, { id: 'asc' }],
        take: 300,
      });
      return disciplinarySummaries(tx, rows);
    });
  }

  /** El caso completo; la lectura queda en la auditoría (información restringida). */
  async detail(principal: Principal, meta: RequestMeta, id: string): Promise<DisciplinaryCase> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      const row = await requireCase(tx, id);
      const name = (await employeeRefsById(tx, [row.employeeId])).get(row.employeeId)?.name;
      await auditHr(tx, actor, {
        action: 'hr.disciplinary.read',
        entityType: 'hr_disciplinary_case',
        entityId: row.id,
        changes: { code: row.code },
      });
      return fullCase(this.cipher, row, name ?? 'Colaborador');
    });
  }

  /** Los casos propios desde la citación; la consulta también queda registrada. */
  async mine(principal: Principal, meta: RequestMeta): Promise<OwnDisciplinaryCase[]> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      const own = await employeeOfUser(tx, principal.userId);
      if (own === null) return [];
      const rows = await tx.hrDisciplinaryCase.findMany({
        where: { employeeId: own.id, deletedAt: null, status: { not: 'opened' } },
        orderBy: [{ openedOn: 'desc' }, { id: 'asc' }],
      });
      for (const row of rows) {
        await auditHr(tx, actor, {
          action: 'hr.disciplinary.read_own',
          entityType: 'hr_disciplinary_case',
          entityId: row.id,
          changes: { code: row.code },
        });
      }
      const name = (await employeeRefsById(tx, [own.id])).get(own.id)?.name ?? 'Colaborador';
      return rows.map((row) => ownCase(this.cipher, row, name));
    });
  }

  async cite(
    principal: Principal,
    meta: RequestMeta,
    target: CaseTarget,
    input: CiteDisciplinary,
  ): Promise<void> {
    await this.step(principal, meta, target, (ctx) => citeCase(ctx, input));
  }

  async hearing(
    principal: Principal,
    meta: RequestMeta,
    target: CaseTarget,
    input: RecordHearing,
  ): Promise<void> {
    await this.step(principal, meta, target, (ctx) => recordHearing(ctx, input));
  }

  async decide(
    principal: Principal,
    meta: RequestMeta,
    target: CaseTarget,
    input: DecideDisciplinary,
  ): Promise<void> {
    await this.step(principal, meta, target, (ctx) => decideCase(ctx, input));
  }

  private async step(
    principal: Principal,
    meta: RequestMeta,
    target: CaseTarget,
    run: (ctx: StepContext) => Promise<void>,
  ): Promise<void> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await requireCase(tx, target.id);
      if (row.version !== target.version) throw versionConflict();
      await run({ tx, principal, actor, cipher: this.cipher, row });
    });
  }
}
