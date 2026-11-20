import { Inject, Injectable } from '@nestjs/common';
import { announcementAudienceSchema } from '@arza/contracts';
import type {
  Announcement as AnnouncementView,
  AnnouncementRequest,
  ImageUploadRequest,
  UploadLinkResponse,
} from '@arza/contracts';

import type { Announcement } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  PROFILE_IMAGES,
  assertUsableImage,
  imageNotFound,
  type ProfileImages,
  type StoredImage,
} from '../../iam/index.js';
import { announcementStatus } from '../domain/announcement-status.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../domain/calendar-date.js';
import { auditCore, type CoreActor } from './core-audit.js';
import { announcementEnded, announcementPast, recordNotFound } from './core-messages.js';
import type { Versioned } from './records.js';

// Comunicados del acceso (B36A): Administración los crea, edita y termina; cada cambio queda en la
// auditoría. Nunca se borran: terminar uno conserva su historia.

function announcementView(row: Announcement, today: string): AnnouncementView {
  const dates = {
    startsOn: toCalendarDate(row.startsOn),
    endsOn: toCalendarDate(row.endsOn),
    ended: row.endedAt !== null,
  };
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link_url: row.linkUrl,
    audience: announcementAudienceSchema.parse(row.audience),
    starts_on: dates.startsOn,
    ends_on: dates.endsOn,
    image_file_id: row.imageFileId,
    status: announcementStatus(dates, today),
    ended_at: row.endedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    version: row.version,
  };
}

function columnsOf(input: AnnouncementRequest) {
  return {
    title: input.title,
    body: input.body,
    linkUrl: input.link_url,
    audience: input.audience,
    startsOn: fromCalendarDate(input.starts_on),
    endsOn: fromCalendarDate(input.ends_on),
    imageFileId: input.image_file_id,
  };
}

function auditOf(
  row: Pick<Announcement, 'title' | 'audience' | 'startsOn' | 'endsOn'> & {
    readonly linkUrl: string | null;
    readonly imageFileId: string | null;
  },
) {
  return {
    title: row.title,
    audience: row.audience,
    starts_on: toCalendarDate(row.startsOn),
    ends_on: toCalendarDate(row.endsOn),
    link_url: row.linkUrl,
    image_file_id: row.imageFileId,
  };
}

async function findAnnouncement(tx: TenantTransaction, id: string): Promise<Announcement> {
  const row = await tx.announcement.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw recordNotFound('El comunicado');
  return row;
}

@Injectable()
export class AnnouncementsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PROFILE_IMAGES) private readonly images: ProfileImages,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CoreActor {
    return { context: principal, meta, at: this.clock.now() };
  }

  /** Todos, los más recientes primero, con su estado según las fechas de hoy en Colombia. */
  async list(principal: Principal): Promise<AnnouncementView[]> {
    const today = bogotaToday(this.clock.now());
    const rows = await this.database.withTenant(principal, (tx) =>
      tx.announcement.findMany({
        where: { deletedAt: null },
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    return rows.map((row) => announcementView(row, today));
  }

  requestUpload(
    principal: Principal,
    input: ImageUploadRequest,
    meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    return this.images.requestUpload(principal, input, meta);
  }

  async create(
    principal: Principal,
    input: AnnouncementRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    this.assertNotPast(input);
    return this.database.withTenant(principal, async (tx) => {
      await this.assertImage(tx, principal, input.image_file_id, null);
      const row = await tx.announcement.create({
        data: { tenantId: principal.tenantId, ...columnsOf(input) },
      });
      await auditCore(tx, actor, {
        action: 'core.announcement.create',
        entityType: 'announcement',
        entityId: row.id,
        changes: auditOf(row),
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    target: Versioned,
    input: AnnouncementRequest,
    meta: RequestMeta,
  ): Promise<AnnouncementView> {
    const actor = this.actor(principal, meta);
    this.assertNotPast(input);
    return this.database.withTenant(principal, async (tx) => {
      const before = await findAnnouncement(tx, target.id);
      if (before.endedAt !== null) throw announcementEnded();
      await this.assertImage(tx, principal, input.image_file_id, before.imageFileId);
      const { count } = await tx.announcement.updateMany({
        where: { id: before.id, version: target.version },
        data: columnsOf(input),
      });
      if (count === 0) throw versionConflict();
      const after = await findAnnouncement(tx, before.id);
      await auditCore(tx, actor, {
        action: 'core.announcement.update',
        entityType: 'announcement',
        entityId: after.id,
        changes: changesBetween(auditOf(before), auditOf(after)),
      });
      return announcementView(after, bogotaToday(actor.at));
    });
  }

  /** Terminar antes de tiempo: deja de verse en el acceso desde ya y no se vuelve a editar. */
  async end(principal: Principal, target: Versioned, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await findAnnouncement(tx, target.id);
      if (row.endedAt !== null) throw announcementEnded();
      const { count } = await tx.announcement.updateMany({
        where: { id: row.id, version: target.version },
        data: { endedAt: actor.at, endedBy: principal.userId },
      });
      if (count === 0) throw versionConflict();
      await auditCore(tx, actor, {
        action: 'core.announcement.end',
        entityType: 'announcement',
        entityId: row.id,
        changes: { title: row.title, ended_at: actor.at.toISOString() },
      });
    });
  }

  /** La imagen de un comunicado, para verla en Administración. */
  async image(principal: Principal, id: string): Promise<StoredImage> {
    return this.database.withTenant(principal, async (tx) => {
      const row = await findAnnouncement(tx, id);
      const image = row.imageFileId === null ? null : await this.images.open(tx, row.imageFileId);
      if (image === null) throw imageNotFound();
      return image;
    });
  }

  private assertNotPast(input: AnnouncementRequest): void {
    if (input.ends_on < bogotaToday(this.clock.now())) throw announcementPast();
  }

  /** Una imagen nueva debe ser propia, PNG o JPG y ya revisada; la que ya tenía se conserva. */
  private async assertImage(
    tx: TenantTransaction,
    principal: Principal,
    fileId: string | null,
    current: string | null,
  ): Promise<void> {
    if (fileId === null || fileId === current) return;
    assertUsableImage(await this.images.ownImageState(tx, principal, fileId));
  }
}
