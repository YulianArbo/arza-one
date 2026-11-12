import { Inject, Injectable } from '@nestjs/common';
import {
  SUPPLIER_EVALUATION_KINDS,
  SUPPLIER_EVALUATION_RESULTS,
  supplierCriteriaSchema,
  supplierScore,
  type CreateSupplierEvaluation,
  type SupplierEvaluation,
} from '@arza/contracts';

import type { PurSupplierEvaluation } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { activePurchaseSuppliers, purchaseSupplierRefs } from '../../party/index.js';
import { recordInvalid } from './purchase-messages.js';
import { personRef, recordPurEvent, type PurActor } from './purchase-support.js';

// Selección, evaluación y reevaluación de proveedores (B33, RE-ADM-001): una por proveedor, tipo y
// periodo. No se edita: una corrección es la evaluación del periodo siguiente.

const ENTITY = 'pur_supplier_evaluation';

@Injectable()
export class SupplierEvaluationsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<SupplierEvaluation[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.purSupplierEvaluation.findMany({
        where: { deletedAt: null },
        orderBy: [{ period: 'desc' }, { evaluatedAt: 'desc' }],
        take: 500,
      });
      const [suppliers, people] = await Promise.all([
        purchaseSupplierRefs(
          tx,
          today,
          rows.map((row) => row.supplierId),
        ),
        peopleById(
          tx,
          rows.map((row) => row.evaluatedBy),
        ),
      ]);
      return rows.map((row) => ({
        ...evaluationView(row),
        supplier: {
          id: row.supplierId,
          name: suppliers.get(row.supplierId)?.name ?? 'Proveedor',
        },
        evaluated_by: personRef(people, row.evaluatedBy),
      }));
    });
  }

  async create(actor: PurActor, input: CreateSupplierEvaluation): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      await validateEvaluation(tx, input, bogotaToday(at));
      const { score, result } = supplierScore(input.criteria);
      const evaluation = await tx.purSupplierEvaluation.create({
        data: {
          tenantId: actor.principal.tenantId,
          supplierId: input.supplier_id,
          kind: input.kind,
          period: input.period,
          criteria: input.criteria,
          score,
          result,
          note: input.note,
          evaluatedBy: actor.principal.userId,
          evaluatedAt: at,
          createdBy: actor.principal.userId,
        },
      });
      await recordPurEvent(tx, actor, at, {
        action: 'purchase.supplier.evaluate',
        event: 'pur.supplier.evaluated',
        entityType: ENTITY,
        entityId: evaluation.id,
        payload: { supplier_id: input.supplier_id, period: input.period, result },
        changes: { kind: input.kind, period: input.period, score, result },
      });
      return evaluation.id;
    });
  }
}

async function validateEvaluation(
  tx: TenantTransaction,
  input: CreateSupplierEvaluation,
  today: string,
): Promise<void> {
  const suppliers = await activePurchaseSuppliers(tx, today);
  if (!suppliers.some((supplier) => supplier.id === input.supplier_id)) {
    throw recordInvalid('Elija un proveedor vigente.');
  }
  const repeated = await tx.purSupplierEvaluation.count({
    where: {
      supplierId: input.supplier_id,
      kind: input.kind,
      period: input.period,
      deletedAt: null,
    },
  });
  if (repeated > 0) {
    throw recordInvalid('Ese proveedor ya tiene esa evaluación en el periodo indicado.');
  }
}

function evaluationView(
  row: PurSupplierEvaluation,
): Omit<SupplierEvaluation, 'supplier' | 'evaluated_by'> {
  return {
    id: row.id,
    kind: SUPPLIER_EVALUATION_KINDS.find((kind) => kind === row.kind) ?? 'reevaluation',
    period: row.period,
    criteria: supplierCriteriaSchema.parse(row.criteria),
    score: row.score.toFixed(2),
    result: SUPPLIER_EVALUATION_RESULTS.find((result) => result === row.result) ?? 'conditional',
    note: row.note,
    evaluated_at: row.evaluatedAt.toISOString(),
  };
}
