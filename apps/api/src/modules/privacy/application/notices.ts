import { Inject, Injectable } from '@nestjs/common';
import {
  NOTICE_KINDS,
  noticeKeySchema,
  noticeStatusSchema,
  type CreateNoticeRequest,
  type Notice,
  type NoticeKey,
  type NoticeListQuery,
  type UpdateNoticeRequest,
} from '@arza/contracts';

import type { PrivacyNotice } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { isActiveCatalogCode } from '../../core/index.js';
import { nextVersionNumber, purposesFitKey } from '../domain/privacy-rules.js';
import {
  draftExists,
  noticeNotEditable,
  noticeNotFound,
  purposeInvalid,
} from './privacy-messages.js';
import { actorOf, auditPrivacy, lockKey, type PrivacyActor } from './privacy-support.js';

// Avisos y políticas de privacidad versionados (ficha 17.19, numeral 20.2): borrador → publicado
// → reemplazado. Lo publicado no cambia; la base de datos también lo impide.

export function noticeView(row: PrivacyNotice): Notice {
  const key = noticeKeySchema.parse(row.key);
  return {
    id: row.id,
    key,
    label: NOTICE_KINDS[key].label,
    version_number: row.versionNumber,
    title: row.title,
    body: row.body,
    purposes: row.purposes,
    status: noticeStatusSchema.parse(row.status),
    effective_from: row.effectiveFrom === null ? null : row.effectiveFrom.toISOString(),
    created_at: row.createdAt.toISOString(),
    version: row.version,
  };
}

/** Las finalidades encajan con la clase de texto y siguen activas en el catálogo. */
async function assertPurposes(
  tx: TenantTransaction,
  key: NoticeKey,
  purposes: readonly string[],
): Promise<void> {
  if (!purposesFitKey(key, purposes)) throw purposeInvalid();
  for (const code of purposes) {
    if (!(await isActiveCatalogCode(tx, 'personal_data_purposes', code))) throw purposeInvalid();
  }
}

async function findNotice(tx: TenantTransaction, id: string): Promise<PrivacyNotice> {
  const row = await tx.privacyNotice.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw noticeNotFound();
  return row;
}

/** Borrador nuevo de una clase: uno a la vez, con el número de versión siguiente. */
export async function createDraft(
  tx: TenantTransaction,
  actor: PrivacyActor,
  input: CreateNoticeRequest,
): Promise<PrivacyNotice> {
  await lockKey(tx, actor.tenantId, input.key);
  const latest = await tx.privacyNotice.findFirst({
    where: { key: input.key },
    orderBy: { versionNumber: 'desc' },
  });
  if (latest?.status === 'draft' && latest.deletedAt === null) throw draftExists();
  const row = await tx.privacyNotice.create({
    data: {
      tenantId: actor.tenantId,
      key: input.key,
      versionNumber: nextVersionNumber(latest?.versionNumber ?? null),
      title: input.title,
      body: input.body,
      purposes: input.purposes,
    },
  });
  await auditPrivacy(tx, actor, {
    action: 'privacy.notice.create',
    entityType: 'prv_notice',
    entityId: row.id,
    changes: { key: row.key, version_number: row.versionNumber, title: row.title },
  });
  return row;
}

/** Publica el borrador y reemplaza la versión vigente de la misma clase. */
export async function publishDraft(
  tx: TenantTransaction,
  actor: PrivacyActor,
  draft: PrivacyNotice,
): Promise<PrivacyNotice> {
  const replaced = await tx.privacyNotice.findFirst({
    where: { key: draft.key, status: 'published', deletedAt: null },
  });
  if (replaced !== null) {
    await tx.privacyNotice.update({ where: { id: replaced.id }, data: { status: 'replaced' } });
  }
  const published = await tx.privacyNotice.update({
    where: { id: draft.id },
    data: { status: 'published', effectiveFrom: actor.at },
  });
  await auditPrivacy(tx, actor, {
    action: 'privacy.notice.publish',
    entityType: 'prv_notice',
    entityId: draft.id,
    changes: {
      key: draft.key,
      version_number: draft.versionNumber,
      replaced_version: replaced?.versionNumber ?? null,
    },
  });
  return published;
}

@Injectable()
export class NoticesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal, query: NoticeListQuery): Promise<Notice[]> {
    const rows = await this.database.withTenant(principal, (tx) =>
      tx.privacyNotice.findMany({
        where: {
          deletedAt: null,
          ...(query.key === undefined ? {} : { key: query.key }),
          ...(query.status === undefined ? {} : { status: query.status }),
        },
        orderBy: [{ key: 'asc' }, { versionNumber: 'desc' }],
      }),
    );
    return rows.map(noticeView);
  }

  async get(principal: Principal, id: string): Promise<Notice> {
    return noticeView(await this.database.withTenant(principal, (tx) => findNotice(tx, id)));
  }

  async create(
    principal: Principal,
    input: CreateNoticeRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      await assertPurposes(tx, input.key, input.purposes);
      return (await createDraft(tx, actor, input)).id;
    });
  }

  async update(
    principal: Principal,
    id: string,
    version: number,
    input: UpdateNoticeRequest,
    meta: RequestMeta,
  ): Promise<Notice> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const before = await this.editableDraft(tx, id, version);
      const key = noticeKeySchema.parse(before.key);
      await assertPurposes(tx, key, input.purposes);
      const after = await tx.privacyNotice.update({ where: { id }, data: input });
      const changes = changesBetween(
        { title: before.title, body: before.body, purposes: before.purposes.join(',') },
        { title: after.title, body: after.body, purposes: after.purposes.join(',') },
        ['body'],
      );
      await auditPrivacy(tx, actor, {
        action: 'privacy.notice.update',
        entityType: 'prv_notice',
        entityId: id,
        changes: { key, version_number: before.versionNumber, ...changes },
      });
      return noticeView(after);
    });
  }

  async publish(
    principal: Principal,
    id: string,
    version: number,
    meta: RequestMeta,
  ): Promise<Notice> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const draft = await findNotice(tx, id);
      await lockKey(tx, actor.tenantId, draft.key);
      const current = await this.editableDraft(tx, id, version);
      await assertPurposes(tx, noticeKeySchema.parse(current.key), current.purposes);
      return noticeView(await publishDraft(tx, actor, current));
    });
  }

  /** El borrador en la versión que la persona vio; publicado no se toca (409). */
  private async editableDraft(
    tx: TenantTransaction,
    id: string,
    version: number,
  ): Promise<PrivacyNotice> {
    const row = await findNotice(tx, id);
    if (row.status !== 'draft') throw noticeNotEditable();
    if (row.version !== version) throw versionConflict();
    return row;
  }
}
