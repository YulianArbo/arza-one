import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  PORTAL_ERROR_CODES,
  type AcceptPortalTermsRequest,
  type PortalPqrsfFiled,
  type PortalPqrsfRequest,
  type PortalSigningLink,
  type PortalTerms,
  type PortalTicketRequest,
} from '@arza/contracts';

import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { issueClientSigningLink } from '../../contract/index.js';
import { recordTermsAcceptance, type TermsVersion } from '../../iam/index.js';
import { clientProjectIds } from '../../project/index.js';
import { createClientTicket, fileClientPqrsf, replyClientTicket } from '../../service/index.js';
import { PortalAccess, portalNotFound, termsStateOf, termsUnavailable } from './portal-access.js';
import { actorOf, projectScope, serviceScope, signingRights } from './portal-scopes.js';

// Lo que el cliente hace desde el portal (B30, ficha 17.10): aceptar los términos, pedir el enlace
// para firmar, registrar y responder tiquetes y radicar PQRSF. Cada escritura deja su auditoría y
// sus eventos en la misma transacción (lo hace el módulo dueño del dato).

interface Request {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

function termsOutdated(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PORTAL_ERROR_CODES.termsOutdated,
    'Los términos cambiaron mientras los leía. Revise la versión vigente y acéptela de nuevo.',
  );
}

@Injectable()
export class PortalActions {
  constructor(
    @Inject(PortalAccess) private readonly access: PortalAccess,
    @Inject(CONFIG) private readonly config: Env,
  ) {}

  /** Los términos vigentes y si la persona ya los aceptó. */
  async terms(request: Omit<Request, 'meta'>): Promise<PortalTerms> {
    return this.access.run({ ...request, skipTerms: true }, async (tx, context) => {
      const state = await termsStateOf(tx, context.userId);
      return {
        status: state.status,
        documents: state.documents,
        accepted_at: state.acceptedAt?.toISOString() ?? null,
      };
    });
  }

  /** Acepta las versiones vigentes; si cambiaron mientras las leía, debe verlas de nuevo. */
  async acceptTerms(request: Request, input: AcceptPortalTermsRequest): Promise<void> {
    await this.access.run({ ...request, skipTerms: true }, async (tx, context) => {
      const state = await termsStateOf(tx, context.userId);
      if (state.status === 'unavailable') throw termsUnavailable();
      const current = state.documents.map((document) => document.id).sort();
      const sent = [...new Set(input.notice_ids)].sort();
      if (current.join(',') !== sent.join(',')) throw termsOutdated();
      const versions: TermsVersion[] = state.documents.map((document) => ({
        id: document.id,
        key: document.key,
        versionNumber: document.version_number,
      }));
      const actor = {
        tenantId: context.tenantId,
        userId: context.userId,
        meta: request.meta,
        at: context.at,
      };
      await recordTermsAcceptance(tx, actor, versions);
    });
  }

  /** Enlace nuevo de un solo uso hacia la pantalla de firma (decisión 4). */
  async signingLink(request: Request, envelopeId: string): Promise<PortalSigningLink> {
    return this.access.run(request, async (tx, context) => ({
      url: await issueClientSigningLink(tx, actorOf(context), {
        partyId: context.partyId,
        email: context.email,
        envelopeId,
        rights: signingRights(context),
        appUrl: this.config.APP_URL,
      }),
    }));
  }

  /** Registra un tiquete; el proyecto, si lo indica, debe ser uno de los que la persona ve. */
  async createTicket(request: Request, input: PortalTicketRequest): Promise<string> {
    return this.access.run(request, async (tx, context) => {
      if (input.project_id !== null) {
        const visible = await clientProjectIds(tx, projectScope(context));
        if (!visible.includes(input.project_id)) throw portalNotFound('El proyecto');
      }
      return createClientTicket(tx, actorOf(context), serviceScope(context), input);
    });
  }

  async reply(request: Request, ticketId: string, body: string): Promise<string> {
    return this.access.run(request, (tx, context) =>
      replyClientTicket(tx, actorOf(context), serviceScope(context), { ticketId, body }),
    );
  }

  async filePqrsf(request: Request, input: PortalPqrsfRequest): Promise<PortalPqrsfFiled> {
    return this.access.run(request, async (tx, context) => {
      const filed = await fileClientPqrsf(tx, actorOf(context), serviceScope(context), input);
      return { id: filed.id, code: filed.code, due_on: filed.dueOn };
    });
  }
}
