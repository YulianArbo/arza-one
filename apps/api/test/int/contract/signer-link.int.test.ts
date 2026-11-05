import { describe, expect, it } from 'vitest';

import { linkCompanySigner } from '../../../src/modules/contract/index.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import { SignatureScenario } from './support/signature-scenario.js';

// `pnpm contratos:vincular-firmante` (B25, decisión 3): la cuenta de la Dirección queda vinculada con
// su persona en Terceros, que tiene su documento; desde ahí puede firmar por la empresa.

const scenario = new SignatureScenario('firma vincular');

describe('vincular a quien firma por la empresa', () => {
  it('vincula la cuenta con la persona de su misma empresa, y lo deja en la auditoría', async () => {
    const sales = await scenario.sales();
    const director = await scenario.director();
    const idNumber = String(Date.now()).slice(-10);
    const body = await scenario.personWithConsent({ first_name: 'Directora', id_number: idNumber });
    const personId = await scenario.party(sales, body);
    const input = { email: director.email, idNumber };
    expect(await linkCompanySigner(apiDatabase(), scenario.clock, input)).toBe('linked');
    const user = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.user.findFirstOrThrow({ where: { id: director.id } }));
    expect(user.partyId).toBe(personId);
    expect(await scenario.auditActions(director.id)).toContain('iam.user.person_link');
  });

  it('no vincula sin cuenta, sin persona o con una persona de otra empresa', async () => {
    const director = await scenario.director();
    const outsider = await scenario.person('comercial-otra', ['COMERCIAL'], {
      tenantId: scenario.otherTenant.id,
    });
    const idNumber = String(Date.now() + 7).slice(-10);
    const body = await scenario.personWithConsent({ id_number: idNumber }, scenario.otherTenant.id);
    await scenario.party(outsider, body);
    const database = apiDatabase();
    const missing = { email: 'nadie@demo.test', idNumber };
    expect(await linkCompanySigner(database, scenario.clock, missing)).toBe('no_account');
    const foreign = { email: director.email, idNumber };
    expect(await linkCompanySigner(database, scenario.clock, foreign)).toBe('no_person');
  });
});
