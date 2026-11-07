import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatePqrsfRequest,
  PqrsfType,
  PublicPqrsfFiled,
  PublicPqrsfRequest,
  PublicPqrsfStatus,
  PublicPqrsfStatusRequest,
} from '@arza/contracts';
import { pqrsfStatusSchema, pqrsfTypeSchema } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { nextBusinessCode, tenantIdByTaxId, toCalendarDate } from '../../core/index.js';
import { publishedAuthorizationNotices } from '../../privacy/index.js';
import { pqrsfAudit, pqrsfDeadline, pqrsfPayload } from './pqrsf-records.js';
import {
  publicUnavailable,
  recordServiceAudit,
  recordServiceChange,
  serviceActorOf,
  serviceMissing,
  type ServiceActor,
} from './service-support.js';
import { usableParty } from './ticket-links.js';

// Radicación de PQRSF (B29, ficha 17.9; Ley 1480, art. 50). Quien la presenta en el sitio público
// recibe en pantalla el radicado y la fecha límite, y el acuse por correo (el worker lo envía). Lo
// que llega por correo, teléfono o en persona lo registra Servicio al cliente. La consulta de estado
// pide el radicado y el correo con que se radicó (decisión 4).

const PQRSF_SEQUENCE = 'svc.pqrsf';
const PQRSF_CODES = { name: 'PQRSF', prefix: 'PQRSF', padding: 4 } as const;

/** El aviso de autorización que acepta quien radica: el de contactos (decisión 12). */
const CONSENT_NOTICE_KEY = 'authorization_contact';

interface Intake {
  readonly channel: 'web' | 'email' | 'phone' | 'in_person';
  readonly type: PqrsfType;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly subject: string;
  readonly description: string;
  readonly partyId: string | null;
  readonly privacyNoticeId: string | null;
}

async function consentNoticeId(tx: TenantTransaction): Promise<string | null> {
  const notices = await publishedAuthorizationNotices(tx);
  return notices.find((notice) => notice.key === CONSENT_NOTICE_KEY)?.id ?? null;
}

/** Crea la PQRSF con su radicado, su plazo y el acuse pendiente si hay correo. */
async function file(tx: TenantTransaction, actor: ServiceActor, intake: Intake) {
  const deadline = await pqrsfDeadline(tx, actor.at, intake.type, null);
  const fromWeb = intake.channel === 'web';
  const pqrsf = await tx.svcPqrsf.create({
    data: {
      tenantId: actor.tenantId,
      code: await nextBusinessCode(tx, PQRSF_SEQUENCE, actor.at, PQRSF_CODES),
      type: intake.type,
      channel: intake.channel,
      partyId: intake.partyId,
      requesterName: intake.name,
      requesterEmail: intake.email,
      requesterPhone: intake.phone,
      subject: intake.subject,
      description: intake.description,
      receivedAt: actor.at,
      ...deadline,
      privacyNoticeId: intake.privacyNoticeId,
      privacyAcceptedAt: fromWeb ? actor.at : null,
      mailPending: intake.email === null ? null : 'ack',
    },
  });
  await recordServiceChange(tx, actor, {
    action: 'service.pqrsf.file',
    event: 'service.pqrsf.filed',
    entityType: 'svc_pqrsf',
    entityId: pqrsf.id,
    changes: { ...pqrsfAudit(pqrsf), privacy_accepted: fromWeb },
    payload: pqrsfPayload(pqrsf),
  });
  return pqrsf;
}

@Injectable()
export class PqrsfIntakeUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Env,
  ) {}

  /** La empresa del sitio público (decisión 3); sin ella el formulario no está disponible. */
  private async siteTenant(): Promise<string> {
    const taxId = this.config.PUBLIC_SITE_TAX_ID;
    if (taxId === undefined) throw publicUnavailable();
    const tenantId = await this.database.withoutTenant((tx) => tenantIdByTaxId(tx, taxId));
    if (tenantId === null) throw publicUnavailable();
    return tenantId;
  }

  async filePublic(input: PublicPqrsfRequest, meta: RequestMeta): Promise<PublicPqrsfFiled> {
    const tenantId = await this.siteTenant();
    const actor: ServiceActor = { tenantId, userId: null, meta, at: this.clock.now() };
    return this.database.withTenant({ tenantId, userId: null }, async (tx) => {
      const pqrsf = await file(tx, actor, {
        channel: 'web',
        type: input.type,
        name: input.name,
        email: input.email,
        phone: input.phone,
        subject: input.subject,
        description: input.description,
        partyId: null,
        privacyNoticeId: await consentNoticeId(tx),
      });
      return {
        code: pqrsf.code,
        type: input.type,
        received_at: pqrsf.receivedAt.toISOString(),
        due_on: toCalendarDate(pqrsf.dueOn),
      };
    });
  }

  /** Estado para quien la radicó. Sin coincidencia exacta de radicado y correo, «no existe». */
  async publicStatus(
    input: PublicPqrsfStatusRequest,
    meta: RequestMeta,
  ): Promise<PublicPqrsfStatus> {
    const tenantId = await this.siteTenant();
    const actor: ServiceActor = { tenantId, userId: null, meta, at: this.clock.now() };
    return this.database.withTenant({ tenantId, userId: null }, async (tx) => {
      const pqrsf = await tx.svcPqrsf.findFirst({
        where: { code: input.code, requesterEmail: input.email, deletedAt: null },
      });
      if (pqrsf === null) {
        throw serviceMissing(
          'No encontramos una PQRSF con ese radicado y ese correo. Revise que coincidan con el acuse.',
        );
      }
      const responded = pqrsf.responseSentAt !== null || pqrsf.status === 'closed';
      // Queda registrado que se consultó, como cuando el cliente abre una cotización.
      await recordServiceAudit(tx, actor, {
        action: 'service.pqrsf.consult',
        entityType: 'svc_pqrsf',
        entityId: pqrsf.id,
        changes: { code: pqrsf.code, status: pqrsf.status },
      });
      return {
        code: pqrsf.code,
        type: pqrsfTypeSchema.parse(pqrsf.type),
        status: pqrsfStatusSchema.parse(pqrsf.status),
        received_at: pqrsf.receivedAt.toISOString(),
        due_on: toCalendarDate(pqrsf.dueOn),
        responded_at: pqrsf.respondedAt?.toISOString() ?? null,
        response: responded ? pqrsf.response : null,
      };
    });
  }

  async create(
    principal: Principal,
    input: CreatePqrsfRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const partyId = input.party_id === null ? null : await usableParty(tx, input.party_id);
      const pqrsf = await file(tx, actor, {
        channel: input.channel,
        type: input.type,
        name: input.requester_name,
        email: input.requester_email,
        phone: input.requester_phone,
        subject: input.subject,
        description: input.description,
        partyId,
        privacyNoticeId: null,
      });
      return pqrsf.id;
    });
  }
}
