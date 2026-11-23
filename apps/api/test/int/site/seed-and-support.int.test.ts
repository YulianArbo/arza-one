import { expect, it } from 'vitest';

import { seedSiteDemo, seedSiteTexts } from '../../../src/modules/web/index.js';
import { truncatedIp } from '../../../src/modules/web/application/web-support.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { apiDatabase } from '../support/integration-database.js';
import { SiteScenario } from './support/site-scenario.js';

// Semilla del sitio (B41, decisión 11) y la IP truncada de la elección de cookies (numeral 20.4).
// Datos ficticios.

const scenario = new SiteScenario('sitio semilla');

it('cada empresa nace con borradores provisionales; la de demostración los publica', async () => {
  const tenants = [scenario.otherTenant.id];
  await scenario.person('direccion-semilla', ['DIRECCION'], { tenantId: scenario.otherTenant.id });
  await seedSiteTexts(apiDatabase(), tenants, systemClock);
  await seedSiteTexts(apiDatabase(), tenants, systemClock);
  await seedSiteDemo(apiDatabase(), tenants, systemClock);
  await seedSiteDemo(apiDatabase(), tenants, systemClock);
  const rows = await apiDatabase().withTenant(
    { tenantId: scenario.otherTenant.id, userId: null },
    (tx) => tx.webLegalText.findMany({ orderBy: { key: 'asc' } }),
  );
  expect(rows).toHaveLength(6);
  expect(rows.every((row) => row.body.startsWith('PENDIENTE DE CONCEPTO JURÍDICO.'))).toBe(true);
  const status = Object.fromEntries(rows.map((row) => [row.key, row.status]));
  expect(status).toMatchObject({ platform_terms: 'draft', site_terms: 'published' });
  expect(rows.filter((row) => row.status === 'published').every((row) => row.approvedBy)).toBe(
    true,
  );
  const pages = await apiDatabase().withTenant(
    { tenantId: scenario.otherTenant.id, userId: null },
    (tx) => tx.webPage.findMany({ where: { slug: 'nosotros' } }),
  );
  expect(pages).toHaveLength(1);
  expect(pages[0]?.status).toBe('published');
});

it('sin una persona de la Dirección, la demostración deja los textos en borrador', async () => {
  const tenants = [scenario.tenant.id];
  await seedSiteTexts(apiDatabase(), tenants, systemClock);
  await seedSiteDemo(apiDatabase(), tenants, systemClock);
  const published = await scenario.inTenant((tx) =>
    tx.webLegalText.count({ where: { status: 'published', body: { startsWith: 'PENDIENTE' } } }),
  );
  expect(published).toBe(0);
});

it('la IP de la elección de cookies se guarda truncada', () => {
  expect(truncatedIp('190.24.8.77')).toBe('190.24.8.0');
  expect(truncatedIp('::ffff:10.0.0.9')).toBe('10.0.0.0');
  expect(truncatedIp('2800:484:abcd:1:2:3:4:5')).toBe('2800:484:abcd::');
  expect(truncatedIp(null)).toBeNull();
  expect(truncatedIp('')).toBeNull();
  expect(truncatedIp('desconocida')).toBeNull();
});
