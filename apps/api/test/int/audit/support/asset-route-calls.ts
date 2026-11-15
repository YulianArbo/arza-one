import { seedDocForms } from '../../../../src/modules/doc/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { createdId, keyed, putVersioned, versioned } from '../../fin/support/ledger-steps.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { consentFor, personBody } from '../../party/support/party-scenario.js';
import { del } from '../../purchase/support/purchase-steps.js';
import { apiDatabase } from '../../support/integration-database.js';
import { day } from './contract-steps.js';
import type { RouteCall } from './project-route-calls.js';

// Llamadas del recorrido de escrituras (B11) para Activos (B34). Cada una prepara por la API lo que
// necesita; la llamada final es la que se revisa. La asignación vigente se deja lista en la base
// (la firma del comodato tiene su propia prueba en test/int/asset). Datos ficticios.

const ASSETS = '/v1/assets';
const ASSIGNMENTS = '/v1/asset-assignments';
const MAINTENANCE = '/v1/asset-maintenance';

let label = 0;

function manager(s: AccessScenario): Promise<Person> {
  label += 1;
  return s.person(`activos-recorrido-${String(label)}`, ['ADMIN_FINANCIERO']);
}

function assetBody(s: AccessScenario, name = 'Portátil del recorrido'): object {
  return {
    name,
    category: 'computer',
    serial: null,
    purchase_date: day(s, -200),
    cost: '2400000.00',
    useful_life_months: 24,
    location: null,
  };
}

async function asset(s: AccessScenario): Promise<{ manager: Person; id: string }> {
  const person = await manager(s);
  return { manager: person, id: await createdId(keyed(s, person, ASSETS, assetBody(s))) };
}

/** Colaborador vinculado con su persona en Terceros, como lo exige firmar el comodato. */
async function borrower(s: AccessScenario): Promise<Person> {
  const sales = await s.person(`comercial-activos-${String(label)}`, ['COMERCIAL']);
  const person = await s.person(`recibe-activos-${String(label)}`, ['COLABORADOR']);
  const body = { ...personBody(), consent: await consentFor(s) };
  const partyId = await createdId(s.post('/v1/parties', sales.session, body));
  await s.inTenant((tx) => tx.user.update({ where: { id: person.id }, data: { partyId } }));
  return person;
}

/** Asignación recién creada (versión 2: ya tiene su registro CT-ADM-001), aún sin firma. */
async function assignment(s: AccessScenario): Promise<{ manager: Person; id: string }> {
  await seedDocForms(apiDatabase(), [s.tenant.id], systemClock);
  const target = await asset(s);
  const holder = await borrower(s);
  const body = { user_id: holder.id, assigned_on: day(s, 0), message: null };
  const path = `${ASSETS}/${target.id}/assignments`;
  return { manager: target.manager, id: await createdId(keyed(s, target.manager, path, body)) };
}

/** Asignación vigente: se deja firmada en la base, sin pasar por el proceso de firma. */
async function activeAssignment(
  s: AccessScenario,
): Promise<{ manager: Person; id: string; version: number }> {
  const open = await assignment(s);
  const row = await s.inTenant(async (tx) => {
    const updated = await tx.astAssignment.update({
      where: { id: open.id },
      data: {
        status: 'active',
        envelopeId: crypto.randomUUID(),
        contractDocumentId: crypto.randomUUID(),
        activatedAt: new Date(),
      },
    });
    await tx.astAsset.update({ where: { id: updated.assetId }, data: { status: 'assigned' } });
    return updated;
  });
  return { ...open, version: row.version };
}

async function scheduled(s: AccessScenario): Promise<{ manager: Person; id: string }> {
  const target = await asset(s);
  const body = { kind: 'preventive', scheduled_on: day(s, 7), note: null };
  const path = `${ASSETS}/${target.id}/maintenance`;
  return { manager: target.manager, id: await createdId(keyed(s, target.manager, path, body)) };
}

const INVENTORY_CALLS: Record<string, RouteCall> = {
  'POST /v1/assets': async (s) => ({ test: keyed(s, await manager(s), ASSETS, assetBody(s)) }),
  'PUT /v1/assets/{id}': async (s) => {
    const target = await asset(s);
    const body = assetBody(s, 'Portátil renombrado');
    return { test: putVersioned(s, `${ASSETS}/${target.id}`, target.manager, body, 1) };
  },
  'POST /v1/assets/{id}/retirement': async (s) => {
    const target = await asset(s);
    const body = { retired_on: day(s, 0), reason: 'damage', note: 'Baja del recorrido' };
    const call = s.post(`${ASSETS}/${target.id}/retirement`, target.manager.session, body);
    return { test: versioned(call, 1) };
  },
  'POST /v1/assets/book/export': async (s) => {
    const target = await asset(s);
    return { test: s.post(`${ASSETS}/book/export`, target.manager.session, {}) };
  },
};

const ASSIGNMENT_CALLS: Record<string, RouteCall> = {
  'POST /v1/assets/{id}/assignments': async (s) => {
    await seedDocForms(apiDatabase(), [s.tenant.id], systemClock);
    const target = await asset(s);
    const holder = await borrower(s);
    const body = { user_id: holder.id, assigned_on: day(s, 0), message: null };
    return { test: keyed(s, target.manager, `${ASSETS}/${target.id}/assignments`, body) };
  },
  'POST /v1/asset-assignments/{id}/cancellation': async (s) => {
    const open = await assignment(s);
    const body = { reason: 'Anulación del recorrido de auditoría' };
    const call = s.post(`${ASSIGNMENTS}/${open.id}/cancellation`, open.manager.session, body);
    return { test: versioned(call, 2) };
  },
  'POST /v1/asset-assignments/{id}/return': async (s) => {
    const open = await activeAssignment(s);
    const body = { returned_on: day(s, 0), note: 'Devolución del recorrido' };
    const call = s.post(`${ASSIGNMENTS}/${open.id}/return`, open.manager.session, body);
    return { test: versioned(call, open.version) };
  },
};

const MAINTENANCE_CALLS: Record<string, RouteCall> = {
  'POST /v1/assets/{id}/maintenance': async (s) => {
    const target = await asset(s);
    const body = { kind: 'corrective', scheduled_on: day(s, 3), note: 'Revisión del recorrido' };
    return { test: keyed(s, target.manager, `${ASSETS}/${target.id}/maintenance`, body) };
  },
  'POST /v1/asset-maintenance/{id}/completion': async (s) => {
    const row = await scheduled(s);
    const body = { done_on: day(s, 0), cost: '50000.00', note: null };
    const call = s.post(`${MAINTENANCE}/${row.id}/completion`, row.manager.session, body);
    return { test: versioned(call, 1) };
  },
  'DELETE /v1/asset-maintenance/{id}': async (s) => {
    const row = await scheduled(s);
    return { test: del(s, `${MAINTENANCE}/${row.id}`, row.manager) };
  },
};

export const ASSET_ROUTE_CALLS: Record<string, RouteCall> = {
  ...INVENTORY_CALLS,
  ...ASSIGNMENT_CALLS,
  ...MAINTENANCE_CALLS,
};
