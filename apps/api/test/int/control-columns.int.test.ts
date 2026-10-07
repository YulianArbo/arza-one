import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  createDatabaseService,
  createTenant,
  newTestTenant,
} from './support/integration-database.js';

// Columnas de control (capítulo 12.1): las mantiene la base de datos, no el código.

const tenant = newTestTenant('columnas de control');
const creator = uuidv7();
const editor = uuidv7();
let database: DatabaseService;

function readTenant(userId: string | null) {
  return database.withTenant({ tenantId: tenant.id, userId }, (transaction) =>
    transaction.tenant.findUniqueOrThrow({ where: { id: tenant.id } }),
  );
}

function renameTenant(userId: string, legalName: string) {
  return database.withTenant({ tenantId: tenant.id, userId }, (transaction) =>
    transaction.tenant.update({ where: { id: tenant.id }, data: { legalName } }),
  );
}

beforeAll(async () => {
  database = createDatabaseService();
  await database.withTenant({ tenantId: tenant.id, userId: creator }, (transaction) =>
    transaction.tenant.create({ data: tenant }),
  );
});

afterAll(async () => {
  await database.onModuleDestroy();
});

describe('columnas de control', () => {
  it('al crear: versión 1 y creador tomado del contexto', async () => {
    const created = await readTenant(null);
    expect(created.version).toBe(1);
    expect(created.createdBy).toBe(creator);
    expect(created.updatedBy).toBe(creator);
    expect(created.deletedAt).toBeNull();
  });

  it('al modificar: sube la versión y registra quién y cuándo, sin tocar la creación', async () => {
    const before = await readTenant(null);
    const after = await renameTenant(editor, 'Nombre corregido');
    expect(after.version).toBe(before.version + 1);
    expect(after.updatedBy).toBe(editor);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect(after.createdBy).toBe(creator);
    expect(after.createdAt).toEqual(before.createdAt);
  });

  it('ignora los valores falsificados de autoría y versión', async () => {
    const before = await readTenant(null);
    const forged = await database.withTenant(
      { tenantId: tenant.id, userId: editor },
      (transaction) =>
        transaction.tenant.update({
          where: { id: tenant.id },
          data: { createdBy: editor, createdAt: new Date(0), version: 999 },
        }),
    );
    expect(forged.createdBy).toBe(creator);
    expect(forged.createdAt).toEqual(before.createdAt);
    expect(forged.version).toBe(before.version + 1);
  });

  it('impide cambiar el identificador de un registro', async () => {
    const otherTenant = newTestTenant('identificador');
    await createTenant(database, otherTenant);
    const change = database.withTenant({ tenantId: otherTenant.id, userId: null }, (transaction) =>
      transaction.tenant.update({ where: { id: otherTenant.id }, data: { id: uuidv7() } }),
    );
    await expect(change).rejects.toThrow();
  });
});

describe('identificadores', () => {
  it('el identificador lo genera la aplicación como UUID versión 7 (ADR-021)', async () => {
    const event = await database.withTenant({ tenantId: tenant.id, userId: null }, (transaction) =>
      transaction.outboxEvent.create({
        data: { tenantId: tenant.id, eventType: 'test.uuid', payload: {} },
      }),
    );
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('reglas de integridad en la base de datos', () => {
  it('rechaza un estado de empresa que no existe', async () => {
    const write = renameTenantStatus('inventado');
    await expect(write).rejects.toThrow();
  });

  it('rechaza un nombre de evento sin el formato del numeral 13.3', async () => {
    const write = database.withTenant({ tenantId: tenant.id, userId: null }, (transaction) =>
      transaction.outboxEvent.create({
        data: { tenantId: tenant.id, eventType: 'Evento Mal Escrito', payload: {} },
      }),
    );
    await expect(write).rejects.toThrow();
  });
});

function renameTenantStatus(status: string) {
  return database.withTenant({ tenantId: tenant.id, userId: null }, (transaction) =>
    transaction.tenant.update({ where: { id: tenant.id }, data: { status } }),
  );
}
