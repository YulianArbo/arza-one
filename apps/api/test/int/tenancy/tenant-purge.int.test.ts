import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { runTenantExportWork, runTenantPurgeWork } from '../../../src/modules/tenancy/index.js';
import { OPERATOR_TENANT_ID } from '../../../src/platform/database/operator-tenant.js';
import { storage } from '../doc/support/file-scenario.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { createUser, uniqueEmail } from '../iam/support/iam-fixtures.js';
import { createTenant, newTestTenant, type TestTenant } from '../support/integration-database.js';
import {
  catalogTables,
  later,
  requestExport,
  rowCounts,
  tablesWithoutPurgePolicy,
  weakenedControls,
  workDeps,
} from './support/export-steps.js';
import { actionsIn, card, operator, sendAs } from './support/tenancy-fixture.js';

// Eliminación definitiva (B48, decisión 6, ADR-028): pasados 30 días se borran todos los datos y
// archivos de la empresa, nada de las demás, y la base de datos queda con todos sus controles.

const s = new AccessScenario('eliminacion');
const REASON = 'La empresa terminó su contrato y pidió cerrar la cuenta.';

/** Empresa con datos, archivos y su exportación lista. */
async function doomedTenant(): Promise<TestTenant> {
  const doomed = newTestTenant('eliminada');
  await createTenant(s.db, doomed);
  const boss = await s.person('direccion-eliminada', ['DIRECCION'], { tenantId: doomed.id });
  await createUser(s.db, { tenantId: doomed.id, email: uniqueEmail('otra-eliminada') });
  await storage().put(
    { key: `${doomed.id}/acta`, contentType: 'text/plain', sizeBytes: 4 },
    Readable.from([Buffer.from('acta')]),
  );
  await requestExport(s, boss);
  await runTenantExportWork(workDeps(s));
  return doomed;
}

/** El operador la suspende y pide su eliminación con el NIT. */
async function scheduleDeletion(op: Person, doomed: TestTenant): Promise<void> {
  const active = await card(s, op, doomed.id);
  const suspend = `/v1/platform/tenants/${doomed.id}/suspend`;
  await sendAs(s, 'post', suspend, op.session, {
    body: { reason: REASON },
    version: active.version,
  });
  const suspended = await card(s, op, doomed.id);
  const path = `/v1/platform/tenants/${doomed.id}/deletion`;
  const asked = await sendAs(s, 'post', path, op.session, {
    body: { reason: REASON, confirm_tax_id: doomed.taxId },
    version: suspended.version,
  });
  expect(asked.status, asked.text).toBe(201);
}

describe('eliminación definitiva', () => {
  it('antes del plazo no se borra nada; después, todo lo de la empresa y nada más', async () => {
    const doomed = await doomedTenant();
    const op = await operator(s, 'operador-elimina');
    await scheduleDeletion(op, doomed);
    const tables = await catalogTables();
    const othersBefore = await rowCounts(s.tenant.id, tables);

    await runTenantPurgeWork(workDeps(s, later(s, 1)));
    expect((await card(s, op, doomed.id)).status).toBe('suspended');

    await runTenantPurgeWork(workDeps(s, later(s, 31)));
    const closed = await card(s, op, doomed.id);
    expect(closed.status).toBe('closed');
    expect(closed.tax_id).toBe(doomed.taxId);
    const left = await rowCounts(doomed.id, tables);
    expect([...left].filter(([, count]) => count > 0)).toEqual([]);
    const othersAfter = await rowCounts(s.tenant.id, tables);
    for (const [table, count] of othersBefore) {
      expect(othersAfter.get(table), table).toBeGreaterThanOrEqual(count);
    }
    expect(await storage().list(`${doomed.id}/`)).toEqual([]);
    expect(await storage().list(`exports/${doomed.id}/`)).toEqual([]);
    expect(await actionsIn(s, OPERATOR_TENANT_ID)).toEqual(
      expect.arrayContaining(['platform.tenant.purge', 'platform.tenant.files_purge']),
    );
  });
});

describe('toda tabla de empresa se puede borrar', () => {
  it('cada tabla con tenant_id tiene su política de borrado (también las de bloques futuros)', async () => {
    expect(await tablesWithoutPurgePolicy()).toEqual([]);
  });
});

describe('controles después del borrado', () => {
  it('la seguridad por fila sigue forzada y los disparadores siguen activos', async () => {
    expect(await weakenedControls()).toEqual({ unforced: [], disabled: [] });
  });
});
