import { nitCheckDigit } from '@arza/contracts';

import type { Clock } from '../../../platform/clock/clock.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate } from '../../core/index.js';

// Terceros ficticios para probar el módulo en local (`pnpm db:seed:demo`, nunca en producción).
// Incluye a propósito dos fichas de la misma organización escritas distinto, para ensayar la
// detección y la fusión de duplicados.

const ORGANIZATIONS = [
  ['Comercializadora Andina S.A.S.', '900555101', 'compras@andina.example', ['customer']],
  ['COMERCIALIZADORA ANDINA SAS', '900555102', 'compras@andina.example', ['customer']],
  ['Papelería El Cóndor Ltda.', '800555103', 'ventas@condor.example', ['supplier']],
] as const;

const PEOPLE = [
  ['Laura', 'Gómez Ríos', '1020555001', 'laura.gomez@andina.example'],
  ['Andrés', 'Pérez Mora', '1020555002', 'andres.perez@condor.example'],
] as const;

async function createOrganizations(tx: TenantTransaction, tenantId: string, today: Date) {
  const ids: string[] = [];
  for (const [legalName, idNumber, email, roles] of ORGANIZATIONS) {
    const party = await tx.party.create({
      data: {
        tenantId,
        kind: 'organization',
        legalName,
        idType: 'NIT',
        idNumber,
        checkDigit: nitCheckDigit(idNumber),
        email,
        city: 'Medellín',
      },
    });
    await tx.partyRole.createMany({
      data: roles.map((role) => ({ tenantId, partyId: party.id, role, since: today })),
    });
    ids.push(party.id);
  }
  return ids;
}

/** Cada persona es el contacto principal y firmante de una organización. */
async function createPeople(tx: TenantTransaction, tenantId: string, organizations: string[]) {
  for (const [index, [firstName, lastName, idNumber, email]] of PEOPLE.entries()) {
    const person = await tx.party.create({
      data: {
        tenantId,
        kind: 'person',
        firstName,
        lastName,
        idType: 'CC',
        idNumber,
        email,
        dataPurpose: 'COMMERCIAL',
        dataAuthorization: 'written',
        dataAuthorizedOn: fromCalendarDate('2026-01-15'),
      },
    });
    const organizationId = organizations[index === 0 ? 0 : 2] ?? '';
    await tx.contact.create({
      data: { tenantId, organizationId, personId: person.id, isPrimary: true, canSign: true },
    });
  }
}

/** Carga los terceros de demostración en las empresas que todavía no tienen ninguno. */
export async function seedPartyDemo(
  database: DatabaseService,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      if ((await tx.party.count()) > 0) return;
      await createPeople(tx, tenantId, await createOrganizations(tx, tenantId, clock.now()));
      await recordAuditEvent(tx, {
        tenantId,
        occurredAt: clock.now(),
        actor: { kind: 'system' },
        action: 'party.demo.seed',
        entityType: 'party_seed',
        entityId: null,
        result: 'success',
        changes: { organizations: ORGANIZATIONS.length, people: PEOPLE.length },
        meta: null,
      });
    });
  }
}
