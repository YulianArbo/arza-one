import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { DownloadLinkResponse, VersionDownloadRequest } from '@arza/contracts';

import type { DocDocument, DocVersion, File } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { FileStorage } from '../infrastructure/file-storage.js';
import { logDownload } from './access-log.js';
import { integrityFailed, pdfNotReady } from './doc-messages.js';
import { actorOf, auditDoc, readerOf } from './doc-support.js';
import { FileLinkIssuer } from './file-link-issuer.js';
import { findVisibleVersion } from './versions.js';

// Descarga de una versión (B18, ficha 17.4): antes de entregar el enlace se recalcula la huella del
// archivo guardado. Si no coincide, el archivo fue alterado: no se entrega y queda la alerta de
// seguridad. Lo confidencial y lo restringido queda además en el registro de accesos. Desde B20, el
// PDF de la versión vigente es su copia de consulta, con el pie de copia no controlada.

interface Resolved {
  readonly document: DocDocument;
  readonly version: DocVersion;
  readonly file: File;
}

/** La vigente se descarga como copia de consulta, con su pie, en cuanto el worker la genera (B20). */
function pdfToDownload(version: DocVersion): string | null {
  const copy = version.status === 'current' ? version.copyFileId : null;
  return copy ?? version.pdfFileId;
}

function sha256Of(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

@Injectable()
export class VersionDownloadsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(FileLinkIssuer) private readonly issuer: FileLinkIssuer,
  ) {}

  async issueLink(
    principal: Principal,
    ability: AppAbility,
    versionId: string,
    request: VersionDownloadRequest,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    const resolved = await this.database.withTenant(principal, (tx) =>
      this.resolve(tx, principal, ability, versionId, request),
    );
    const content = await this.storage.read(resolved.file.storageKey);
    if (sha256Of(content) !== resolved.file.sha256) {
      await this.reportTampering(principal, resolved, meta);
      throw integrityFailed();
    }
    const actor = { ...actorOf(principal, meta, this.clock.now()), userId: principal.userId };
    return this.database.withTenant(principal, async (tx) => {
      const current = await this.resolve(tx, principal, ability, versionId, request);
      const link = await this.issuer.issue(principal, 'download', current.file.id);
      await auditDoc(tx, actor, {
        action: 'doc.version.download_link',
        entityType: 'doc_version',
        entityId: current.version.id,
        changes: { code: current.document.code, file: request.file, expires_at: link.expires_at },
      });
      await logDownload(tx, actor, current.document, current.version.id);
      return link;
    });
  }

  /** La versión que la persona puede ver y el archivo pedido: el fuente solo para quien edita. */
  private async resolve(
    tx: TenantTransaction,
    principal: Principal,
    ability: AppAbility,
    versionId: string,
    request: VersionDownloadRequest,
  ): Promise<Resolved> {
    const reader = await readerOf(tx, principal, ability);
    const { document, version } = await findVisibleVersion(tx, reader, versionId);
    if (request.file === 'source' && !reader.canEdit) throw permissionDenied();
    const fileId = request.file === 'source' ? version.sourceFileId : pdfToDownload(version);
    const file =
      fileId === null
        ? null
        : await tx.file.findFirst({ where: { id: fileId, scanStatus: 'available' } });
    if (file === null) throw pdfNotReady();
    return { document, version, file };
  }

  private async reportTampering(
    principal: Principal,
    resolved: Resolved,
    meta: RequestMeta,
  ): Promise<void> {
    await this.database.withTenant(principal, (tx) =>
      recordSecurityEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: this.clock.now(),
        type: 'doc.file.integrity_failed',
        userId: principal.userId,
        severity: 'high',
        detail: {
          file_id: resolved.file.id,
          version_id: resolved.version.id,
          code: resolved.document.code,
        },
        meta,
      }),
    );
  }
}
