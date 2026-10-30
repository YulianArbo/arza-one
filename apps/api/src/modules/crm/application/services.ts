import { Inject, Injectable } from '@nestjs/common';
import {
  serviceUnitSchema,
  type Service,
  type ServiceListQuery,
  type ServiceListResponse,
  type ServiceRequest,
} from '@arza/contracts';

import { Prisma, type CrmService } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, nextPlainCode } from '../../core/index.js';
import { taxLabels, taxRatesOn } from '../../fin/index.js';
import { moneyText } from '../domain/money.js';
import { crmNotFound, serviceNameTaken, taxInvalid } from './crm-messages.js';
import { crmActorOf, recordCrmChange, type CrmTarget } from './crm-support.js';

// Portafolio de servicios con sus tarifas vigentes (B23, ficha 17.6). Lo administra quien tiene
// crm.service.manage; un servicio inactivo deja de ofrecerse en cotizaciones nuevas, pero las que
// ya lo usan lo conservan.

const SERVICES = {
  key: 'crm.service',
  name: 'Servicios del portafolio',
  prefix: 'SRV',
  padding: 4,
};

function columnsOf(input: ServiceRequest) {
  return {
    name: input.name,
    description: input.description,
    unit: input.unit,
    basePrice: input.base_price,
    taxKey: input.tax_key,
    isActive: input.is_active,
  };
}

function auditOf(service: CrmService) {
  return {
    code: service.code,
    name: service.name,
    description: service.description,
    unit: service.unit,
    base_price: moneyText(service.basePrice.toString()),
    tax_key: service.taxKey,
    is_active: service.isActive,
  };
}

/** El servicio como lo ve la API, con el nombre de su impuesto. */
function serviceView(service: CrmService, labels: ReadonlyMap<string, string>): Service {
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    description: service.description,
    unit: serviceUnitSchema.parse(service.unit),
    base_price: moneyText(service.basePrice.toString()),
    tax_key: service.taxKey,
    tax_label: labels.get(service.taxKey) ?? service.taxKey,
    is_active: service.isActive,
    version: service.version,
  };
}

/** Los servicios activos, por nombre, con el nombre de su impuesto. */
export async function activeServices(tx: TenantTransaction): Promise<Service[]> {
  const [rows, labels] = await Promise.all([
    tx.crmService.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    }),
    taxLabels(tx),
  ]);
  return rows.map((row) => serviceView(row, labels));
}

/** Dos servicios no se llaman igual: decide el índice único y se responde 409. */
function sameNameOnConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw serviceNameTaken();
  }
  throw error;
}

/** El impuesto tiene una tarifa vigente hoy. */
async function assertTax(tx: TenantTransaction, key: string, at: Date): Promise<void> {
  if (!(await taxRatesOn(tx, bogotaToday(at))).has(key)) throw taxInvalid();
}

@Injectable()
export class ServicesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal, query: ServiceListQuery): Promise<ServiceListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const contains =
        query.q === undefined ? undefined : { contains: query.q, mode: 'insensitive' as const };
      const [rows, labels] = await Promise.all([
        tx.crmService.findMany({
          where: {
            deletedAt: null,
            ...(query.view === 'active' ? { isActive: true } : {}),
            ...(contains === undefined ? {} : { OR: [{ code: contains }, { name: contains }] }),
          },
          orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        }),
        taxLabels(tx),
      ]);
      return { data: rows.map((row) => serviceView(row, labels)) };
    });
  }

  async create(principal: Principal, input: ServiceRequest, meta: RequestMeta): Promise<string> {
    const actor = crmActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      await assertTax(tx, input.tax_key, actor.at);
      const code = await nextPlainCode(tx, SERVICES);
      const service = await tx.crmService
        .create({ data: { tenantId: actor.tenantId, code, ...columnsOf(input) } })
        .catch(sameNameOnConflict);
      await recordCrmChange(tx, actor, {
        action: 'crm.service.create',
        event: 'crm.service.created',
        entityType: 'crm_service',
        entityId: service.id,
        changes: auditOf(service),
        payload: { code },
      });
      return service.id;
    });
  }

  async update(
    principal: Principal,
    target: CrmTarget,
    input: ServiceRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = crmActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const before = await tx.crmService.findFirst({ where: { id: target.id, deletedAt: null } });
      if (before === null) throw crmNotFound('El servicio');
      if (input.tax_key !== before.taxKey) await assertTax(tx, input.tax_key, actor.at);
      const { count } = await tx.crmService
        .updateMany({ where: { id: target.id, version: target.version }, data: columnsOf(input) })
        .catch(sameNameOnConflict);
      if (count === 0) throw versionConflict();
      const after = await tx.crmService.findFirstOrThrow({ where: { id: target.id } });
      await recordCrmChange(tx, actor, {
        action: 'crm.service.update',
        event: 'crm.service.updated',
        entityType: 'crm_service',
        entityId: target.id,
        changes: { code: before.code, ...changesBetween(auditOf(before), auditOf(after)) },
      });
    });
  }
}
