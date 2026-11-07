import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PORTAL_ERROR_CODES, type PortalTermsDocument } from '@arza/contracts';

import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { acceptedTermsOf, portalAccountOf, type PortalAccount } from '../../iam/index.js';
import { publishedNotices } from '../../privacy/index.js';

// La puerta del portal del cliente (B30, ficha 17.10). Cada petición del portal pasa por aquí: la
// persona debe ser una cuenta del portal ligada a su empresa cliente y haber aceptado los términos
// de uso y la política de privacidad vigentes. De aquí sale el alcance con que los demás módulos
// filtran: la empresa, la persona y si ve todo lo de su empresa o solo lo suyo.

/** Los textos que el cliente acepta en su primer ingreso y cada vez que cambian (decisión 8). */
export const TERMS_KEYS = ['portal_terms', 'privacy_policy'] as const;

export interface PortalContext {
  readonly account: PortalAccount;
  readonly tenantId: string;
  readonly userId: string;
  readonly partyId: string;
  readonly email: string;
  readonly name: string;
  readonly ability: AppAbility;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export function noCompany(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    PORTAL_ERROR_CODES.noCompany,
    'Su cuenta no está ligada a una empresa cliente. Pida a ARZA TECH que la revise.',
  );
}

export function termsPending(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    PORTAL_ERROR_CODES.termsPending,
    'Antes de continuar, lea y acepte los términos de uso y la política de privacidad vigentes.',
  );
}

export function termsUnavailable(): AppError {
  return new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    PORTAL_ERROR_CODES.termsUnavailable,
    'El portal todavía no está disponible: faltan por publicar los términos de uso. Intente más tarde.',
  );
}

export function portalNotFound(what: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, PORTAL_ERROR_CODES.notFound, `${what} no existe.`);
}

/** Los términos vigentes y si la persona ya los aceptó todos. */
export interface TermsState {
  readonly status: 'accepted' | 'pending' | 'unavailable';
  readonly documents: PortalTermsDocument[];
  readonly acceptedAt: Date | null;
}

export async function termsStateOf(tx: TenantTransaction, userId: string): Promise<TermsState> {
  const notices = await publishedNotices(tx, TERMS_KEYS);
  const documents = notices.flatMap((notice) =>
    notice.key === 'portal_terms' || notice.key === 'privacy_policy'
      ? [
          {
            id: notice.id,
            key: notice.key,
            title: notice.title,
            body: notice.body,
            version_number: notice.version_number,
          },
        ]
      : [],
  );
  const accepted = await acceptedTermsOf(tx, userId);
  if (documents.length < TERMS_KEYS.length) {
    return { status: 'unavailable', documents, acceptedAt: null };
  }
  const ids = new Set(documents.map((document) => document.id));
  const matched = accepted.filter((row) => ids.has(row.noticeId));
  const complete = matched.length === documents.length;
  const acceptedAt = complete
    ? new Date(Math.max(...matched.map((row) => row.acceptedAt.getTime())))
    : null;
  return { status: complete ? 'accepted' : 'pending', documents, acceptedAt };
}

/** Ve todo lo de su empresa con este permiso (administrador) o solo lo suyo (usuario). */
export function seesAll(
  context: PortalContext,
  code: 'portal.project.read' | 'portal.ticket.read',
): boolean {
  return hasUnconditionalPermission(context.ability, code);
}

@Injectable()
export class PortalAccess {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Abre la transacción del portal con su alcance; antes exige los términos aceptados. */
  run<T>(
    request: {
      readonly principal: Principal;
      readonly ability: AppAbility;
      readonly meta?: RequestMeta;
      readonly skipTerms?: boolean;
    },
    work: (tx: TenantTransaction, context: PortalContext) => Promise<T>,
  ): Promise<T> {
    const { principal } = request;
    return this.database.withTenant(principal, async (tx) => {
      const account = await portalAccountOf(tx, principal.userId);
      if (account === null) throw noCompany();
      if (request.skipTerms !== true) {
        const terms = await termsStateOf(tx, account.userId);
        if (terms.status === 'unavailable') throw termsUnavailable();
        if (terms.status === 'pending') throw termsPending();
      }
      return work(tx, {
        account,
        tenantId: principal.tenantId,
        userId: account.userId,
        partyId: account.partyId,
        email: account.email,
        name: account.displayName ?? account.email,
        ability: request.ability,
        meta: request.meta ?? null,
        at: this.clock.now(),
      });
    });
  }
}
