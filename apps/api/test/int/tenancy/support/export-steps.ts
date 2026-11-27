import { inflateRawSync } from 'node:zlib';

import {
  tenantExportCreatedResponseSchema,
  tenantExportListResponseSchema,
  type TenantExport,
} from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import type { Clock } from '../../../../src/platform/clock/clock.js';
import { storage } from '../../doc/support/file-scenario.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { apiDatabase, connect, integrationDatabase } from '../../support/integration-database.js';
import { sendAs } from './tenancy-fixture.js';

// Pasos de las pruebas de exportación y eliminación (B48). Las tablas y sus filas se cuentan con
// el catálogo de PostgreSQL y como dueño del esquema, no con el código que se prueba.

const DAY = 24 * 60 * 60 * 1000;

/** Lector mínimo de ZIP: directorio central y deflate. */
export function readZip(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let index = 0; index < count; index += 1) {
    const compressed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const start = offset + 30 + zip.readUInt16LE(offset + 26);
    entries.set(name, inflateRawSync(zip.subarray(start, start + compressed)));
    at += 46 + nameLength;
  }
  return entries;
}

function clockAt(at: Date): Clock {
  return { now: () => at };
}

export function later(s: AccessScenario, days: number): Clock {
  return clockAt(new Date(s.clock.now().getTime() + days * DAY));
}

export interface WorkDependencies {
  readonly database: ReturnType<typeof apiDatabase>;
  readonly clock: Clock;
  readonly storage: ReturnType<typeof storage>;
}

export function workDeps(s: AccessScenario, clock: Clock = s.clock): WorkDependencies {
  return { database: apiDatabase(), clock, storage: storage() };
}

/** Tablas con tenant_id según el catálogo, sin particiones. */
export async function catalogTables(): Promise<string[]> {
  const owner = await connect(integrationDatabase().migrationUrl);
  try {
    const result = await owner.query<{ name: string }>(`
      SELECT c.relname AS name FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      ORDER BY c.relname`);
    return result.rows.map((row) => row.name);
  } finally {
    await owner.end();
  }
}

/** Filas de cada tabla de la empresa, contadas como dueño del esquema en su contexto. */
export async function rowCounts(
  tenantId: string,
  tables: readonly string[],
): Promise<Map<string, number>> {
  const owner = await connect(integrationDatabase().migrationUrl);
  try {
    await owner.query('BEGIN');
    await owner.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const counts = new Map<string, number>();
    for (const table of tables) {
      const result = await owner.query<{ total: string }>(
        `SELECT count(*) AS total FROM "${table}" WHERE tenant_id = $1`,
        [tenantId],
      );
      counts.set(table, Number(result.rows[0]?.total ?? 0));
    }
    await owner.query('ROLLBACK');
    return counts;
  } finally {
    await owner.end();
  }
}

/** Filas de un CSV: encabezado más una línea por fila; los saltos entre comillas no cuentan. */
export function csvRows(content: Buffer): number {
  let rows = 0;
  let quoted = false;
  for (const char of content.toString('utf8')) {
    if (char === '"') quoted = !quoted;
    if (char === '\n' && !quoted) rows += 1;
  }
  return rows - 1;
}

export async function exportsOf(s: AccessScenario, person: Person): Promise<TenantExport[]> {
  const response = await s.get('/v1/tenant/exports', person.session);
  expect(response.status, response.text).toBe(200);
  return tenantExportListResponseSchema.parse(response.body).data;
}

export function download(s: AccessScenario, person: Person, id: string): request.Test {
  return sendAs(s, 'post', `/v1/tenant/exports/${id}/download`, person.session)
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        done(null, Buffer.concat(chunks));
      });
    });
}

export async function requestExport(s: AccessScenario, person: Person): Promise<string> {
  const response = await sendAs(s, 'post', '/v1/tenant/exports', person.session);
  expect(response.status, response.text).toBe(201);
  return tenantExportCreatedResponseSchema.parse(response.body).id;
}

/**
 * Tablas con seguridad por fila sin forzar y disparadores apagados: deben ser cero. Las particiones
 * de la auditoría se leen siempre por su tabla madre, que es la que la fuerza.
 */
export async function weakenedControls(): Promise<{ unforced: string[]; disabled: string[] }> {
  const owner = await connect(integrationDatabase().migrationUrl);
  try {
    const unforced = await owner.query<{ name: string }>(`
      SELECT c.relname AS name FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
        AND NOT c.relforcerowsecurity`);
    const disabled = await owner.query<{ name: string }>(`
      SELECT t.tgname AS name FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled = 'D'`);
    return {
      unforced: unforced.rows.map((row) => row.name),
      disabled: disabled.rows.map((row) => row.name),
    };
  } finally {
    await owner.end();
  }
}

/** Tablas con tenant_id sin su política «_purge»: la eliminación no podría borrarlas. */
export async function tablesWithoutPurgePolicy(): Promise<string[]> {
  const owner = await connect(integrationDatabase().migrationUrl);
  try {
    const result = await owner.query<{ name: string }>(`
      SELECT c.relname AS name FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
        AND c.relname <> 'core_tenants'
        AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname
                          AND p.policyname = c.relname || '_purge')`);
    return result.rows.map((row) => row.name);
  } finally {
    await owner.end();
  }
}
