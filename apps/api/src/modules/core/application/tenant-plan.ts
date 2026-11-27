import type { PlanLimits, TenantPlan } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Estado y plan de la empresa del contexto (B48). Los demás módulos los piden aquí; nunca leen
// core_tenants. La base de datos hace cumplir los límites de cuentas y archivos por sí sola.

/** La empresa del contexto está activa: ni suspendida ni cerrada. */
export async function tenantIsOpen(tx: TenantTransaction): Promise<boolean> {
  const tenant = await tx.tenant.findFirst({ select: { status: true } });
  return tenant?.status === 'active';
}

export interface TenantPlanView {
  readonly plan: TenantPlan;
  readonly limits: PlanLimits;
}

function isPlan(value: string): value is TenantPlan {
  return value === 'basic' || value === 'professional' || value === 'enterprise';
}

/** Plan y límites que rigen para la empresa del contexto. */
export async function tenantPlan(tx: TenantTransaction): Promise<TenantPlanView> {
  const tenant = await tx.tenant.findFirstOrThrow({
    select: {
      plan: true,
      limitInternalUsers: true,
      limitPortalUsers: true,
      limitStorageMb: true,
      limitAiAssistant: true,
    },
  });
  if (!isPlan(tenant.plan)) throw new Error(`Plan desconocido: ${tenant.plan}`);
  return {
    plan: tenant.plan,
    limits: {
      maxInternalUsers: tenant.limitInternalUsers,
      maxPortalUsers: tenant.limitPortalUsers,
      storageMb: tenant.limitStorageMb,
      aiAssistant: tenant.limitAiAssistant,
    },
  };
}
