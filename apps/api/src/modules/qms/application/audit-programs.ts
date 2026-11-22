import { Inject, Injectable } from '@nestjs/common';
import type { AuditProgram, SaveAuditProgram } from '@arza/contracts';

import type { QmsAuditProgram } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { auditRefs, auditSummaryView, findingCounts } from './audit-views.js';
import { auditQms, qmsActorOf, qmsConflict, qmsNotFound, type Target } from './qms-support.js';

// Programa anual de auditorías internas (B39; PL-SGC-001). Uno por año; Calidad lo arma y lo
// publica, sin aprobación aparte (decisión 4).

function programData(input: SaveAuditProgram) {
  return {
    year: input.year,
    objectives: input.objectives,
    scope: input.scope,
    criteria: input.criteria,
  };
}

@Injectable()
export class AuditPrograms {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Los programas, del año más reciente al más antiguo, con sus auditorías. */
  async list(principal: Principal): Promise<AuditProgram[]> {
    return this.database.withTenant(principal, async (tx) => {
      const programs = await tx.qmsAuditProgram.findMany({
        where: { deletedAt: null },
        orderBy: { year: 'desc' },
        include: { audits: { where: { deletedAt: null }, orderBy: { plannedOn: 'asc' } } },
        take: 20,
      });
      const audits = programs.flatMap((program) => program.audits);
      const refs = await auditRefs(tx, audits);
      const counts = await findingCounts(
        tx,
        audits.map((audit) => audit.id),
      );
      return programs.map((program) => ({
        ...programView(program),
        audits: program.audits.map((audit) =>
          auditSummaryView(audit, refs, counts.get(audit.id) ?? 0),
        ),
      }));
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveAuditProgram): Promise<string> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const taken = await tx.qmsAuditProgram.findFirst({ where: { year: input.year } });
      if (taken !== null) throw qmsConflict(`Ya existe el programa de ${String(input.year)}.`);
      const row = await tx.qmsAuditProgram.create({
        data: { tenantId: actor.tenantId, ...programData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.audit_program.create',
        entityType: 'qms_audit_program',
        entityId: row.id,
        changes: { year: input.year },
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveAuditProgram,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsAuditProgram.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('El programa de auditorías no existe.');
      const taken = await tx.qmsAuditProgram.findFirst({
        where: { year: input.year, id: { not: row.id } },
      });
      if (taken !== null) throw qmsConflict(`Ya existe el programa de ${String(input.year)}.`);
      const updated = await tx.qmsAuditProgram.updateMany({
        where: { id: row.id, version: target.version },
        data: programData(input),
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.audit_program.update',
        entityType: 'qms_audit_program',
        entityId: row.id,
        changes: changesBetween({ year: row.year }, { year: input.year }),
      });
    });
  }

  /** Decisión 4: Calidad lo publica; no lleva aprobación aparte. */
  async publish(principal: Principal, meta: RequestMeta, target: Target): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsAuditProgram.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('El programa de auditorías no existe.');
      if (row.status !== 'draft') throw qmsConflict('El programa ya está publicado.');
      const updated = await tx.qmsAuditProgram.updateMany({
        where: { id: row.id, version: target.version, status: 'draft' },
        data: { status: 'published', publishedOn: fromCalendarDate(bogotaToday(actor.at)) },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.audit_program.publish',
        entityType: 'qms_audit_program',
        entityId: row.id,
        changes: { year: row.year, status: ['draft', 'published'] },
      });
    });
  }
}

function programView(program: QmsAuditProgram): Omit<AuditProgram, 'audits'> {
  return {
    id: program.id,
    year: program.year,
    objectives: program.objectives,
    scope: program.scope,
    criteria: program.criteria,
    status: program.status as AuditProgram['status'],
    version: program.version,
  };
}
