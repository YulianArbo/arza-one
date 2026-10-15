import { describe, expect, it } from 'vitest';

import { PartyScenario, organizationBody } from './support/party-scenario.js';

// Dos personas registran el mismo documento al mismo tiempo (B13): una lo logra y la otra recibe
// «ya existe», nunca un error inesperado.

const scenario = new PartyScenario('terceros simultaneos');

describe('registro simultáneo', () => {
  it('el mismo documento enviado a la vez crea un solo tercero', async () => {
    const sales = await scenario.sales();
    const body = organizationBody();
    const responses = await Promise.all(
      [1, 2, 3].map(() => scenario.post('/v1/parties', sales.session, body)),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
  });
});
