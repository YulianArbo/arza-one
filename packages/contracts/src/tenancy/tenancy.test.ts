import { describe, expect, it } from 'vitest';

import { contrastWithWhite, updateTenantBrandingSchema } from './branding.js';
import { effectiveLimits, TENANT_PLANS } from './plans.js';
import {
  changeTenantPlanSchema,
  createPlatformTenantSchema,
  verifiedTaxIdSchema,
} from './tenants.js';

const NO_OVERRIDES = {
  maxInternalUsers: null,
  maxPortalUsers: null,
  storageMb: null,
  aiAssistant: null,
};

describe('planes y límites (B48, decisión 9)', () => {
  it('cada plan crece sobre el anterior', () => {
    expect(TENANT_PLANS.basic.storageMb).toBeLessThan(TENANT_PLANS.professional.storageMb);
    expect(TENANT_PLANS.professional.storageMb).toBeLessThan(TENANT_PLANS.enterprise.storageMb);
    expect(TENANT_PLANS.basic.aiAssistant).toBe(false);
    expect(TENANT_PLANS.enterprise.maxInternalUsers).toBeNull();
  });

  it('sin ajustes rigen los del plan', () => {
    expect(effectiveLimits('basic', NO_OVERRIDES)).toEqual({
      maxInternalUsers: 10,
      maxPortalUsers: 20,
      storageMb: 5120,
      aiAssistant: false,
    });
  });

  it('un ajuste reemplaza solo su límite', () => {
    const limits = effectiveLimits('basic', { ...NO_OVERRIDES, maxInternalUsers: 15 });
    expect(limits.maxInternalUsers).toBe(15);
    expect(limits.storageMb).toBe(5120);
  });

  it('el cambio de plan exige los cuatro ajustes, aunque sean null', () => {
    expect(changeTenantPlanSchema.safeParse({ plan: 'basic' }).success).toBe(false);
    const valid = { plan: 'basic', ...{ max_internal_users: null, max_portal_users: null } };
    expect(
      changeTenantPlanSchema.safeParse({ ...valid, storage_mb: null, ai_assistant: null }).success,
    ).toBe(true);
  });
});

describe('NIT de una empresa nueva', () => {
  it('exige el dígito de verificación correcto', () => {
    expect(verifiedTaxIdSchema.safeParse('900123456-8').success).toBe(true);
    expect(verifiedTaxIdSchema.safeParse('900123456-7').success).toBe(false);
    expect(verifiedTaxIdSchema.safeParse('900123456').success).toBe(false);
  });

  it('el alta pide el primer administrador', () => {
    const base = { legal_name: 'Empresa Prueba S.A.S.', trade_name: null };
    const request = { ...base, tax_id: '900123456-8', plan: 'professional' };
    expect(createPlatformTenantSchema.safeParse(request).success).toBe(false);
    const admin = { email: 'admin@empresa.test', display_name: 'Ana Prueba' };
    expect(createPlatformTenantSchema.safeParse({ ...request, admin }).success).toBe(true);
  });
});

describe('marca de la empresa (B48, decisión 11)', () => {
  it('mide el contraste con el blanco', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('rechaza un color que no se lee sobre blanco y guarda el resto en mayúsculas', () => {
    const light = updateTenantBrandingSchema.safeParse({
      display_name: null,
      primary_color: '#FFEE88',
    });
    expect(light.success).toBe(false);
    const dark = updateTenantBrandingSchema.parse({
      display_name: 'Marca',
      primary_color: '#1f4e79',
    });
    expect(dark.primary_color).toBe('#1F4E79');
  });

  it('rechaza un color mal escrito', () => {
    const parsed = updateTenantBrandingSchema.safeParse({
      display_name: null,
      primary_color: 'azul',
    });
    expect(parsed.success).toBe(false);
  });
});
