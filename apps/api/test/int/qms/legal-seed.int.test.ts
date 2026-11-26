import { expect, it } from 'vitest';

import { seedLegalDemo } from '../../../src/modules/qms/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';

// Normograma de ejemplo de las empresas ficticias (B46, decisión 6): 14 requisitos del capítulo 20,
// con su auditoría, sin duplicarse si la semilla se repite.

const scenario = new AccessScenario('normograma semilla');

it('carga los requisitos de ejemplo una sola vez, con su auditoría', async () => {
  const tenantId = scenario.tenant.id;
  await seedLegalDemo(apiDatabase(), [tenantId], scenario.clock);
  await seedLegalDemo(apiDatabase(), [tenantId], scenario.clock);
  const [rows, audited] = await scenario.inTenant((tx) =>
    Promise.all([
      tx.qmsLegalRequirement.findMany({ orderBy: { code: 'asc' } }),
      tx.auditEvent.count({ where: { action: 'qms.legal_requirement.create' } }),
    ]),
  );
  expect(rows).toHaveLength(14);
  expect(rows[0]).toMatchObject({ code: 'NRM-001', norm: 'Ley 1581 de 2012', applies: true });
  expect(audited).toBe(14);
});
