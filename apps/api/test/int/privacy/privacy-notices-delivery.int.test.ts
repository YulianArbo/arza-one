import { describe, expect, it } from 'vitest';

import { publishTenantEvents } from '../../../src/modules/ntf/application/publisher.js';
import { seedNotificationTemplates } from '../../../src/modules/ntf/index.js';
import { runPrivacyDailyIn } from '../../../src/modules/privacy/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';
import { RequestScenario } from './support/request-scenario.js';

// Avisos al Oficial de Protección de Datos de punta a punta (B42, decisión 11): cuando llega una
// solicitud por el sitio y cuando está por vencer, el evento se publica y el Oficial recibe su aviso
// con el código y la fecha límite, sin datos del titular. Datos ficticios.

const scenario = new RequestScenario('privacidad avisos al oficial');
const DAY = 86_400_000;

async function publish(): Promise<void> {
  await seedNotificationTemplates(apiDatabase(), [scenario.tenant.id], scenario.clock);
  await publishTenantEvents(
    { database: apiDatabase(), clock: scenario.clock },
    scenario.tenant.id,
    scenario.clock.now(),
  );
}

async function noticesOf(person: Person, kind: string) {
  return scenario.inTenant((tx) =>
    tx.notification.findMany({ where: { userId: person.id, kind } }),
  );
}

describe('avisos al Oficial', () => {
  it('le avisa que llegó una solicitud por el sitio, con su código', async () => {
    const dpo = await scenario.officer();
    const filed = await scenario.filePublic();
    await publish();
    const [notice] = (await noticesOf(dpo, 'prv_request_received')).filter((item) =>
      JSON.stringify(item).includes(filed.code),
    );
    expect(notice?.link).toMatch(/^\/app\/privacidad\/solicitudes\//u);
    expect(JSON.stringify(notice)).not.toContain(filed.email);
  });
});

describe('avisos al Oficial', () => {
  it('le avisa que la solicitud está por vencer', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.fileInternal(dpo);
    const request = await scenario.privacyRequest(dpo, id);
    const due = new Date(`${request.due_on ?? ''}T12:00:00Z`).getTime();
    const dueIn = Math.round((due - scenario.clock.now().getTime()) / DAY);
    const at = new Date(scenario.clock.now().getTime() + (dueIn - 1) * DAY);
    await runPrivacyDailyIn(
      { database: apiDatabase(), clock: { now: () => at } },
      scenario.tenant.id,
    );
    await publish();
    const notices = await noticesOf(dpo, 'prv_request_due');
    expect(notices.some((item) => item.link === `/app/privacidad/solicitudes/${id}`)).toBe(true);
  });
});
