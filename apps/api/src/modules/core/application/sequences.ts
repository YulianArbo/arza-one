import { Inject, Injectable } from '@nestjs/common';
import {
  formatBusinessCode,
  type CreateSequenceRequest,
  type Sequence as SequenceView,
  type UpdateSequenceRequest,
} from '@arza/contracts';

import type { Sequence } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaYear } from '../domain/calendar-date.js';
import { openYear, takeNextValue } from '../infrastructure/sequence-store.js';
import { auditCore } from './core-audit.js';
import { codeTaken, recordNotFound, sequenceUnknown } from './core-messages.js';
import type { Versioned } from './records.js';

/**
 * Siguiente código de negocio de un tipo, como COT-2026-0001 (ADR-021). Se llama dentro de la
 * transacción del caso de uso que crea el registro: si esa transacción se revierte, el número no
 * se gasta. El año es el de Colombia; el primer código del año empieza en 1.
 */
export async function nextBusinessCode(
  tx: TenantTransaction,
  key: string,
  now: Date,
): Promise<string> {
  const year = bogotaYear(now);
  let taken = await takeNextValue(tx, key, year);
  if (taken === null) {
    await openYear(tx, key, year);
    taken = await takeNextValue(tx, key, year);
  }
  if (taken === null) throw sequenceUnknown();
  return formatBusinessCode(taken.prefix, year, taken.value, taken.padding);
}

function sequenceView(sequence: Sequence): SequenceView {
  return {
    id: sequence.id,
    key: sequence.key,
    name: sequence.name,
    prefix: sequence.prefix,
    year: sequence.year,
    padding: sequence.padding,
    next_value: sequence.nextValue,
    next_code: formatBusinessCode(
      sequence.prefix,
      sequence.year,
      sequence.nextValue,
      sequence.padding,
    ),
    version: sequence.version,
  };
}

function sequenceAudit(sequence: Sequence) {
  return { name: sequence.name, prefix: sequence.prefix, padding: sequence.padding };
}

async function findSequence(tx: TenantTransaction, id: string): Promise<Sequence> {
  const sequence = await tx.sequence.findFirst({ where: { id, deletedAt: null } });
  if (sequence === null) throw recordNotFound('El consecutivo');
  return sequence;
}

/** Tipos de consecutivo de la empresa. El siguiente número solo lo sube nextBusinessCode. */
@Injectable()
export class SequencesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Cada tipo con su año más reciente. */
  async list(principal: Principal): Promise<SequenceView[]> {
    const rows = await this.database.withTenant(principal, (tx) =>
      tx.sequence.findMany({
        where: { deletedAt: null },
        orderBy: [{ key: 'asc' }, { year: 'desc' }],
      }),
    );
    const latest = rows.filter((row, index) => rows[index - 1]?.key !== row.key);
    return latest.map(sequenceView);
  }

  async create(
    principal: Principal,
    input: CreateSequenceRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      if ((await tx.sequence.count({ where: { key: input.key } })) > 0) throw codeTaken();
      const sequence = await tx.sequence.create({
        data: {
          tenantId: principal.tenantId,
          key: input.key,
          name: input.name,
          prefix: input.prefix,
          padding: input.padding,
          year: bogotaYear(at),
        },
      });
      await auditCore(
        tx,
        { context: principal, meta, at },
        {
          action: 'core.sequence.create',
          entityType: 'sequence',
          entityId: sequence.id,
          changes: { key: sequence.key, year: sequence.year, ...sequenceAudit(sequence) },
        },
      );
      return sequence.id;
    });
  }

  /** Cambia el nombre, el prefijo o los dígitos del año más reciente; el número sigue igual. */
  async update(
    principal: Principal,
    target: Versioned,
    input: UpdateSequenceRequest,
    meta: RequestMeta,
  ): Promise<SequenceView> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const before = await findSequence(tx, target.id);
      const { count } = await tx.sequence.updateMany({
        where: { id: before.id, version: target.version },
        data: { name: input.name, prefix: input.prefix, padding: input.padding },
      });
      if (count === 0) throw versionConflict();
      const sequence = await findSequence(tx, before.id);
      await auditCore(
        tx,
        { context: principal, meta, at },
        {
          action: 'core.sequence.update',
          entityType: 'sequence',
          entityId: sequence.id,
          changes: changesBetween(sequenceAudit(before), sequenceAudit(sequence)),
        },
      );
      return sequenceView(sequence);
    });
  }
}
