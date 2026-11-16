import {
  consentChannelSchema,
  consentStatusSchema,
  isAuthorizationNotice,
  NOTICE_KINDS,
  noticeKeySchema,
  type ConsentGrant,
  type Notice,
  type PartyConsent,
} from '@arza/contracts';

import type { PrivacyConsent, PrivacyNotice } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import { isGrantDateValid, unofferedPurposes } from '../domain/privacy-rules.js';
import { noticeView } from './notices.js';
import {
  evidenceInvalid,
  grantDateInvalid,
  noticeNotPublished,
  noticeOutdated,
  purposeInvalid,
} from './privacy-messages.js';
import { auditPrivacy, type PrivacyActor } from './privacy-support.js';

// Componente de autorización reutilizable (B17), del lado del servidor. Todo formulario con datos
// personales llama a grantConsent en la misma transacción en que guarda los datos: o se guardan
// los datos con su autorización, o no se guarda nada. Hoy lo usa Terceros; lo usarán también los
// formularios públicos (B41) y los de talento humano.

/** Formulario que tomó la autorización. */
type ConsentSource = 'party_create' | 'party_consent' | 'crm_lead' | 'hr_candidate';

export interface ConsentRequest {
  readonly partyId: string;
  readonly grant: ConsentGrant;
  readonly source: ConsentSource;
}

type ConsentWithNotice = PrivacyConsent & { notice: PrivacyNotice };

export function partyConsentView(row: ConsentWithNotice): PartyConsent {
  const key = noticeKeySchema.parse(row.notice.key);
  return {
    id: row.id,
    notice: {
      id: row.notice.id,
      key,
      label: NOTICE_KINDS[key].label,
      version_number: row.notice.versionNumber,
      title: row.notice.title,
    },
    purposes: row.purposes,
    channel: consentChannelSchema.parse(row.channel),
    granted_on: toCalendarDate(row.grantedOn),
    status: consentStatusSchema.parse(row.revokedAt === null ? 'active' : 'revoked'),
    revoked_at: row.revokedAt === null ? null : row.revokedAt.toISOString(),
  };
}

/**
 * El texto que se mostró sigue vigente. Si se reemplazó mientras la persona llenaba el
 * formulario, ella debe leer el nuevo (409); si nunca se publicó, no hay autorización posible.
 */
async function currentAuthorizationNotice(
  tx: TenantTransaction,
  noticeId: string,
): Promise<PrivacyNotice> {
  const notice = await tx.privacyNotice.findFirst({ where: { id: noticeId, deletedAt: null } });
  const key = notice === null ? null : noticeKeySchema.parse(notice.key);
  if (notice === null || key === null || !isAuthorizationNotice(key)) throw noticeNotPublished();
  if (notice.status === 'replaced') throw noticeOutdated();
  if (notice.status !== 'published') throw noticeNotPublished();
  return notice;
}

async function assertEvidence(tx: TenantTransaction, actor: PrivacyActor, fileId: string | null) {
  if (fileId === null) return;
  const attachable =
    actor.principal !== null && (await isAttachableFile(tx, actor.principal, fileId));
  if (!attachable) throw evidenceInvalid();
}

/** Columnas de la autorización: la versión exacta del texto que la persona leyó. */
function consentColumns(actor: PrivacyActor, request: ConsentRequest, notice: PrivacyNotice) {
  const { grant } = request;
  return {
    tenantId: actor.tenantId,
    partyId: request.partyId,
    noticeId: notice.id,
    purposes: grant.purposes,
    channel: grant.channel,
    grantedOn: fromCalendarDate(grant.granted_on),
    source: request.source,
    ipAddress: request.source === 'hr_candidate' ? null : (actor.meta?.ip ?? null),
    userAgent: request.source === 'hr_candidate' ? null : (actor.meta?.userAgent ?? null),
    evidenceFileId: grant.evidence_file_id,
  };
}

/** Cambios que quedan en la auditoría de la autorización. */
function consentChanges(request: ConsentRequest, notice: PrivacyNotice) {
  const { grant } = request;
  return {
    party_id: request.partyId,
    notice_key: notice.key,
    notice_version: notice.versionNumber,
    purposes: grant.purposes,
    channel: grant.channel,
    granted_on: grant.granted_on,
    source: request.source,
  };
}

/** Registra la autorización con la versión exacta del texto y su evidencia. */
export async function grantConsent(
  tx: TenantTransaction,
  actor: PrivacyActor,
  request: ConsentRequest,
): Promise<string> {
  const { grant } = request;
  const notice = await currentAuthorizationNotice(tx, grant.notice_id);
  if (
    request.source === 'hr_candidate' &&
    (notice.key !== 'authorization_candidate' || !grant.purposes.includes('RECRUITMENT'))
  ) {
    throw purposeInvalid();
  }
  if (unofferedPurposes(notice.purposes, grant.purposes).length > 0) throw purposeInvalid();
  if (!isGrantDateValid(grant.granted_on, bogotaToday(actor.at))) throw grantDateInvalid();
  await assertEvidence(tx, actor, grant.evidence_file_id);
  const row = await tx.privacyConsent.create({ data: consentColumns(actor, request, notice) });
  await auditPrivacy(tx, actor, {
    action: 'privacy.consent.grant',
    entityType: 'prv_consent',
    entityId: row.id,
    changes: consentChanges(request, notice),
  });
  return row.id;
}

/** Autorizaciones de un titular (y de los duplicados fusionados en él), las más recientes primero. */
export async function consentsOfParty(
  tx: TenantTransaction,
  partyIds: readonly string[],
): Promise<PartyConsent[]> {
  const rows = await tx.privacyConsent.findMany({
    where: { partyId: { in: [...partyIds] }, deletedAt: null },
    include: { notice: true },
    orderBy: [{ grantedOn: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(partyConsentView);
}

/** Textos de autorización vigentes, para el componente de los formularios. */
export async function publishedAuthorizationNotices(tx: TenantTransaction): Promise<Notice[]> {
  const rows = await tx.privacyNotice.findMany({
    where: { status: 'published', deletedAt: null, key: { startsWith: 'authorization_' } },
    orderBy: { key: 'asc' },
  });
  return rows.map(noticeView);
}

/** Verifica si la autorización permite eliminar la identidad, conservando su registro inmutable. */
export async function canEraseRecruitmentIdentity(
  tx: TenantTransaction,
  target: {
    readonly id: string;
    readonly partyId: string;
    readonly talentBank: boolean;
  },
): Promise<boolean> {
  const result = await tx.privacyConsent.count({
    where: {
      id: target.id,
      partyId: target.partyId,
      source: 'hr_candidate',
      evidenceFileId: null,
      ...(target.talentBank ? { revokedAt: { not: null } } : {}),
    },
  });
  return result === 1;
}

/**
 * Los textos publicados de las claves dadas, como los términos de uso del portal y la política de
 * privacidad que el cliente acepta en su primer ingreso (B30, decisión 8).
 */
export async function publishedNotices(
  tx: TenantTransaction,
  keys: readonly string[],
): Promise<Notice[]> {
  const rows = await tx.privacyNotice.findMany({
    where: { status: 'published', deletedAt: null, key: { in: [...keys] } },
    orderBy: { key: 'asc' },
  });
  return rows.map(noticeView);
}
