import { Inject, Injectable } from '@nestjs/common';
import type { DownloadLinkResponse } from '@arza/contracts';

import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { AttachedFileLinks } from '../../doc/index.js';
import { assertAuditReader } from './audit-rules.js';
import type { QmsViewer } from './nonconformities.js';
import { qmsConflict, qmsNotFound } from './qms-support.js';

// Descarga del informe de auditoría y del acta de revisión por la dirección en PDF (B39, decisión
// 9). El enlace vence a los cinco minutos y la descarga queda en la auditoría.

function notReady(): never {
  throw qmsConflict('El PDF aún se está generando. Intente de nuevo en un minuto.');
}

@Injectable()
export class QualityFiles {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  /** Quien lee Calidad o el auditor de esa auditoría. */
  async reportLink(
    viewer: QmsViewer,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      const audit = await tx.qmsAudit.findFirst({ where: { id, deletedAt: null } });
      if (audit === null) throw qmsNotFound('La auditoría no existe.');
      assertAuditReader(viewer, audit);
      if (audit.reportFileId === null) return notReady();
      return this.links.issue(tx, viewer.principal, audit.reportFileId, meta);
    });
  }

  async reviewLink(
    viewer: QmsViewer,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      const review = await tx.qmsManagementReview.findFirst({ where: { id, deletedAt: null } });
      if (review === null) throw qmsNotFound('El acta no existe.');
      if (review.fileId === null) return notReady();
      return this.links.issue(tx, viewer.principal, review.fileId, meta);
    });
  }
}
