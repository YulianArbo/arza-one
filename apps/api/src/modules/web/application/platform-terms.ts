import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  SITE_ERROR_CODES,
  type AcceptPlatformTerms,
  type PlatformTermsStatus,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { clearTermsPending, type PlatformTermsGate } from '../../iam/index.js';
import { publicLegalView, publishedLegalText } from './legal-texts.js';
import { recordWebAudit, webActorOf } from './web-support.js';

// Términos de uso de la plataforma (B41, decisión 3; numeral 20.2): aceptación expresa y
// registrada de cada versión. Al publicar una nueva, cada persona interna la acepta en su
// siguiente ingreso; mientras no exista una publicada, no se bloquea a nadie.

function termsOutdated(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    SITE_ERROR_CODES.termsOutdated,
    'Se publicó una versión más reciente de los términos. Léala antes de aceptarla.',
  );
}

async function hasAccepted(tx: TenantTransaction, textId: string, userId: string) {
  const count = await tx.webLegalAcceptance.count({ where: { textId, userId, deletedAt: null } });
  return count > 0;
}

/** La versión publicada, solo si es la que la persona leyó. */
async function currentTerms(tx: TenantTransaction, textId: string) {
  const terms = await publishedLegalText(tx, 'platform_terms');
  if (terms === null) throw termsOutdated();
  if (terms.id !== textId) throw termsOutdated();
  return terms;
}

/** Lo que identidad pregunta al completar un ingreso (PLATFORM_TERMS_GATE). */
export const PLATFORM_TERMS_RECORDS: PlatformTermsGate = {
  async pendingFor(tx, userId) {
    const terms = await publishedLegalText(tx, 'platform_terms');
    return terms !== null && !(await hasAccepted(tx, terms.id, userId));
  },
};

@Injectable()
export class PlatformTerms {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async status(principal: Principal): Promise<PlatformTermsStatus> {
    return this.database.withTenant(principal, async (tx) => {
      const terms = await publishedLegalText(tx, 'platform_terms');
      if (terms === null) return { pending: false, terms: null };
      const accepted = await hasAccepted(tx, terms.id, principal.userId);
      return { pending: !accepted, terms: publicLegalView(terms) };
    });
  }

  /** Acepta la versión vigente que leyó; las sesiones de la persona dejan de esperarla. */
  async accept(principal: Principal, meta: RequestMeta, input: AcceptPlatformTerms): Promise<void> {
    const actor = webActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const terms = await currentTerms(tx, input.text_id);
      if (!(await hasAccepted(tx, terms.id, principal.userId))) {
        const row = await tx.webLegalAcceptance.create({
          data: {
            tenantId: actor.tenantId,
            textId: terms.id,
            userId: principal.userId,
            acceptedAt: actor.at,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        await recordWebAudit(tx, actor, {
          action: 'web.platform_terms.accept',
          entityType: 'web_legal_acceptance',
          entityId: row.id,
          changes: { key: terms.key, version_number: terms.versionNumber },
        });
      }
      await clearTermsPending(tx, principal.userId);
    });
  }
}
