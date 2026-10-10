import {
  auditEventListResponseSchema,
  auditExportListResponseSchema,
  chainVerificationSchema,
  securityEventListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { ChainVerificationUseCase } from '../../../src/modules/audit/index.js';
import { MINUTE, errorCode } from '../iam/support/iam-fixtures.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { connect, integrationDatabase } from '../support/integration-database.js';

// Exportación auditada (numeral 13.2) y verificación de la cadena (ficha 17.20).

const scenario = new AccessScenario('exportación y verificación');

function auditor(): Promise<Person> {
  return scenario.person('auditora', ['AUDITOR']);
}

async function latest(person: Person, action: string) {
  const response = await scenario.get(`/v1/audit-events?action=${action}`, person.session);
  return auditEventListResponseSchema.parse(response.body).data[0];
}

describe('exportación de la auditoría', () => {
  it('entrega un CSV, la registra en exportaciones y la deja auditada', async () => {
    const person = await auditor();
    const response = await scenario.post('/v1/audit-exports', person.session, { action: 'iam' });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="auditoria-/);
    const [header, ...rows] = response.text.replace('﻿', '').trim().split('\r\n');
    expect(header).toBe(
      'posicion,fecha_utc,tipo_actor,actor_id,actor_correo,accion,tipo_registro,registro_id,' +
        'resultado,cambios,ip,correlacion,hash',
    );
    expect(rows.length).toBeGreaterThan(0);
    const list = auditExportListResponseSchema.parse(
      (await scenario.get('/v1/audit-exports', person.session)).body,
    );
    expect(list.data[0]).toMatchObject({
      requested_by: { id: person.id },
      scope: { action: 'iam' },
      row_count: rows.length,
    });
    expect((await latest(person, 'audit.event.export'))?.changes).toMatchObject({
      row_count: rows.length,
    });
  });

  it('pide confirmar la identidad si la sesión no es reciente', async () => {
    const person = await auditor();
    scenario.clock.advance(31 * MINUTE);
    const response = await scenario.post('/v1/audit-exports', person.session);
    expect(errorCode(response)).toBe('REAUTHENTICATION_REQUIRED');
  });
});

async function verifyAs(person: Person) {
  const response = await scenario.post('/v1/audit-events/verify-chain', person.session);
  expect(response.status).toBe(200);
  return chainVerificationSchema.parse(response.body);
}

describe('verificación de la cadena', () => {
  it('una cadena sin tocar está íntegra y la verificación queda auditada', async () => {
    const admin = await scenario.person('admin', ['ADMIN_PLATAFORMA']);
    const result = await verifyAs(admin);
    expect(result).toMatchObject({ intact: true, broken_seq: null, problem: null });
    expect(result.checked).toBeGreaterThan(0);
    expect(await latest(admin, 'audit.chain.verify')).toMatchObject({ result: 'success' });
  });

  it('el trabajo diario verifica cada empresa', async () => {
    const results = await scenario.app.get(ChainVerificationUseCase).verifyAllTenants();
    const ours = results.filter((item) => item.tenantId === scenario.otherTenant.id);
    expect(ours).toEqual([expect.objectContaining({ problem: null })]);
  });

  // Va al final: deja dañada la cadena de la empresa del escenario.
  it('una fila alterada se detecta y queda como evento de seguridad crítico', async () => {
    const admin = await scenario.person('admin', ['ADMIN_PLATAFORMA']);
    const owner = await connect(integrationDatabase().migrationUrl);
    try {
      await owner.query('BEGIN');
      await owner.query(`SELECT set_config('app.tenant_id', $1, true)`, [scenario.tenant.id]);
      await owner.query(`UPDATE aud_events SET result = 'failure' WHERE seq = 2`);
      await owner.query('COMMIT');
    } finally {
      await owner.end();
    }
    expect(await verifyAs(admin)).toMatchObject({
      intact: false,
      broken_seq: 2,
      problem: 'altered',
    });
    const security = securityEventListResponseSchema.parse(
      (await scenario.get('/v1/security-events', admin.session)).body,
    );
    expect(security.data[0]).toMatchObject({ type: 'audit.chain.broken', severity: 'critical' });
  });
});
