import { describe, expect, it } from 'vitest';

import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { getImage, putJson, remove, uploadImage } from '../support/image-steps.js';
import { PartyScenario } from './support/party-scenario.js';

// Logo de las empresas en Terceros (B22A): permiso denegado, aislamiento entre empresas y
// auditoría, como pide el capítulo 21.

const scenario = new PartyScenario('logo de terceros');

function logoPath(partyId: string): string {
  return `/v1/parties/${partyId}/logo`;
}

describe('logo de una empresa', () => {
  it('comercial sube, ve y quita el logo, y cada cambio queda auditado', async () => {
    const sales = await scenario.sales();
    const id = await scenario.party(sales);
    const fileId = await uploadImage(scenario, sales, `${logoPath(id)}/uploads`);
    const set = await putJson(scenario, logoPath(id), sales.session, { file_id: fileId });
    expect(set.status, set.text).toBe(204);
    expect((await scenario.detail(sales, id)).has_logo).toBe(true);
    const image = await getImage(scenario, logoPath(id), sales.session);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect((await remove(scenario, logoPath(id), sales.session)).status).toBe(204);
    expect((await scenario.detail(sales, id)).has_logo).toBe(false);
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual(
      expect.arrayContaining(['party.logo_update:success', 'party.logo_remove:success']),
    );
  });

  it('una persona no lleva logo', async () => {
    const sales = await scenario.sales();
    const id = await scenario.party(sales, await scenario.personWithConsent());
    const body = { file_name: 'Logo.png', mime_type: 'image/png', size_bytes: 100 };
    const response = await scenario.post(`${logoPath(id)}/uploads`, sales.session, body);
    expect(errorCode(response)).toBe('IMAGE_NOT_ALLOWED');
  });
});

describe('logo: permiso denegado', () => {
  it('el contador ve el logo pero no lo cambia; un colaborador no lo ve', async () => {
    const sales = await scenario.sales();
    const id = await scenario.party(sales);
    const fileId = await uploadImage(scenario, sales, `${logoPath(id)}/uploads`);
    await putJson(scenario, logoPath(id), sales.session, { file_id: fileId });
    const accountant = await scenario.person('contador', ['CONTADOR']);
    expect((await getImage(scenario, logoPath(id), accountant.session)).status).toBe(200);
    const writes = [
      putJson(scenario, logoPath(id), accountant.session, { file_id: fileId }),
      remove(scenario, logoPath(id), accountant.session),
    ];
    for (const response of await Promise.all(writes)) {
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
    const worker = await scenario.person('colaborador', ['COLABORADOR']);
    expect(errorCode(await scenario.get(logoPath(id), worker.session))).toBe('PERMISSION_DENIED');
  });
});

describe('logo: aislamiento entre empresas', () => {
  it('otra empresa no ve el logo ni usa sus imágenes', async () => {
    const sales = await scenario.sales();
    const id = await scenario.party(sales);
    const fileId = await uploadImage(scenario, sales, `${logoPath(id)}/uploads`);
    await putJson(scenario, logoPath(id), sales.session, { file_id: fileId });
    const otherSales = await scenario.sales(scenario.otherTenant.id);
    expect(errorCode(await scenario.get(logoPath(id), otherSales.session))).toBe('PARTY_NOT_FOUND');
    const ownId = await scenario.party(otherSales);
    const borrowed = await putJson(scenario, logoPath(ownId), otherSales.session, {
      file_id: fileId,
    });
    expect(errorCode(borrowed)).toBe('IMAGE_INVALID');
  });

  it('solo se usa una imagen propia como logo', async () => {
    const sales = await scenario.sales();
    const colleague = await scenario.sales();
    const id = await scenario.party(sales);
    const fileId = await uploadImage(scenario, colleague, `${logoPath(id)}/uploads`);
    const response = await putJson(scenario, logoPath(id), sales.session, { file_id: fileId });
    expect(errorCode(response)).toBe('IMAGE_INVALID');
  });
});
