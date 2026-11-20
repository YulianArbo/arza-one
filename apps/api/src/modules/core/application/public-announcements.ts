import { Inject, Injectable } from '@nestjs/common';
import type { PublicAnnouncement, PublicAnnouncementQuery } from '@arza/contracts';

import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  PROFILE_IMAGES,
  imageNotFound,
  type ProfileImages,
  type StoredImage,
} from '../../iam/index.js';
import { audiencesFor } from '../domain/announcement-status.js';
import { bogotaToday, fromCalendarDate } from '../domain/calendar-date.js';
import { tenantIdByTaxId } from './company-identity.js';

// Comunicados en la pantalla de acceso (B36A), sin sesión: solo los vigentes hoy de la empresa del
// sitio público, sin quién los creó ni fechas internas. Si el sitio no tiene empresa configurada,
// el acceso simplemente no muestra comunicados.

/** Los que caben en el panel; si hubiera más, se ven los que empezaron más recientemente. */
const MAX_PUBLIC = 10;

function activeWhere(today: string) {
  const day = fromCalendarDate(today);
  return { deletedAt: null, endedAt: null, startsOn: { lte: day }, endsOn: { gte: day } };
}

@Injectable()
export class PublicAnnouncementsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Env,
    @Inject(PROFILE_IMAGES) private readonly images: ProfileImages,
  ) {}

  private async siteTenant(): Promise<string | null> {
    const taxId = this.config.PUBLIC_SITE_TAX_ID;
    if (taxId === undefined) return null;
    return this.database.withoutTenant((tx) => tenantIdByTaxId(tx, taxId));
  }

  private async inSite<T>(empty: T, work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    const tenantId = await this.siteTenant();
    if (tenantId === null) return empty;
    return this.database.withTenant({ tenantId, userId: null }, work);
  }

  async list(query: PublicAnnouncementQuery): Promise<PublicAnnouncement[]> {
    const today = bogotaToday(this.clock.now());
    const rows = await this.inSite([], (tx) =>
      tx.announcement.findMany({
        where: { ...activeWhere(today), audience: { in: [...audiencesFor(query.audience)] } },
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
        take: MAX_PUBLIC,
      }),
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      link_url: row.linkUrl,
      has_image: row.imageFileId !== null,
    }));
  }

  /** La imagen de un comunicado vigente; la de uno vencido o terminado ya no se entrega. */
  async image(id: string): Promise<StoredImage> {
    const today = bogotaToday(this.clock.now());
    const image = await this.inSite(null, async (tx) => {
      const row = await tx.announcement.findFirst({ where: { id, ...activeWhere(today) } });
      if (row?.imageFileId === undefined || row.imageFileId === null) return null;
      return this.images.open(tx, row.imageFileId);
    });
    if (image === null) throw imageNotFound();
    return image;
  }
}
