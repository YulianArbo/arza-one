import { Inject, Injectable } from '@nestjs/common';
import type { Lesson, SaveLesson } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { toCalendarDate } from '../../core/index.js';
import {
  assertProcess,
  auditQms,
  optionalRef,
  processRefs,
  qmsActorOf,
  qmsInvalid,
  qmsNotFound,
  refOf,
  userRefs,
  type Target,
} from './qms-support.js';

// Lecciones aprendidas (B38, ficha 17.15): las registra Calidad y las lee todo el personal
// interno (decisión 3).

function lessonData(input: SaveLesson) {
  return {
    title: input.title,
    context: input.context,
    lesson: input.lesson,
    processId: input.process_id,
    nonconformityId: input.nonconformity_id,
  };
}

const auditOf = (row: {
  title: string;
  processId: string | null;
  nonconformityId: string | null;
}) => ({
  title: row.title,
  process_id: row.processId,
  nonconformity_id: row.nonconformityId,
});

async function assertRefs(tx: TenantTransaction, input: SaveLesson): Promise<void> {
  await assertProcess(tx, input.process_id);
  if (input.nonconformity_id === null) return;
  const nc = await tx.qmsNonconformity.findFirst({
    where: { id: input.nonconformity_id, deletedAt: null },
  });
  if (nc === null) throw qmsInvalid('La no conformidad no existe.');
}

@Injectable()
export class Lessons {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<Lesson[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsLesson.findMany({
        where: { deletedAt: null },
        include: { nonconformity: { select: { id: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const people = await userRefs(
        tx,
        rows.map((row) => row.createdBy),
      );
      const processes = await processRefs(
        tx,
        rows.map((row) => row.processId),
      );
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        context: row.context,
        lesson: row.lesson,
        process: optionalRef(processes, row.processId, 'Proceso'),
        nonconformity: row.nonconformity,
        recorded_by: refOf(people, row.createdBy ?? row.id, 'Calidad'),
        recorded_on: toCalendarDate(row.createdAt),
        version: row.version,
      }));
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveLesson): Promise<string> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertRefs(tx, input);
      const row = await tx.qmsLesson.create({
        data: { tenantId: actor.tenantId, ...lessonData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.lesson.create',
        entityType: 'qms_lesson',
        entityId: row.id,
        changes: auditOf(row),
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveLesson,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsLesson.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('La lección no existe.');
      await assertRefs(tx, input);
      const data = lessonData(input);
      const updated = await tx.qmsLesson.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.lesson.update',
        entityType: 'qms_lesson',
        entityId: row.id,
        changes: changesBetween(auditOf(row), auditOf(data)),
      });
    });
  }
}
