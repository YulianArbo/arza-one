import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { PartyScenario, personBody, uniqueNumber } from './support/party-scenario.js';

// Prospecto sin documento (B22): se registra con nombre y contacto; para dejar de ser prospecto
// debe completar el tipo y el número de documento. La base de datos también lo exige.

const scenario = new PartyScenario('terceros prospectos');
const NO_DOCUMENT = { id_type: null, id_number: null };

async function prospectWithoutDocument() {
  const sales = await scenario.sales();
  const body = await scenario.personWithConsent({ status: 'prospect', ...NO_DOCUMENT });
  const id = await scenario.party(sales, body);
  return { sales, id };
}

describe('prospecto sin documento', () => {
  it('se registra y se ve como prospecto sin documento', async () => {
    const { sales, id } = await prospectWithoutDocument();
    const detail = await scenario.detail(sales, id);
    expect(detail).toMatchObject({ status: 'prospect', id_type: null, id_number: null });
  });

  it('no pasa a activo sin documento; con el documento completo, sí', async () => {
    const { sales, id } = await prospectWithoutDocument();
    const before = await scenario.detail(sales, id);
    const blocked = await scenario.postVersioned(
      `/v1/parties/${id}/actions/change-status`,
      sales.session,
      { status: 'active' },
      before.version,
    );
    expect(errorCode(blocked)).toBe('PARTY_DOCUMENT_REQUIRED');
    const data = personBody({ first_name: before.first_name, last_name: before.last_name });
    const updated = await scenario.patch(`/v1/parties/${id}`, sales.session, data, before.version);
    expect(updated.status, updated.text).toBe(204);
    const after = await scenario.detail(sales, id);
    const active = await scenario.postVersioned(
      `/v1/parties/${id}/actions/change-status`,
      sales.session,
      { status: 'active' },
      after.version,
    );
    expect(active.status, active.text).toBe(204);
  });
});

describe('el documento de un tercero que no es prospecto', () => {
  it('a un tercero activo no se le quita el documento', async () => {
    const sales = await scenario.sales();
    const body = personBody();
    const id = await scenario.party(sales, await scenario.personWithConsent(body));
    const detail = await scenario.detail(sales, id);
    const response = await scenario.patch(
      `/v1/parties/${id}`,
      sales.session,
      { ...body, ...NO_DOCUMENT },
      detail.version,
    );
    expect(errorCode(response)).toBe('PARTY_DOCUMENT_REQUIRED');
  });

  it('la base de datos rechaza un activo sin documento o un documento a medias', async () => {
    const { id } = await prospectWithoutDocument();
    const inTenant = tenantScope(scenario.db, scenario.tenant.id);
    await expect(
      inTenant((tx) => tx.party.update({ where: { id }, data: { status: 'active' } })),
    ).rejects.toThrow(/pty_parties_document_required_check/);
    await expect(
      inTenant((tx) => tx.party.update({ where: { id }, data: { idNumber: uniqueNumber() } })),
    ).rejects.toThrow(/pty_parties_document_pair_check/);
  });
});
