import { createdResponseSchema, delegationListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { MINUTE, auditActions, errorCode } from './support/iam-fixtures.js';
import { AccessScenario, type Person } from './support/access-scenario.js';

// Delegación temporal de aprobaciones (B10, ficha 17.2). Cada persona delega lo suyo; el
// administrador registra las de otros, nunca a su favor; solo aprobaciones que se tienen.

const scenario = new AccessScenario('delegaciones');
const DAY = 24 * 60 * MINUTE;

function period(days: number) {
  const start = scenario.clock.now();
  return {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + days * DAY).toISOString(),
  };
}

function delegate(actor: Person, body: object) {
  return scenario.post('/v1/delegations', actor.session, {
    ...period(10),
    reason: 'Vacaciones de fin de año',
    permissions: ['finance.invoice.approve'],
    ...body,
  });
}

/** Persona interna con aprobaciones de finanzas, que puede delegar las suyas. */
function financeLead(label: string): Promise<Person> {
  return scenario.person(label, ['COLABORADOR', 'ADMIN_FINANCIERO']);
}

describe('delegar las propias aprobaciones', () => {
  it('crea la delegación, la audita y la ve quien delega y quien recibe', async () => {
    const lead = await financeLead('delega');
    const backup = await scenario.person('recibe', ['COLABORADOR']);
    const response = await delegate(lead, { to_user_id: backup.id });
    expect(response.status).toBe(201);
    const { id } = createdResponseSchema.parse(response.body);
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'iam.delegation.create:success',
    ]);
    for (const person of [lead, backup]) {
      const list = delegationListResponseSchema.parse(
        (await scenario.get('/v1/delegations', person.session)).body,
      );
      expect(list.data.map((item) => item.id)).toContain(id);
      expect(list.data.find((item) => item.id === id)?.status).toBe('active');
    }
  });

  it('solo se delegan aprobaciones que se tienen hoy', async () => {
    const worker = await scenario.person('sin-aprobaciones', ['COLABORADOR']);
    const backup = await scenario.person('recibe-nada', ['COLABORADOR']);
    expect(errorCode(await delegate(worker, { to_user_id: backup.id }))).toBe('DELEGATION_INVALID');
    const lead = await financeLead('no-aprobacion');
    const notApproval = await delegate(lead, {
      to_user_id: backup.id,
      permissions: ['finance.payment.manage'],
    });
    expect(errorCode(notApproval)).toBe('DELEGATION_INVALID');
  });

  it('no a sí mismo ni por más de 60 días', async () => {
    const lead = await financeLead('fechas');
    const backup = await scenario.person('fechas-recibe', ['COLABORADOR']);
    expect(errorCode(await delegate(lead, { to_user_id: lead.id }))).toBe('DELEGATION_INVALID');
    const long = await delegate(lead, { to_user_id: backup.id, ...period(61) });
    expect(errorCode(long)).toBe('DELEGATION_INVALID');
  });
});

describe('delegaciones de otras personas', () => {
  it('un colaborador no registra delegaciones de otros ni retira las ajenas', async () => {
    const lead = await financeLead('ajena-delega');
    const backup = await scenario.person('ajena-recibe', ['COLABORADOR']);
    const intruder = await scenario.person('intrusa', ['COLABORADOR']);
    const forOther = await delegate(intruder, { from_user_id: lead.id, to_user_id: backup.id });
    expect(errorCode(forOther)).toBe('PERMISSION_DENIED');
    const { id } = createdResponseSchema.parse(
      (await delegate(lead, { to_user_id: backup.id })).body,
    );
    const revoke = await scenario.post(`/v1/delegations/${id}/actions/revoke`, intruder.session);
    expect(revoke.status).toBe(404);
    const byDelegate = await scenario.post(`/v1/delegations/${id}/actions/revoke`, backup.session);
    expect(byDelegate.status).toBe(404);
  });

  it('el administrador registra la de otra persona, pero nunca a su favor', async () => {
    const admin = await scenario.person('admin-delega', ['ADMIN_PLATAFORMA', 'COLABORADOR']);
    const lead = await financeLead('de-otro');
    const backup = await scenario.person('para-otro', ['COLABORADOR']);
    const ok = await delegate(admin, { from_user_id: lead.id, to_user_id: backup.id });
    expect(ok.status).toBe(201);
    const toAdmin = await delegate(admin, { from_user_id: lead.id, to_user_id: admin.id });
    expect(errorCode(toAdmin)).toBe('DELEGATION_INVALID');
    const { id } = createdResponseSchema.parse(ok.body);
    expect(
      (await scenario.post(`/v1/delegations/${id}/actions/revoke`, admin.session)).status,
    ).toBe(204);
  });

  it('una persona de otra empresa no recibe delegaciones ni las ve', async () => {
    const lead = await financeLead('empresa-a');
    const foreign = await scenario.person('empresa-b', ['ADMIN_PLATAFORMA'], {
      tenantId: scenario.otherTenant.id,
    });
    expect(errorCode(await delegate(lead, { to_user_id: foreign.id }))).toBe('DELEGATION_INVALID');
    const list = delegationListResponseSchema.parse(
      (await scenario.get('/v1/delegations', foreign.session)).body,
    );
    expect(list.data.every((item) => item.from_user.id !== lead.id)).toBe(true);
  });
});

describe('delegar por correo', () => {
  it('quien no ve la lista de usuarios delega escribiendo el correo', async () => {
    const lead = await financeLead('por-correo');
    const backup = await scenario.person('recibe-por-correo', ['COLABORADOR']);
    const response = await delegate(lead, { to_email: backup.email });
    expect(response.status).toBe(201);
    const list = delegationListResponseSchema.parse(
      (await scenario.get('/v1/delegations', backup.session)).body,
    );
    expect(list.data.some((item) => item.to_user.id === backup.id)).toBe(true);
  });

  it('el correo de alguien de otra empresa no sirve, igual que uno que no existe', async () => {
    const lead = await financeLead('correo-ajeno');
    const foreign = await scenario.person('correo-b', [], { tenantId: scenario.otherTenant.id });
    expect(errorCode(await delegate(lead, { to_email: foreign.email }))).toBe('DELEGATION_INVALID');
    expect(errorCode(await delegate(lead, { to_email: 'nadie@pruebas.test' }))).toBe(
      'DELEGATION_INVALID',
    );
  });
});
