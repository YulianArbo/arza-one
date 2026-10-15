import { Inject, Injectable } from '@nestjs/common';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { contactMergePlan, mergeProblem, roleMergePlan } from '../domain/merge.js';
import { mergeInvalid } from './party-messages.js';
import { ALL_PARTIES, auditParty, findParty, lockParty, partyName } from './party-support.js';

// Fusión de duplicados (ficha 17.3): todo lo del duplicado pasa al tercero que se conserva y el
// duplicado queda marcado como fusionado, sin borrarse. La línea de tiempo del que se conserva
// muestra también el historial del duplicado.

async function moveRoles(tx: TenantTransaction, survivorId: string, duplicateId: string, at: Date) {
  const rolesOf = (partyId: string) =>
    tx.partyRole.findMany({ where: { partyId, deletedAt: null } });
  const plan = roleMergePlan(await rolesOf(survivorId), await rolesOf(duplicateId));
  await tx.partyRole.updateMany({
    where: { id: { in: plan.move } },
    data: { partyId: survivorId },
  });
  await tx.partyRole.updateMany({
    where: { id: { in: plan.retire } },
    data: { status: 'ended', deletedAt: at },
  });
  await tx.partyRole.updateMany({
    where: { id: { in: plan.reactivate } },
    data: { status: 'active' },
  });
  return plan.move.length;
}

async function moveContacts(
  tx: TenantTransaction,
  survivorId: string,
  duplicateId: string,
  at: Date,
) {
  const sides = [survivorId, duplicateId];
  const contacts = await tx.contact.findMany({
    where: {
      deletedAt: null,
      OR: [{ organizationId: { in: sides } }, { personId: { in: sides } }],
    },
  });
  const plan = contactMergePlan(survivorId, duplicateId, contacts);
  await tx.contact.updateMany({
    where: { id: { in: plan.retire } },
    data: { deletedAt: at, isPrimary: false },
  });
  for (const row of contacts.filter((contact) => plan.move.includes(contact.id))) {
    await tx.contact.update({
      where: { id: row.id },
      data: {
        organizationId: row.organizationId === duplicateId ? survivorId : row.organizationId,
        personId: row.personId === duplicateId ? survivorId : row.personId,
        // El principal de la organización que se conserva sigue siendo el principal.
        isPrimary: row.organizationId === duplicateId ? false : row.isPrimary,
      },
    });
  }
  return plan.move.length;
}

/** Pasa todo lo del duplicado al que se conserva y marca el duplicado como fusionado. */
async function moveAll(tx: TenantTransaction, survivorId: string, duplicateId: string, at: Date) {
  const moved = {
    roles: await moveRoles(tx, survivorId, duplicateId, at),
    contacts: await moveContacts(tx, survivorId, duplicateId, at),
    bank_accounts: (
      await tx.bankAccount.updateMany({
        where: { partyId: duplicateId },
        data: { partyId: survivorId },
      })
    ).count,
    due_diligence: (
      await tx.dueDiligence.updateMany({
        where: { partyId: duplicateId },
        data: { partyId: survivorId },
      })
    ).count,
  };
  // Los que ya se habían fusionado en el duplicado pasan a apuntar al que se conserva.
  await tx.party.updateMany({
    where: { mergedIntoId: duplicateId },
    data: { mergedIntoId: survivorId },
  });
  await tx.party.update({
    where: { id: duplicateId },
    data: { mergedIntoId: survivorId, deletedAt: at },
  });
  return moved;
}

@Injectable()
export class MergeUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async merge(
    principal: Principal,
    survivorId: string,
    duplicateId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const survivor = await findParty(tx, ALL_PARTIES, survivorId);
      const duplicate = await findParty(tx, ALL_PARTIES, duplicateId);
      const problem = mergeProblem(survivor, duplicate);
      if (problem !== null) throw mergeInvalid(problem);
      // Siempre en el mismo orden, para que dos fusiones cruzadas no se bloqueen entre sí.
      for (const id of [survivorId, duplicateId].sort()) await lockParty(tx, id);
      const moved = await moveAll(tx, survivorId, duplicateId, at);
      await auditParty(
        tx,
        { principal, meta, at },
        {
          action: 'party.merge',
          entityType: 'party',
          entityId: survivorId,
          changes: { duplicate_id: duplicateId, duplicate_name: partyName(duplicate), moved },
        },
      );
      // Los módulos que guardan party_id (usuarios, y más adelante CRM y finanzas) reasignan.
      await addOutboxEvent(tx, {
        tenantId: principal.tenantId,
        eventType: 'party.merged',
        actorId: principal.userId,
        occurredAt: at,
        payload: { survivor_id: survivorId, duplicate_id: duplicateId },
      });
    });
  }
}
