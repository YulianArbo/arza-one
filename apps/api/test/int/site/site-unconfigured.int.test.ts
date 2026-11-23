import { expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

import { SiteForms } from '../../../src/modules/web/application/site-forms.js';
import { SitePublic } from '../../../src/modules/web/application/site-public.js';
import { Submissions } from '../../../src/modules/web/application/submissions.js';
import { apiDatabase } from '../support/integration-database.js';
import { SiteScenario } from './support/site-scenario.js';

// El sitio sin empresa configurada (PUBLIC_SITE_TAX_ID vacío o con un NIT que no existe) y una
// empresa sin textos publicados: los formularios dicen que no están disponibles y los textos que
// no se han publicado. Nada se guarda. Datos ficticios.

const scenario = new SiteScenario('sitio sin configurar');
const META = { ip: '10.0.0.1', userAgent: 'Navegador de prueba', correlationId: null };

function site(taxId: string | undefined) {
  const config = { PUBLIC_SITE_TAX_ID: taxId };
  return {
    forms: new SiteForms(apiDatabase(), scenario.clock, config),
    pages: new SitePublic(apiDatabase(), scenario.clock, config),
    links: new Submissions(apiDatabase(), scenario.clock, config),
  };
}

const VISITOR = {
  first_name: 'Visitante',
  last_name: 'Sin Sitio',
  email: 'sin.sitio@ejemplo.test',
  phone: null,
  company: null,
  notice_id: '01900000-0000-7000-8000-000000000001',
  accept_privacy: true as const,
  nickname: '',
};

it('sin empresa del sitio, los formularios no están disponibles y no hay páginas', async () => {
  for (const taxId of [undefined, '999999999-9']) {
    const { forms, pages, links } = site(taxId);
    expect(await forms.info()).toEqual({ available: false, notice: null });
    await expect(
      forms.contact({ ...VISITOR, message: 'Mensaje de prueba.' }, META),
    ).rejects.toThrow(/no está disponible/u);
    expect(await pages.pages()).toEqual({ data: [] });
    await expect(pages.legalText('site_terms')).rejects.toThrow(/no se ha publicado/u);
    const consent = { visitor_id: uuidv7(), policy_version: 1, choice: { preferences: false } };
    await expect(pages.cookieConsent(consent, META)).rejects.toThrow(/no está disponible/u);
    await expect(links.unsubscribe({ token: 'x'.repeat(43) }, META)).rejects.toThrow(
      /no es válido/u,
    );
  }
});

it('una empresa sin aviso ni política publicados no recibe formularios', async () => {
  const { forms, pages } = site(scenario.otherTenant.taxId);
  expect(await forms.info()).toEqual({ available: false, notice: null });
  const quote = {
    ...VISITOR,
    service: 'saas' as const,
    timeframe: 'later' as const,
    description: 'Un producto por suscripción de prueba.',
  };
  await expect(forms.quote(quote, META)).rejects.toThrow(/no está disponible/u);
  await expect(pages.privacyPolicy()).rejects.toThrow(/no se ha publicado/u);
  const count = await apiDatabase().withTenant(
    { tenantId: scenario.otherTenant.id, userId: null },
    (tx) => tx.webFormSubmission.count(),
  );
  expect(count).toBe(0);
});
