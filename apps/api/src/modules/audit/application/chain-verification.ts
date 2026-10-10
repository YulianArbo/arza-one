import { Inject, Injectable } from '@nestjs/common';
import type { ChainVerification } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  ensurePartitions,
  tenantIds,
  verifyChain,
  type ChainCheck,
} from '../infrastructure/audit-store.js';

const NO_REQUEST: RequestMeta = { ip: null, userAgent: null, correlationId: null };

interface Verifier {
  readonly tenantId: string;
  /** null cuando la verifica el sistema (trabajo diario). */
  readonly userId: string | null;
  readonly meta: RequestMeta;
  readonly now: Date;
}

/** Resultado de la verificación diaria de una empresa. */
export interface TenantChainCheck extends ChainCheck {
  readonly tenantId: string;
}

/**
 * Verificación de la cadena de la auditoría (audit.chain.verify, ficha 17.20): recalcula cada hash
 * y comprueba que ningún evento falte, sobre ni cambie. La verificación queda en la auditoría y,
 * si encuentra un daño, se registra como evento de seguridad crítico (numeral 15.5).
 */
@Injectable()
export class ChainVerificationUseCase {
  constructor(
    @Inject(DatabaseService)
    private readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async verify(principal: Principal, meta: RequestMeta): Promise<ChainVerification> {
    const now = this.clock.now();
    const verifier = { tenantId: principal.tenantId, userId: principal.userId, meta, now };
    const check = await this.database.withTenant(principal, (tx) => verifyAndRecord(tx, verifier));
    return {
      intact: check.problem === null,
      checked: check.checked,
      broken_seq: check.brokenSeq,
      problem: check.problem,
      verified_at: now.toISOString(),
    };
  }

  /** Trabajo diario: crea las particiones de los próximos meses y verifica cada empresa. */
  async verifyAllTenants(): Promise<TenantChainCheck[]> {
    const now = this.clock.now();
    const tenants = await this.database.withoutTenant(async (tx) => {
      await ensurePartitions(tx, now);
      return tenantIds(tx);
    });
    const results: TenantChainCheck[] = [];
    for (const tenantId of tenants) {
      const verifier = { tenantId, userId: null, meta: NO_REQUEST, now };
      const check = await this.database.withTenant({ tenantId, userId: null }, (tx) =>
        verifyAndRecord(tx, verifier),
      );
      results.push({ tenantId, ...check });
    }
    return results;
  }
}

async function verifyAndRecord(tx: TenantTransaction, verifier: Verifier): Promise<ChainCheck> {
  const check = await verifyChain(tx);
  const intact = check.problem === null;
  await recordAuditEvent(tx, {
    tenantId: verifier.tenantId,
    occurredAt: verifier.now,
    actor: verifier.userId === null ? { kind: 'system' } : { kind: 'user', id: verifier.userId },
    action: 'audit.chain.verify',
    entityType: 'aud_events',
    entityId: null,
    result: intact ? 'success' : 'failure',
    changes: { checked: check.checked, broken_seq: check.brokenSeq, problem: check.problem },
    meta: verifier.meta,
  });
  if (!intact) {
    await recordSecurityEvent(tx, {
      tenantId: verifier.tenantId,
      occurredAt: verifier.now,
      type: 'audit.chain.broken',
      userId: verifier.userId,
      severity: 'critical',
      detail: { broken_seq: check.brokenSeq, problem: check.problem },
      meta: verifier.meta,
    });
  }
  return check;
}
