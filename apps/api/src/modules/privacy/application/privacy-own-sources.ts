import { PRIVACY_REQUEST_STATUSES, PRIVACY_RIGHTS, type PersonalDataRecord } from '@arza/contracts';

import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { accountsOfParty, anonymizePortalAccount } from '../../iam/index.js';
import {
  outcomeFor,
  shownDate,
  shownDateTime,
  type ErasureActor,
  type ErasureOutcome,
  type PersonalDataHolder,
  type PersonalDataSource,
} from './personal-data-sources.js';
import { auditPrivacy } from './privacy-support.js';
import { accountActive } from './request-messages.js';

// Lo que Privacidad misma guarda del titular (B42, decisión 8): sus autorizaciones y sus
// solicitudes se conservan como prueba; al suprimir, las autorizaciones vigentes quedan revocadas.
// Sus cuentas: la del portal inactiva se vuelve anónima; una activa impide suprimir.

const CHANNELS: Readonly<Record<string, string>> = {
  written: 'Documento firmado',
  digital: 'Formulario o correo',
  verbal: 'Verbal con constancia',
  contract: 'Cláusula del contrato',
};

function label(map: Readonly<Record<string, string>>, key: string): string {
  return map[key] ?? key;
}

const consentsSource: PersonalDataSource = {
  key: 'a-consents',
  title: 'Autorizaciones de tratamiento',
  async collect(tx, holder) {
    const rows = await tx.privacyConsent.findMany({
      where: { partyId: holder.partyId, deletedAt: null },
      include: { notice: true },
      orderBy: { grantedOn: 'asc' },
    });
    return rows.map((row) => ({
      title: `${row.notice.title} (versión ${String(row.notice.versionNumber)})`,
      fields: [
        { label: 'Finalidades', value: row.purposes.join(', ') },
        { label: 'Cómo se obtuvo', value: label(CHANNELS, row.channel) },
        { label: 'Fecha', value: shownDate(row.grantedOn) },
        {
          label: 'Estado',
          value:
            row.revokedAt === null
              ? 'Vigente'
              : `Revocada el ${shownDateTime(row.revokedAt) ?? ''}`,
        },
      ],
    }));
  },
  async erase(tx, holder, actor) {
    const active = await tx.privacyConsent.findMany({
      where: { partyId: holder.partyId, revokedAt: null, deletedAt: null },
    });
    const reason = `Supresión solicitada por el titular (${actor.requestCode}).`;
    for (const consent of active) {
      await tx.privacyConsent.update({
        where: { id: consent.id },
        data: { revokedAt: actor.at, revokedBy: actor.userId, revocationReason: reason },
      });
      await auditPrivacy(
        tx,
        { ...actor, principal: null },
        {
          action: 'privacy.consent.revoke',
          entityType: 'prv_consent',
          entityId: consent.id,
          changes: { party_id: holder.partyId, reason },
        },
      );
    }
    const total = await tx.privacyConsent.count({
      where: { partyId: holder.partyId, deletedAt: null },
    });
    return outcomeFor(
      total,
      'kept',
      'Se conservan como prueba de la autorización (Decreto 1074 de 2015) y quedaron revocadas.',
    );
  },
};

const requestsSource: PersonalDataSource = {
  key: 'b-requests',
  title: 'Solicitudes de protección de datos',
  async collect(tx, holder) {
    const rows = await tx.privacyRequest.findMany({
      where: { partyId: holder.partyId, deletedAt: null },
      orderBy: { receivedAt: 'asc' },
    });
    return rows.map((row) => ({
      title: row.code,
      fields: [
        { label: 'Qué pidió', value: label(PRIVACY_RIGHTS, row.right) },
        { label: 'Recibida', value: shownDateTime(row.receivedAt) },
        { label: 'Estado', value: label(PRIVACY_REQUEST_STATUSES, row.status) },
      ],
    }));
  },
  async erase(tx, holder) {
    const count = await tx.privacyRequest.count({
      where: { partyId: holder.partyId, deletedAt: null },
    });
    return outcomeFor(
      count,
      'kept',
      'Son la prueba de que se atendieron sus derechos (Ley 1581, art. 17).',
    );
  },
};

async function accountRecords(
  tx: TenantTransaction,
  holder: PersonalDataHolder,
): Promise<PersonalDataRecord[]> {
  const accounts = await accountsOfParty(tx, holder.partyId);
  return accounts.map((account) => ({
    title: account.kind === 'portal' ? 'Cuenta del portal del cliente' : 'Cuenta de la plataforma',
    fields: [
      { label: 'Correo de ingreso', value: account.email },
      { label: 'Nombre', value: account.displayName },
      { label: 'Creada', value: shownDateTime(account.createdAt) },
      { label: 'Último ingreso', value: shownDateTime(account.lastLoginAt) },
    ],
  }));
}

/** Una cuenta del portal activa impide suprimir: primero se desactiva (decisión 8). */
export async function assertNoActivePortalAccount(
  tx: TenantTransaction,
  partyId: string,
): Promise<void> {
  const accounts = await accountsOfParty(tx, partyId);
  if (accounts.some((account) => account.kind === 'portal' && account.status !== 'inactive')) {
    throw accountActive();
  }
}

async function eraseAccounts(
  tx: TenantTransaction,
  holder: PersonalDataHolder,
  actor: ErasureActor,
): Promise<ErasureOutcome> {
  const accounts = await accountsOfParty(tx, holder.partyId);
  let erased = 0;
  for (const account of accounts) {
    if (account.kind === 'portal' && (await anonymizePortalAccount(tx, account.userId))) {
      erased += 1;
      await recordAuditEvent(tx, {
        tenantId: actor.tenantId,
        occurredAt: actor.at,
        actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
        action: 'privacy.data.account_erase',
        entityType: 'iam_user',
        entityId: account.userId,
        result: 'success',
        changes: { request_code: actor.requestCode },
        meta: actor.meta,
      });
    }
  }
  if (erased < accounts.length) {
    return outcomeFor(
      accounts.length,
      'kept',
      'Cuenta de colaborador: la historia laboral se conserva.',
    );
  }
  return outcomeFor(erased, 'erased');
}

const accountsSource: PersonalDataSource = {
  key: 'c-accounts',
  title: 'Cuentas de acceso',
  collect: accountRecords,
  erase: eraseAccounts,
};

/** Las fuentes propias de Privacidad, antes que las de los demás módulos. */
export const PRIVACY_OWN_SOURCES: readonly PersonalDataSource[] = [
  consentsSource,
  requestsSource,
  accountsSource,
];
