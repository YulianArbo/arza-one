import { SIGNATURE_RULES } from '@arza/contracts';

import { systemActor } from './contract-support.js';
import { closeEnvelope } from './signature-progress.js';
import { findEnvelope } from './signature-records.js';
import { scopeOf, tenantsBy, type SignatureWorkDependencies } from './signature-work.js';

// Revisión diaria de la firma electrónica en el worker (B25): vence los procesos cuyo plazo pasó
// (el documento vuelve a «aprobado») y, cada tres días y hasta tres veces, le recuerda a quien le
// toca firmar. El recordatorio lleva un enlace nuevo; lo envía la pasada de cada pocos segundos.

export interface SignatureFollowUpResult {
  readonly reminders: number;
  readonly expired: number;
}

const REMINDER_MS = SIGNATURE_RULES.reminderEveryDays * 86_400_000;

/** Un proceso en firma: vence si pasó su plazo; si no, recuerda a quien le toca, cada tres días. */
async function followEnvelope(deps: SignatureWorkDependencies, tenantId: string, id: string) {
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const at = deps.clock.now();
    const envelope = await findEnvelope(tx, id);
    if (envelope.status !== 'sent') return null;
    if (envelope.expiresAt <= at) {
      await closeEnvelope(tx, systemActor(tenantId, at), envelope, {
        status: 'expired',
        reason: 'Venció el plazo para firmar sin que firmaran todos.',
      });
      return 'expired' as const;
    }
    const due = envelope.signers.find(
      (signer) =>
        signer.kind === 'client' &&
        signer.status === 'pending' &&
        signer.mailPending === null &&
        !signer.codeLocked &&
        signer.reminders < SIGNATURE_RULES.maxReminders &&
        signer.lastNotifiedAt !== null &&
        at.getTime() - signer.lastNotifiedAt.getTime() >= REMINDER_MS,
    );
    if (due === undefined) return null;
    await tx.sigSigner.update({ where: { id: due.id }, data: { mailPending: 'reminder' } });
    return 'reminder' as const;
  });
}

/** Revisión diaria de recordatorios y vencimientos de todas las empresas. */
export async function followUpSignatures(
  deps: SignatureWorkDependencies,
): Promise<SignatureFollowUpResult> {
  const totals = { reminders: 0, expired: 0 };
  for (const tenantId of await tenantsBy(deps, 'follow-up')) {
    const open = await deps.database.withTenant(scopeOf(tenantId), (tx) =>
      tx.sigEnvelope.findMany({
        where: { status: 'sent', deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
    );
    for (const { id } of open) {
      const result = await followEnvelope(deps, tenantId, id);
      if (result === 'reminder') totals.reminders += 1;
      if (result === 'expired') totals.expired += 1;
    }
  }
  return totals;
}
