import { Inject, Injectable } from '@nestjs/common';
import { PPE_CATALOG, type PpeDelivery, type RecordPpeDelivery } from '@arza/contracts';

import type { SstPpeDelivery } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  addDays,
  bogotaToday,
  catalogLabels,
  fromCalendarDate,
  isActiveCatalogCode,
  toCalendarDate,
} from '../../core/index.js';
import {
  activeEmployeeForSst,
  employeeIdOfUser,
  employeeNamesForSst,
  type SstEmployee,
} from '../../hr/index.js';
import {
  auditSst,
  emitSst,
  lockKey,
  refOf,
  sstConflict,
  sstInvalid,
  sstNotFound,
  userRefs,
  type SstActor,
  type Target,
} from './sst-support.js';

// Entrega de elementos de protección personal (B37, decisión 12; FT-SST-001): SST registra la
// entrega y el colaborador confirma desde «Mi espacio» que la recibió.

/** Plazo que se le da al colaborador para confirmar el recibo. */
const ACKNOWLEDGE_DAYS = 5;

export async function ppeViews(
  tx: TenantTransaction,
  rows: readonly SstPpeDelivery[],
): Promise<PpeDelivery[]> {
  const labels = await catalogLabels(tx, PPE_CATALOG);
  const employees = await employeeNamesForSst(
    tx,
    rows.map((row) => row.employeeId),
  );
  const users = await userRefs(
    tx,
    rows.map((row) => row.deliveredBy),
  );
  return rows.map((row) => ({
    id: row.id,
    employee: refOf(employees, row.employeeId, 'Colaborador'),
    item: row.item,
    item_label: labels.get(row.item) ?? row.item,
    quantity: row.quantity,
    delivered_on: toCalendarDate(row.deliveredOn),
    delivered_by: refOf(users, row.deliveredBy),
    note: row.note,
    acknowledged_at: row.acknowledgedAt?.toISOString() ?? null,
    version: row.version,
  }));
}

@Injectable()
export class PpeDeliveries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<PpeDelivery[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.sstPpeDelivery.findMany({
        where: { deletedAt: null },
        orderBy: [{ deliveredOn: 'desc' }, { id: 'asc' }],
        take: 500,
      });
      return ppeViews(tx, rows);
    });
  }

  async record(
    principal: Principal,
    meta: RequestMeta,
    key: string,
    input: RecordPpeDelivery,
  ): Promise<string> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    if (input.delivered_on > bogotaToday(actor.at)) {
      throw sstInvalid('La fecha de entrega no puede ser futura.');
    }
    return this.database.withTenant(principal, async (tx) => {
      await lockKey(tx, `sst.ppe:${actor.tenantId}:${key}`);
      const existing = await tx.sstPpeDelivery.findUnique({
        where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: key } },
      });
      if (existing !== null) {
        if (existing.employeeId !== input.employee_id) throw idempotencyKeyReused();
        return existing.id;
      }
      const employee = await activeEmployeeForSst(tx, input.employee_id);
      if (employee === null) throw sstInvalid('El colaborador no existe o no está activo.');
      if (!(await isActiveCatalogCode(tx, PPE_CATALOG, input.item))) {
        throw sstInvalid('El elemento no está en el catálogo de elementos de protección.');
      }
      return this.store(tx, actor, { key, input, employee });
    });
  }

  private async store(
    tx: TenantTransaction,
    actor: SstActor,
    delivery: {
      readonly key: string;
      readonly input: RecordPpeDelivery;
      readonly employee: SstEmployee;
    },
  ): Promise<string> {
    const { key, input, employee } = delivery;
    const row = await tx.sstPpeDelivery.create({
      data: {
        tenantId: actor.tenantId,
        employeeId: employee.id,
        item: input.item,
        quantity: input.quantity,
        deliveredOn: fromCalendarDate(input.delivered_on),
        deliveredBy: actor.userId,
        note: input.note,
        requestKey: key,
      },
    });
    await auditSst(tx, actor, {
      action: 'sst.ppe.deliver',
      entityType: 'sst_ppe_delivery',
      entityId: row.id,
      changes: { employee_id: employee.id, item: input.item, quantity: input.quantity },
    });
    await emitSst(tx, actor, 'sst.task.assigned', {
      delivery_id: row.id,
      task: 'Confirmar el recibo de un elemento de protección',
      due_on: addDays(bogotaToday(actor.at), ACKNOWLEDGE_DAYS),
      recipients: employee.userId === null ? [] : [employee.userId],
    });
    return row.id;
  }

  /** El colaborador confirma que recibió el elemento; solo lo suyo y solo una vez. */
  async acknowledge(principal: Principal, meta: RequestMeta, target: Target): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const own = await employeeIdOfUser(tx, actor.userId);
      if (own === null) throw sstNotFound('La entrega no existe.');
      const row = await tx.sstPpeDelivery.findFirst({
        where: { id: target.id, employeeId: own, deletedAt: null },
      });
      if (row === null) throw sstNotFound('La entrega no existe.');
      if (row.acknowledgedAt !== null) throw sstConflict('La entrega ya está confirmada.');
      const updated = await tx.sstPpeDelivery.updateMany({
        where: { id: row.id, version: target.version, acknowledgedAt: null },
        data: { acknowledgedAt: actor.at },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.ppe.acknowledge',
        entityType: 'sst_ppe_delivery',
        entityId: row.id,
        changes: { acknowledged: true },
      });
    });
  }
}
