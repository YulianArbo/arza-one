import { nitCheckDigit } from '@arza/contracts';

import type { Clock } from '../../../platform/clock/clock.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { grantConsent, publishedAuthorizationNotices } from '../../privacy/index.js';

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

/** El texto de autorización de contactos publicado (privacidad lo publica en la semilla ficticia). */
async function contactNotice(tx: TenantTransaction): Promise<string> {
  const notices = await publishedAuthorizationNotices(tx);
  const notice = notices.find((candidate) => candidate.key === 'authorization_contact');
  if (notice === undefined) throw new Error('Falta publicar la autorización de contactos.');
  return notice.id;
}

/** Cada persona es el contacto principal y firmante de una organización, con su autorización. */
async function createPeople(
  tx: TenantTransaction,
  tenantId: string,
  organizations: string[],
  at: Date,
) {
  const noticeId = await contactNotice(tx);
  const actor = { tenantId, userId: null, principal: null, meta: null, at };
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
      },
    });
    const grant = {
      notice_id: noticeId,
      accepted: true as const,
      purposes: ['COMMERCIAL'],
      channel: 'written' as const,
      granted_on: '2026-01-15',
      evidence_file_id: null,
    };
    await grantConsent(tx, actor, { partyId: person.id, grant, source: 'party_create' });
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
      const organizations = await createOrganizations(tx, tenantId, clock.now());
      await createPeople(tx, tenantId, organizations, clock.now());
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
