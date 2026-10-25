import { inviteUserResponseSchema, myCompanyResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode, tenantScope, uniqueEmail } from '../iam/support/iam-fixtures.js';
import { getImage, putJson, uploadImage } from '../support/image-steps.js';
import { PartyScenario, organizationBody } from './support/party-scenario.js';

// Empresa cliente de las cuentas del portal (B22A): se elige al invitar, solo entre los clientes
// vigentes de la misma empresa, y la persona ve el nombre y el logo de la suya y de ninguna otra.

const scenario = new PartyScenario('empresa del portal');

function invite(admin: Person, partyId: string | null): ReturnType<typeof scenario.post> {
  return scenario.post('/v1/users', admin.session, {
    email: uniqueEmail('cliente'),
    kind: 'portal',
    party_id: partyId,
  });
}

/** Persona del portal ligada a la empresa dada, como la deja la invitación. */
async function portalPerson(partyId: string): Promise<Person> {
  const person = await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' });
  await tenantScope(
    scenario.db,
    scenario.tenant.id,
  )((tx) => tx.user.update({ where: { id: person.id }, data: { partyId } }));
  return person;
}

describe('invitar a una persona del portal con su empresa', () => {
  it('liga la cuenta a la empresa cliente y lo deja en la auditoría', async () => {
    const admin = await scenario.person('admin', ['ADMIN_PLATAFORMA']);
    const company = await scenario.party(await scenario.sales());
    const response = await invite(admin, company);
    expect(response.status, response.text).toBe(201);
    const { id } = inviteUserResponseSchema.parse(response.body);
    const [user, event] = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      Promise.all([
        tx.user.findUniqueOrThrow({ where: { id } }),
        tx.auditEvent.findFirstOrThrow({ where: { entityId: id, action: 'iam.user.invite' } }),
      ]),
    );
    expect(user.partyId).toBe(company);
    expect(event.changes).toMatchObject({ party_id: company });
  });

  it('rechaza una persona, un no cliente o un tercero de otra empresa', async () => {
    const admin = await scenario.person('admin-rechazos', ['ADMIN_PLATAFORMA']);
    const sales = await scenario.sales();
    const person = await scenario.party(sales, await scenario.personWithConsent());
    const supplier = await scenario.party(sales, organizationBody({ roles: ['supplier'] }));
    const foreign = await scenario.party(await scenario.sales(scenario.otherTenant.id));
    for (const partyId of [person, supplier, foreign]) {
      expect(errorCode(await invite(admin, partyId))).toBe('CLIENT_COMPANY_INVALID');
    }
    expect((await invite(admin, null)).status).toBe(422);
  });
});

describe('la empresa en el portal', () => {
  it('la persona ve el nombre y el logo de su empresa', async () => {
    const sales = await scenario.sales();
    const company = await scenario.party(sales);
    const fileId = await uploadImage(scenario, sales, `/v1/parties/${company}/logo/uploads`);
    await putJson(scenario, `/v1/parties/${company}/logo`, sales.session, { file_id: fileId });
    const client = await portalPerson(company);
    const mine = myCompanyResponseSchema.parse(
      (await scenario.get('/v1/me/company', client.session)).body,
    );
    expect(mine.company).toMatchObject({ id: company, has_logo: true });
    expect((await getImage(scenario, '/v1/me/company/logo', client.session)).status).toBe(200);
    expect(errorCode(await scenario.get(`/v1/parties/${company}/logo`, client.session))).toBe(
      'PERMISSION_DENIED',
    );
  });

  it('una cuenta sin empresa, o interna, no tiene empresa ni logo', async () => {
    const internal = await scenario.sales();
    const body = myCompanyResponseSchema.parse(
      (await scenario.get('/v1/me/company', internal.session)).body,
    );
    expect(body.company).toBeNull();
    expect(errorCode(await scenario.get('/v1/me/company/logo', internal.session))).toBe(
      'IMAGE_NOT_FOUND',
    );
  });
});
