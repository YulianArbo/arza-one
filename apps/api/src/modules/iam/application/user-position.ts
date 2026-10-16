import { Inject, Injectable } from '@nestjs/common';

import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  positionInactive,
  positionNotFound,
  selfAction,
  userNotFound,
  userStateInvalid,
} from './access-messages.js';
import {
  POSITION_DIRECTORY,
  type PositionDirectory,
  type PositionRecord,
} from './position-directory.js';

interface PositionChange {
  readonly principal: Principal;
  /** La ficha y la versión que se vio (If-Match). */
  readonly target: { readonly id: string; readonly version: number };
  readonly positionId: string | null;
  readonly meta: RequestMeta;
}

function auditedPosition(position: PositionRecord | null) {
  return position === null ? null : { id: position.id, name: position.name };
}

/**
 * Cargo que ocupa cada persona interna (ficha 17.2): de él sale su jefe inmediato para las
 * aprobaciones y los escalamientos del motor de flujos (B15). Nadie cambia su propio cargo,
 * porque así escogería quién le aprueba.
 */
@Injectable()
export class UserPositionUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(POSITION_DIRECTORY) private readonly positions: PositionDirectory,
  ) {}

  /** Asigna o quita el cargo (iam.user.update). Si no cambia nada, no deja rastro. */
  async assign(change: PositionChange): Promise<void> {
    const { principal, target } = change;
    if (target.id === principal.userId) throw selfAction();
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const currentId = await this.currentPositionId(tx, target);
      if (currentId === change.positionId) return;
      const before = currentId === null ? null : await this.positions.find(tx, currentId);
      const after = await this.assignable(tx, change.positionId);
      const { count } = await tx.user.updateMany({
        where: { id: target.id, version: target.version },
        data: { positionId: change.positionId },
      });
      if (count === 0) throw versionConflict();
      await recordAuditEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: now,
        actor: { kind: 'user', id: principal.userId },
        action: 'iam.user.position',
        entityType: 'iam_user',
        entityId: target.id,
        result: 'success',
        changes: { position: { from: auditedPosition(before), to: auditedPosition(after) } },
        meta: change.meta,
      });
    });
  }

  /** Cargo actual de una persona interna en la versión que se vio. */
  private async currentPositionId(
    tx: TenantTransaction,
    target: PositionChange['target'],
  ): Promise<string | null> {
    const user = await tx.user.findFirst({
      where: { id: target.id, deletedAt: null },
      select: { kind: true, positionId: true, version: true },
    });
    if (user === null || user.kind === 'service') throw userNotFound();
    if (user.kind !== 'internal') {
      throw userStateInvalid('Solo las personas internas ocupan un cargo del organigrama.');
    }
    if (user.version !== target.version) throw versionConflict();
    return user.positionId;
  }

  private async assignable(
    tx: TenantTransaction,
    positionId: string | null,
  ): Promise<PositionRecord | null> {
    if (positionId === null) return null;
    const position = await this.positions.find(tx, positionId);
    if (position === null) throw positionNotFound();
    if (!position.isActive) throw positionInactive();
    return position;
  }
}
