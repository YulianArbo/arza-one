import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import {
  reviewReadiness,
  type ReadinessCheck,
} from '../../../src/modules/golive/application/readiness.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';

// Revisión de puesta en marcha (B45, decisión 10): solo lee y dice qué puntos del anexo E se
// cumplen. Las empresas del escenario son de prueba: sus cuentas usan @pruebas.test, no tienen
// textos legales con concepto ni Listado Maestro, y así la revisión debe decir que no cumplen.

const scenario = new AccessScenario('revision puesta');

function review(tenantId: string, demoTenantIds: readonly string[] = [uuidv7()]) {
  return reviewReadiness(scenario.db, { tenantId, demoTenantIds });
}

function byTitle(checks: readonly ReadinessCheck[], title: string): ReadinessCheck {
  const check = checks.find((item) => item.title === title);
  if (check === undefined) throw new Error(`Falta la verificación «${title}».`);
  return check;
}

async function auditCount(tenantId: string): Promise<number> {
  return tenantScope(scenario.db, tenantId)((tx) => tx.auditEvent.count());
}

describe('revisión de puesta en marcha', () => {
  it('señala cuentas de prueba, sin segundo factor, textos sin concepto y sin Listado Maestro', async () => {
    await scenario.person('revisora', ['DIRECCION']);
    await scenario.newUser('sin-factor-revision', { withSecondFactor: false });
    const checks = await review(scenario.tenant.id);
    expect(checks.map((check) => [check.title, check.ok])).toEqual([
      ['Sin empresas de demostración', true],
      ['Sin cuentas de prueba', false],
      ['Usuarios internos con segundo factor', false],
      ['Listado Maestro cargado', false],
      ['Todo documento con regla de retención', true],
      ['Textos legales publicados con concepto jurídico', false],
    ]);
    expect(byTitle(checks, 'Textos legales publicados con concepto jurídico').detail).toContain(
      'Política de cookies',
    );
  });

  it('señala las empresas de demostración que siguen registradas', async () => {
    const checks = await review(scenario.tenant.id, [scenario.otherTenant.id]);
    expect(byTitle(checks, 'Sin empresas de demostración')).toMatchObject({ ok: false, item: 22 });
  });

  it('no escribe nada', async () => {
    const before = await auditCount(scenario.tenant.id);
    await review(scenario.tenant.id);
    expect(await auditCount(scenario.tenant.id)).toBe(before);
  });
});

describe('aislamiento entre empresas', () => {
  it('las cuentas de una empresa no cuentan en la revisión de la otra', async () => {
    await scenario.person('revisora-b', ['DIRECCION'], { tenantId: scenario.otherTenant.id });
    const detail = async () =>
      byTitle(await review(scenario.otherTenant.id), 'Usuarios internos con segundo factor');
    expect((await detail()).ok).toBe(true);
    await scenario.newUser('sin-factor-a', { withSecondFactor: false });
    expect((await detail()).ok).toBe(true);
  });
});
