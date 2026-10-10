import {
  auditEventListResponseSchema,
  createdResponseSchema,
  securityEventListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { recordSecurityEvent } from '../../../src/platform/audit/audit-recorder.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';

// Consulta de la auditoría (B11, ficha 17.20): eventos con filtros y páginas, historial de un
// registro y eventos de seguridad. Consultar también queda auditado.

const scenario = new AccessScenario('consulta de auditoría');

function admin(): Promise<Person> {
  return scenario.person('admin', ['ADMIN_PLATAFORMA']);
}

async function events(person: Person, query: string) {
  const response = await scenario.get(`/v1/audit-events${query}`, person.session);
  expect(response.status).toBe(200);
  return auditEventListResponseSchema.parse(response.body);
}

async function createRole(person: Person): Promise<string> {
  const response = await scenario.post('/v1/roles', person.session, {
    name: `Ventas ${person.id.slice(-6)}`,
    audience: 'internal',
    permissions: [{ code: 'crm.lead.read', scope: 'all' }],
  });
  return createdResponseSchema.parse(response.body).id;
}

describe('consulta de eventos', () => {
  it('trae los eventos más recientes primero, con quién actuó', async () => {
    const person = await admin();
    const roleId = await createRole(person);
    const page = await events(person, '?action=iam.role');
    expect(page.data[0]).toMatchObject({
      action: 'iam.role.create',
      entity_id: roleId,
      actor: { kind: 'user', id: person.id, email: person.email },
    });
    expect(page.data.every((event) => event.action.startsWith('iam.role.'))).toBe(true);
  });

  it('pagina por cursor sin repetir ni saltar eventos', async () => {
    const person = await admin();
    const first = await events(person, '?limit=2');
    expect(first.data).toHaveLength(2);
    const second = await events(person, `?limit=2&cursor=${first.next_cursor ?? ''}`);
    const seqs = [...first.data, ...second.data].map((event) => event.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
    expect(new Set(seqs).size).toBe(4);
  });

  it('consultar la auditoría también queda auditado, con los filtros usados', async () => {
    const person = await admin();
    await events(person, '?result=failure');
    const page = await events(person, '?action=audit.event.read');
    expect(page.data[0]).toMatchObject({
      actor: { id: person.id },
      changes: { filters: { result: 'failure' } },
    });
  });
});

describe('historial de un registro', () => {
  it('muestra lo que le pasó al rol, del cambio más reciente al primero', async () => {
    const person = await admin();
    const roleId = await createRole(person);
    await scenario.patch(`/v1/roles/${roleId}`, person.session, { description: 'Equipo' }, 1);
    const response = await scenario.get(`/v1/entities/iam_role/${roleId}/history`, person.session);
    const history = auditEventListResponseSchema.parse(response.body);
    expect(history.data.map((event) => event.action)).toEqual([
      'iam.role.update',
      'iam.role.create',
    ]);
    expect(history.data[0]?.changes).toMatchObject({ description: { from: null, to: 'Equipo' } });
  });

  it('ver el historial no se anota en el historial del registro', async () => {
    const person = await admin();
    const roleId = await createRole(person);
    const path = `/v1/entities/iam_role/${roleId}/history`;
    await scenario.get(path, person.session);
    const history = auditEventListResponseSchema.parse(
      (await scenario.get(path, person.session)).body,
    );
    expect(history.data).toHaveLength(1);
  });
});

describe('eventos de seguridad', () => {
  it('lista los eventos de la empresa por gravedad y lo deja auditado', async () => {
    const person = await admin();
    await scenario.inTenant((tx) =>
      recordSecurityEvent(tx, {
        tenantId: scenario.tenant.id,
        occurredAt: scenario.clock.now(),
        type: 'iam.account.locked',
        userId: person.id,
        severity: 'high',
        detail: { failures: 10 },
        meta: { ip: '203.0.113.9', userAgent: null, correlationId: null },
      }),
    );
    const response = await scenario.get('/v1/security-events?severity=high', person.session);
    const page = securityEventListResponseSchema.parse(response.body);
    expect(page.data[0]).toMatchObject({ type: 'iam.account.locked', user: { id: person.id } });
    expect(page.data.every((event) => event.severity === 'high')).toBe(true);
    const reads = await events(person, '?action=audit.security.read');
    expect(reads.data[0]?.changes).toEqual({ filters: { severity: 'high' } });
  });
});
