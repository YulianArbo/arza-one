import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { changesBetween, recordAuditEvent } from '../../../src/platform/audit/audit-recorder.js';
import type { DatabaseService } from '../../../src/platform/database/database.service.js';
import {
  connect,
  createDatabaseService,
  createTenant,
  integrationDatabase,
  newTestTenant,
  type TestTenant,
} from '../support/integration-database.js';

// Cadena de hash de la auditoría (ficha 17.20, ADR-012): la base de datos encadena cada evento,
// app_user no puede modificar ni borrar nada, y cualquier alteración hace fallar la verificación.

let database: DatabaseService;
let appUser: pg.Client;
let owner: pg.Client;

beforeAll(async () => {
  database = createDatabaseService();
  appUser = await connect(integrationDatabase().appUrl);
  owner = await connect(integrationDatabase().migrationUrl);
});

afterAll(async () => {
  await Promise.all([appUser.end(), owner.end(), database.onModuleDestroy()]);
});

/** Empresa nueva con tres eventos encadenados. */
async function tenantWithEvents(label: string): Promise<TestTenant> {
  const tenant = newTestTenant(label);
  await createTenant(database, tenant);
  for (const name of ['uno', 'dos', 'tres']) {
    await database.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
      recordAuditEvent(tx, {
        tenantId: tenant.id,
        occurredAt: new Date(),
        actor: { kind: 'system' },
        action: 'core.tenant.update',
        entityType: 'tenant',
        entityId: tenant.id,
        result: 'success',
        changes: { name },
        meta: null,
      }),
    );
  }
  return tenant;
}

/** Ejecuta SQL con la empresa fijada, como lo haría la API. */
async function inTenant<T extends pg.QueryResultRow>(
  client: pg.Client,
  tenantId: string,
  sql: string,
): Promise<T[]> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await client.query<T>(sql);
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

interface Verification {
  checked: string;
  broken_seq: string | null;
  problem: string | null;
}

describe('datos restringidos de auditoría', () => {
  it('encadena la marca de cambio sin guardar los valores restringidos', async () => {
    const tenant = await tenantWithEvents('campos restringidos');
    await database.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
      recordAuditEvent(tx, {
        tenantId: tenant.id,
        occurredAt: new Date(),
        actor: { kind: 'system' },
        action: 'core.tenant.update',
        entityType: 'tenant',
        entityId: tenant.id,
        result: 'success',
        changes: changesBetween({ privateNote: 'antes' }, { privateNote: 'después' }, [
          'privateNote',
        ]),
        meta: null,
      }),
    );
    const [row] = await inTenant<{ changes: unknown }>(
      appUser,
      tenant.id,
      'SELECT changes FROM aud_events ORDER BY seq DESC LIMIT 1',
    );
    expect(row?.changes).toEqual({ privateNote: { changed: true } });
    expect(await verify(tenant.id)).toMatchObject({ broken_seq: null, problem: null });
  });
});

async function verify(tenantId: string): Promise<Verification | undefined> {
  const [row] = await inTenant<Verification>(appUser, tenantId, 'SELECT * FROM aud_verify_chain()');
  return row;
}

/** Altera la auditoría como lo haría alguien con acceso directo al servidor (el dueño). */
function tamper(tenantId: string, sql: string): Promise<unknown> {
  return inTenant(owner, tenantId, sql);
}

describe('cadena de hash', () => {
  it('cada evento ocupa el lugar siguiente y apunta al hash del anterior', async () => {
    const tenant = await tenantWithEvents('cadena');
    const rows = await inTenant<{ seq: string; prev_hash: string; hash: string }>(
      appUser,
      tenant.id,
      'SELECT seq, prev_hash, hash FROM aud_events ORDER BY seq',
    );
    // El primero es la creación de la empresa (datos semilla) y luego los roles del sistema.
    expect(rows[0]?.seq).toBe('1');
    expect(rows[0]?.prev_hash).toBe('0'.repeat(64));
    rows.slice(1).forEach((row, index) => {
      expect(row.seq).toBe(String(index + 2));
      expect(row.prev_hash).toBe(rows[index]?.hash);
    });
    expect(await verify(tenant.id)).toMatchObject({ broken_seq: null, problem: null });
  });

  it('lo que la API envíe como hash o lugar se ignora', async () => {
    const tenant = await tenantWithEvents('falsificar');
    const [row] = await inTenant<{ seq: string; hash: string }>(
      appUser,
      tenant.id,
      `INSERT INTO aud_events (id, tenant_id, occurred_at, actor_kind, action, entity_type,
                               result, seq, prev_hash, hash)
       VALUES (gen_random_uuid(), '${tenant.id}', now(), 'system', 'core.tenant.update', 'tenant',
               'success', 1, repeat('a', 64), repeat('b', 64))
       RETURNING seq, hash`,
    );
    expect(row?.seq).not.toBe('1');
    expect(row?.hash).not.toBe('b'.repeat(64));
    expect(await verify(tenant.id)).toMatchObject({ problem: null });
  });
});

describe('el usuario de la aplicación no puede cambiar la auditoría', () => {
  it.each([
    ['modificar un evento', `UPDATE aud_events SET result = 'failure'`],
    ['borrar un evento', 'DELETE FROM aud_events'],
    ['vaciar la tabla', 'TRUNCATE aud_events'],
    ['tocar el último eslabón', `UPDATE aud_chain_heads SET seq = 0`],
    ['borrar una exportación', 'DELETE FROM aud_exports'],
    ['modificar un evento de seguridad', `UPDATE aud_security_events SET severity = 'low'`],
    ['entrar directo a una partición', 'SELECT count(*) FROM aud_events_default'],
  ])('no puede %s', async (_what, sql) => {
    const tenant = await tenantWithEvents('solo inserción');
    await expect(inTenant(appUser, tenant.id, sql)).rejects.toThrow(/permission denied/);
  });
});

describe('alterar una fila hace fallar la verificación', () => {
  it.each([
    [
      'cambiar lo que dice un evento',
      `UPDATE aud_events SET changes = '{"name":"otro"}' WHERE seq = 2`,
      'altered',
    ],
    ['borrar un evento del medio', 'DELETE FROM aud_events WHERE seq = 2', 'missing'],
    [
      'borrar el último evento',
      'DELETE FROM aud_events WHERE seq = (SELECT max(seq) FROM aud_events)',
      'truncated',
    ],
    [
      'recalcular el hash del evento cambiado',
      `UPDATE aud_events e SET changes = '{"name":"otro"}' WHERE seq = 2;
       UPDATE aud_events e SET hash = aud_event_hash(e) WHERE seq = 2`,
      'broken_link',
    ],
  ])('%s', async (_what, sql, problem) => {
    const tenant = await tenantWithEvents('alterada');
    await tamper(tenant.id, sql);
    const result = await verify(tenant.id);
    expect(result?.problem).toBe(problem);
    expect(result?.broken_seq).not.toBeNull();
  });
});
