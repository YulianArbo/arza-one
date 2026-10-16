import { Inject, Injectable } from '@nestjs/common';
import type { DownloadLinkResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DOWNLOAD_LINK_TTL_MS, UPLOAD_LINK_TTL_MS } from '../domain/file-rules.js';
import { FileLinks, type FileLink } from '../infrastructure/file-links.js';

/** Dirección pública de la API (API_URL); los enlaces conservan su prefijo, como /api. */
export const FILE_LINKS_BASE_URL = Symbol('FILE_LINKS_BASE_URL');

/** Emite los enlaces temporales de subida y de descarga de los archivos (B14). */
@Injectable()
export class FileLinkIssuer {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileLinks) private readonly links: FileLinks,
    @Inject(FILE_LINKS_BASE_URL) private readonly baseUrl: string,
  ) {}

  /**
   * Se emite dentro de la transacción del caso de uso: si la auditoría falla, el enlace queda en
   * Valkey sin que nadie conozca su llave y vence solo.
   */
  async issue(
    principal: Principal,
    purpose: FileLink['purpose'],
    fileId: string,
  ): Promise<DownloadLinkResponse> {
    const ttl = purpose === 'upload' ? UPLOAD_LINK_TTL_MS : DOWNLOAD_LINK_TTL_MS;
    const expiresAt = new Date(this.clock.now().getTime() + ttl).toISOString();
    const { tenantId, userId } = principal;
    const token = await this.links.issue({ tenantId, userId, purpose, fileId, expiresAt }, ttl);
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const kind = purpose === 'upload' ? 'uploads' : 'downloads';
    return { url: new URL(`v1/files/${kind}/${token}`, base).toString(), expires_at: expiresAt };
  }
}
