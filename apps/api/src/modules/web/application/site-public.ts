import { Inject, Injectable } from '@nestjs/common';
import type {
  CookieCategory,
  CookieConsentRequest,
  CookieConsentResponse,
  LegalTextKey,
  PublicLegalText,
  PublicPage,
  PublicPageList,
  PublicPrivacyPolicy,
} from '@arza/contracts';

import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { publishedNotices, recordCookieConsent } from '../../privacy/index.js';
import { publicLegalView, publishedLegalText } from './legal-texts.js';
import { publishedPage, publishedPages } from './pages.js';
import {
  formUnavailable,
  siteTenantId,
  truncatedIp,
  webConflict,
  webNotFound,
} from './web-support.js';

// Lo que lee y registra el visitante del sitio público, sin sesión (B41): las páginas y los textos
// publicados de la empresa del sitio (PUBLIC_SITE_TAX_ID), la política de tratamiento que vive en
// Privacidad (decisión 1) y su elección de cookies.

function policyMissing(): Error {
  return webNotFound('La política de tratamiento todavía no se ha publicado.');
}

@Injectable()
export class SitePublic {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Env,
  ) {}

  private async read<T>(fallback: T, work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    const tenantId = await siteTenantId(this.database, this.config);
    if (tenantId === null) return fallback;
    return this.database.withTenant({ tenantId, userId: null }, work);
  }

  async pages(): Promise<PublicPageList> {
    return this.read({ data: [] }, publishedPages);
  }

  async page(slug: string): Promise<PublicPage> {
    const page = await this.read(null, (tx) => publishedPage(tx, slug));
    if (page === null) throw webNotFound('La página no existe.');
    return page;
  }

  async legalText(key: LegalTextKey): Promise<PublicLegalText> {
    const row = await this.read(null, (tx) => publishedLegalText(tx, key));
    if (row === null) throw webNotFound('Este texto todavía no se ha publicado.');
    return publicLegalView(row);
  }

  /** La política de tratamiento de datos publicada en Privacidad (PL-DG-002). */
  async privacyPolicy(): Promise<PublicPrivacyPolicy> {
    const notice = await this.read(null, async (tx) => {
      const [found] = await publishedNotices(tx, ['privacy_policy']);
      return found ?? null;
    });
    if (notice === null) throw policyMissing();
    if (notice.effective_from === null) throw policyMissing();
    return {
      id: notice.id,
      title: notice.title,
      body: notice.body,
      version_number: notice.version_number,
      effective_from: notice.effective_from,
    };
  }

  /** Registra la elección del visitante con la versión de la política que vio. */
  async cookieConsent(
    input: CookieConsentRequest,
    meta: RequestMeta,
  ): Promise<CookieConsentResponse> {
    const tenantId = await siteTenantId(this.database, this.config);
    if (tenantId === null) throw formUnavailable();
    const ipTruncated = truncatedIp(meta.ip);
    const actor = {
      tenantId,
      userId: null,
      principal: null,
      at: this.clock.now(),
      meta: { ...meta, ip: ipTruncated },
    };
    const categories: CookieCategory[] = input.choice.preferences ? ['preferences'] : [];
    return this.database.withTenant({ tenantId, userId: null }, async (tx) => {
      const policy = await publishedLegalText(tx, 'cookie_policy');
      if (policy === null) throw formUnavailable();
      if (policy.versionNumber !== input.policy_version) {
        throw webConflict('La política de cookies cambió. Recargue la página y elija de nuevo.');
      }
      const decidedAt = await recordCookieConsent(tx, actor, {
        visitorId: input.visitor_id,
        policyVersion: input.policy_version,
        categories,
        ipTruncated,
      });
      return { decided_at: decidedAt.toISOString() };
    });
  }
}
