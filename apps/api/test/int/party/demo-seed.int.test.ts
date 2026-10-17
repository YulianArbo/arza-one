import { partySearchResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { seedPartyDemo } from '../../../src/modules/party/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { apiDatabase } from '../support/integration-database.js';
import { PartyScenario, contactNoticeId } from './support/party-scenario.js';

// Terceros ficticios de `pnpm db:seed:demo` (B13): se cargan una sola vez y traen un duplicado
// para ensayar la fusión. Las personas llegan con su autorización (B17).

const scenario = new PartyScenario('terceros demo');

describe('terceros de demostración', () => {
  it('se cargan una vez y la búsqueda encuentra el duplicado sembrado', async () => {
    const noticeId = await contactNoticeId(scenario);
    await seedPartyDemo(apiDatabase(), [scenario.tenant.id], systemClock);
    await seedPartyDemo(apiDatabase(), [scenario.tenant.id], systemClock);
    expect(await scenario.inTenant((tx) => tx.party.count())).toBe(5);
    const consents = await scenario.inTenant((tx) => tx.privacyConsent.findMany());
    expect(consents.map((row) => [row.noticeId, row.source])).toEqual([
      [noticeId, 'party_create'],
      [noticeId, 'party_create'],
    ]);
    const sales = await scenario.sales();
    const query = new URLSearchParams({
      name: 'Comercializadora Andina',
      email: 'compras@andina.example',
    });
    const response = await scenario.get(`/v1/parties/search?${query.toString()}`, sales.session);
    const found = partySearchResponseSchema.parse(response.body).data;
    expect(found.map((row) => row.reasons)).toEqual([
      ['email', 'name'],
      ['email', 'name'],
    ]);
  });
});
