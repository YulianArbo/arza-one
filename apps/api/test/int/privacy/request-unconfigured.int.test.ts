import { expect, it } from 'vitest';

import { PARTY_DIRECTORY, type PartyDirectory } from '../../../src/modules/privacy/index.js';
import { PublicRequestsUseCase } from '../../../src/modules/privacy/application/request-public.js';
import { CONFIG } from '../../../src/platform/config/config.module.js';
import type { Env } from '../../../src/platform/config/env-schema.js';
import { DatabaseService } from '../../../src/platform/database/database.service.js';
import { RequestScenario } from './support/request-scenario.js';

// El formulario público de derechos del titular sin empresa del sitio configurada
// (PUBLIC_SITE_TAX_ID vacío o con un NIT que no existe): responde que no está disponible y no
// guarda nada; la consulta de estado tampoco. Datos ficticios.

const scenario = new RequestScenario('privacidad sitio sin configurar');
const META = { ip: '10.0.0.1', userAgent: 'Navegador de prueba', correlationId: null };

function useCase(taxId: string | undefined): PublicRequestsUseCase {
  const config: Env = { ...scenario.app.get<Env>(CONFIG), PUBLIC_SITE_TAX_ID: taxId };
  return new PublicRequestsUseCase(
    scenario.app.get(DatabaseService),
    scenario.clock,
    config,
    scenario.app.get<PartyDirectory>(PARTY_DIRECTORY),
  );
}

it('sin empresa del sitio, no se reciben solicitudes ni se consulta su estado', async () => {
  const before = await scenario.inTenant((tx) => tx.privacyRequest.count());
  for (const taxId of [undefined, '999999999-9']) {
    const requests = useCase(taxId);
    const body = scenario.publicBody();
    await expect(
      requests.filePublic(
        {
          right: 'know',
          name: String(body['name']),
          document_number: String(body['document_number']),
          email: String(body['email']),
          phone: null,
          description: String(body['description']),
          accepts_privacy: true,
          website: '',
        },
        META,
      ),
    ).rejects.toThrow(/no podemos recibir solicitudes/u);
    await expect(
      requests.publicStatus({ code: 'PRV-2026-0001', email: 'nadie@ejemplo.test' }, META),
    ).rejects.toThrow(/no podemos recibir solicitudes/u);
  }
  expect(await scenario.inTenant((tx) => tx.privacyRequest.count())).toBe(before);
});
