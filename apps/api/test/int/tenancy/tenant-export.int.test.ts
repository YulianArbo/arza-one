import { Readable } from 'node:stream';

import type { ExportManifest } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { runTenantExportWork } from '../../../src/modules/tenancy/index.js';
import { storage } from '../doc/support/file-scenario.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import {
  catalogTables,
  csvRows,
  download,
  exportsOf,
  later,
  readZip,
  requestExport,
  rowCounts,
  workDeps,
} from './support/export-steps.js';
import { actionsIn, operator, sendAs } from './support/tenancy-fixture.js';

// Exportación completa (B48, criterios «la exportación de una empresa es completa» y «dos empresas
// operan sin ningún dato cruzado»). La lista de tablas sale del catálogo de PostgreSQL. Las pruebas
// van en orden: piden, generan, descargan y revisan la misma exportación.

const s = new AccessScenario('exportacion');

let director: Person;
let exportId: string;
let zip: Map<string, Buffer>;
/** Filas de cada tabla justo antes de descargar. */
let beforeDownload: Map<string, number>;

function manifestOf(entries: Map<string, Buffer>): ExportManifest {
  return JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}') as ExportManifest;
}

beforeAll(async () => {
  director = await s.person('direccion-exporta', ['DIRECCION']);
  await s.person('colaborador-exportado', ['COLABORADOR']);
  await s.person('colaborador-otra', ['COLABORADOR'], { tenantId: s.otherTenant.id });
  await storage().put(
    { key: `${s.tenant.id}/contrato-prueba`, contentType: 'text/plain', sizeBytes: 14 },
    Readable.from([Buffer.from('contenido real')]),
  );
});

describe('quién exporta', () => {
  it('solo la Dirección pide y descarga la exportación (permiso denegado a los demás)', async () => {
    const admin = await s.person('admin-no-exporta', ['ADMIN_PLATAFORMA']);
    const worker = await s.person('colaborador-no-exporta', ['COLABORADOR']);
    for (const person of [admin, worker]) {
      expect((await sendAs(s, 'post', '/v1/tenant/exports', person.session)).status).toBe(403);
      expect((await s.get('/v1/tenant/exports', person.session)).status).toBe(403);
    }
    const op = await operator(s, 'operador-no-exporta');
    expect((await s.get('/v1/tenant/exports', op.session)).status).toBe(403);
  });
});

describe('pedir la exportación', () => {
  it('la Dirección la pide y no puede pedir otra mientras tanto', async () => {
    exportId = await requestExport(s, director);
    const again = await sendAs(s, 'post', '/v1/tenant/exports', director.session);
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe('TENANCY_EXPORT_IN_PROGRESS');
    expect((await exportsOf(s, director))[0]?.status).toBe('queued');
    const early = await download(s, director, exportId);
    expect(early.status).toBe(409);
  });
});

describe('generar y descargar', () => {
  it('el worker la genera y la Dirección la descarga, con auditoría y alerta', async () => {
    // Otra prueba en paralelo puede correr el mismo trabajo: se revisa el estado, no el conteo.
    await runTenantExportWork(workDeps(s));
    const ready = (await exportsOf(s, director)).find((entry) => entry.id === exportId);
    expect(ready?.status).toBe('ready');
    beforeDownload = await rowCounts(s.tenant.id, await catalogTables());
    const response = await download(s, director, exportId);
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('.zip');
    zip = readZip(response.body as Buffer);
    expect(await actionsIn(s, s.tenant.id)).toEqual(
      expect.arrayContaining([
        'core.tenant.export_request',
        'core.tenant.export_ready',
        'core.tenant.export_download',
      ]),
    );
    // La descarga es una exportación masiva: deja su alerta de seguridad (B44).
    const after = await rowCounts(s.tenant.id, ['aud_security_events']);
    expect(after.get('aud_security_events')).toBe(
      (beforeDownload.get('aud_security_events') ?? 0) + 1,
    );
  });
});

describe('contenido completo', () => {
  it('trae todas las tablas de la empresa con todas sus filas', async () => {
    const manifest = manifestOf(zip);
    const omitted = manifest.omitted_tables.map((entry) => entry.table);
    const expected = (await catalogTables()).filter((table) => !omitted.includes(table));
    expect(manifest.tables.map((entry) => entry.table)).toEqual(expected);
    // La auditoría registra «lista» después de copiar su propia tabla.
    const afterwards = await s.db.withTenant({ tenantId: s.tenant.id, userId: null }, (tx) =>
      tx.auditEvent.count({ where: { entityId: exportId, action: 'core.tenant.export_ready' } }),
    );
    expect(afterwards).toBe(1);
    for (const entry of manifest.tables) {
      const csv = zip.get(`tablas/${entry.table}.csv`) ?? Buffer.alloc(0);
      const late = entry.table === 'aud_events' ? afterwards : 0;
      expect(entry.rows, entry.table).toBe((beforeDownload.get(entry.table) ?? 0) - late);
      expect(csvRows(csv), entry.table).toBe(entry.rows);
    }
    expect(beforeDownload.get('iam_users')).toBeGreaterThan(0);
    expect(beforeDownload.get('aud_events')).toBeGreaterThan(0);
  });
});

describe('archivos y secretos', () => {
  it('trae los archivos con su huella y nunca los secretos', () => {
    const manifest = manifestOf(zip);
    const file = manifest.files.find((entry) => entry.path === 'archivos/contrato-prueba');
    expect(file?.size_bytes).toBe(14);
    expect(zip.get('archivos/contrato-prueba')?.toString('utf8')).toBe('contenido real');
    expect(manifest.omitted_tables.map((entry) => entry.table)).toEqual(
      expect.arrayContaining(['iam_sessions', 'iam_mfa_factors', 'iam_recovery_codes']),
    );
    expect(zip.has('tablas/iam_sessions.csv')).toBe(false);
    const users = zip.get('tablas/iam_users.csv')?.toString('utf8') ?? '';
    expect(users.split('\r\n')[0]).not.toContain('password_hash');
    expect(users).not.toContain('$argon2');
  });
});

describe('aislamiento', () => {
  it('no trae ningún dato de la otra empresa, en ninguna tabla', () => {
    for (const [name, content] of zip) {
      expect(content.toString('utf8').includes(s.otherTenant.id), name).toBe(false);
    }
  });
});

describe('vencimiento', () => {
  it('vence a los 7 días: se borra y ya no se descarga', async () => {
    await runTenantExportWork(workDeps(s, later(s, 8)));
    const expired = (await exportsOf(s, director)).find((entry) => entry.id === exportId);
    expect(expired?.status).toBe('expired');
    const fresh = await s.refresh(director);
    expect((await download(s, fresh, exportId)).status).toBe(409);
  });
});
