import { describe, expect, it } from 'vitest';

import { recordAuditEvent } from '../../../src/platform/audit/audit-recorder.js';
import { BULK_EXPORT_ROWS } from '../../../src/platform/audit/bulk-export.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { NtfScenario } from './support/ntf-scenario.js';

// Alertas de seguridad del numeral 10.7 que agrega B44: inicio de sesión de un administrador y
// exportación masiva. Cada una deja evento de seguridad y alerta en la misma transacción que la
// auditoría, y solo llega a Administración y Dirección de la misma empresa.

const scenario = new NtfScenario('alertas b44');

async function alertsOf(userId: string, tenantId = scenario.tenant.id) {
  return tenantScope(
    scenario.db,
    tenantId,
  )(async (tx) => ({
    security: await tx.securityEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'asc' },
    }),
    outbox: (await tx.outboxEvent.findMany({ where: { eventType: 'security.alert' } })).filter(
      (row) => JSON.stringify(row.payload).includes(userId),
    ),
  }));
}

function types(rows: readonly { readonly type: string }[]): string[] {
  return rows.map((row) => row.type);
}

describe('inicio de sesión de un administrador (numeral 10.7)', () => {
  it('deja evento de seguridad, alerta y auditoría del ingreso', async () => {
    const admin = await scenario.people('admin-ingreso', ['ADMIN_PLATAFORMA']);
    const { security, outbox } = await alertsOf(admin.id);
    expect(types(security)).toContain('iam.login.admin');
    expect(outbox.map((row) => row.payload)).toContainEqual({
      type: 'iam.login.admin',
      user_id: admin.id,
    });
    expect(await scenario.actionsBy(admin)).toContain('iam.session.create');
  });

  it('una persona sin el rol de administrador no dispara la alerta', async () => {
    const person = await scenario.people('colaborador-ingreso', ['COLABORADOR', 'DIRECCION']);
    const { security, outbox } = await alertsOf(person.id);
    expect(types(security)).not.toContain('iam.login.admin');
    expect(outbox).toEqual([]);
  });

  it('la alerta llega a Dirección de la empresa y nunca a la otra empresa', async () => {
    const director = await scenario.people('director-a', ['DIRECCION']);
    const otherDirector = await scenario.people(
      'director-b',
      ['DIRECCION'],
      scenario.otherTenant.id,
    );
    await scenario.people('admin-aviso', ['ADMIN_PLATAFORMA']);
    await scenario.publishOutbox();
    await scenario.publishOutbox(scenario.otherTenant.id);
    const mine = await scenario.notifications(director);
    expect(mine.map((notice) => notice.title)).toContainEqual(
      expect.stringContaining('un administrador de la plataforma inició sesión'),
    );
    const theirs = await scenario.notifications(otherDirector);
    expect(theirs.map((notice) => notice.title)).not.toContainEqual(
      expect.stringContaining('un administrador de la plataforma inició sesión'),
    );
  });
});

async function auditExport(person: Person, action: string, rows: number): Promise<void> {
  await scenario.db.withTenant({ tenantId: scenario.tenant.id, userId: person.id }, (tx) =>
    recordAuditEvent(tx, {
      tenantId: scenario.tenant.id,
      occurredAt: scenario.clock.now(),
      actor: { kind: 'user', id: person.id },
      action,
      entityType: 'qms_action',
      entityId: null,
      result: 'success',
      changes: { rows },
      meta: { ip: '203.0.113.7', userAgent: 'prueba', correlationId: 'corr-b44' },
    }),
  );
}

describe('exportación masiva (numeral 10.7, decisión 6 de B44)', () => {
  it('más de 500 registros deja evento de seguridad y alerta con la acción y el tamaño', async () => {
    const person = await scenario.people('exporta-mucho', ['COLABORADOR']);
    await auditExport(person, 'qms.action.export', BULK_EXPORT_ROWS + 1);
    const { security, outbox } = await alertsOf(person.id);
    expect(types(security)).toContain('data.export.bulk');
    expect(outbox.map((row) => row.payload)).toContainEqual({
      type: 'data.export.bulk',
      user_id: person.id,
      action: 'qms.action.export',
      rows: BULK_EXPORT_ROWS + 1,
    });
  });

  it('una exportación pequeña no alerta', async () => {
    const person = await scenario.people('exporta-poco', ['COLABORADOR']);
    await auditExport(person, 'qms.action.export', 12);
    const { security, outbox } = await alertsOf(person.id);
    expect(types(security)).not.toContain('data.export.bulk');
    expect(outbox).toEqual([]);
  });

  it('exportar la auditoría por la API alerta siempre, y la alerta queda solo en su empresa', async () => {
    const auditor = await scenario.people('auditora-export', ['AUDITOR']);
    const response = await scenario.post('/v1/audit-exports', auditor.session, { action: 'iam' });
    expect(response.status, response.text).toBe(200);
    expect((await alertsOf(auditor.id)).outbox).toHaveLength(1);
    expect((await alertsOf(auditor.id, scenario.otherTenant.id)).outbox).toEqual([]);
  });

  it('quien no tiene permiso de exportar la auditoría no exporta ni dispara la alerta', async () => {
    const person = await scenario.people('sin-permiso-export', ['COLABORADOR']);
    const response = await scenario.post('/v1/audit-exports', person.session, { action: 'iam' });
    expect(response.status).toBe(403);
    expect((await alertsOf(person.id)).outbox).toEqual([]);
  });
});
