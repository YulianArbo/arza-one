import { z } from 'zod';

// Planes y límites de cada empresa (B48, decisión 9). Los valores son de ejemplo hasta que el
// propietario los ajuste; un plan solo limita, no cobra. null en un límite es «sin tope».

export const TENANT_PLAN_CODES = ['basic', 'professional', 'enterprise'] as const;
export const tenantPlanSchema = z.enum(TENANT_PLAN_CODES).describe('Plan de la empresa');
export type TenantPlan = z.infer<typeof tenantPlanSchema>;

export interface PlanLimits {
  /** Cuentas internas no inactivas. */
  readonly maxInternalUsers: number | null;
  /** Cuentas del portal no inactivas. */
  readonly maxPortalUsers: number | null;
  /** Espacio de los archivos, en megabytes. */
  readonly storageMb: number;
  readonly aiAssistant: boolean;
}

export interface PlanDefinition extends PlanLimits {
  readonly code: TenantPlan;
  readonly label: string;
}

const GB = 1024;

export const TENANT_PLANS: Readonly<Record<TenantPlan, PlanDefinition>> = {
  basic: {
    code: 'basic',
    label: 'Básico',
    maxInternalUsers: 10,
    maxPortalUsers: 20,
    storageMb: 5 * GB,
    aiAssistant: false,
  },
  professional: {
    code: 'professional',
    label: 'Profesional',
    maxInternalUsers: 50,
    maxPortalUsers: 200,
    storageMb: 50 * GB,
    aiAssistant: true,
  },
  enterprise: {
    code: 'enterprise',
    label: 'Empresarial',
    maxInternalUsers: null,
    maxPortalUsers: null,
    storageMb: 500 * GB,
    aiAssistant: true,
  },
};

/** Ajustes de una empresa sobre su plan; null en cada campo es «lo del plan». */
export interface PlanOverrides {
  readonly maxInternalUsers: number | null;
  readonly maxPortalUsers: number | null;
  readonly storageMb: number | null;
  readonly aiAssistant: boolean | null;
}

/** Los límites que rigen para la empresa: los del plan con sus ajustes. */
export function effectiveLimits(plan: TenantPlan, overrides: PlanOverrides): PlanLimits {
  const base = TENANT_PLANS[plan];
  return {
    maxInternalUsers: overrides.maxInternalUsers ?? base.maxInternalUsers,
    maxPortalUsers: overrides.maxPortalUsers ?? base.maxPortalUsers,
    storageMb: overrides.storageMb ?? base.storageMb,
    aiAssistant: overrides.aiAssistant ?? base.aiAssistant,
  };
}

export const planLimitsSchema = z.object({
  max_internal_users: z.number().int().positive().nullable().describe('null: sin tope'),
  max_portal_users: z.number().int().positive().nullable().describe('null: sin tope'),
  storage_mb: z.number().int().positive(),
  ai_assistant: z.boolean(),
});

export type PlanLimitsView = z.infer<typeof planLimitsSchema>;

export function limitsView(limits: PlanLimits): PlanLimitsView {
  return {
    max_internal_users: limits.maxInternalUsers,
    max_portal_users: limits.maxPortalUsers,
    storage_mb: limits.storageMb,
    ai_assistant: limits.aiAssistant,
  };
}

/** Qué límite se alcanzó: lo dice la base de datos en el error (PLAN_LIMIT:<tipo>). */
export const PLAN_LIMIT_KINDS = ['internal_users', 'portal_users', 'storage'] as const;
export type PlanLimitKind = (typeof PLAN_LIMIT_KINDS)[number];

export const PLAN_LIMIT_MESSAGES: Readonly<Record<PlanLimitKind, string>> = {
  internal_users:
    'La empresa llegó al máximo de usuarios internos de su plan. Desactive una cuenta o pida un plan mayor.',
  portal_users:
    'La empresa llegó al máximo de usuarios del portal de su plan. Desactive una cuenta o pida un plan mayor.',
  storage:
    'La empresa llegó al espacio de archivos de su plan. Libere espacio o pida un plan mayor.',
};
