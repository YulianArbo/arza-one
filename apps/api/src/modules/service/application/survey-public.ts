import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { PublicSurvey, PublicSurveyAnswerRequest, PublicSurveyRequest } from '@arza/contracts';

import type { SvcSurvey, SvcSurveyResponse } from '../../../generated/prisma/client.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { companyIdentity } from '../../core/index.js';
import {
  recordServiceChange,
  serviceMissing,
  statusInvalid,
  type ServiceActor,
} from './service-support.js';

// La página pública de la encuesta (B29, ficha 17.9). Quien recibió el correo abre el enlace sin
// sesión y responde una sola vez (decisión 8). La llave del enlace solo existe en el correo: aquí se
// busca por su huella SHA-256. Un enlace reemplazado por uno más reciente ya no existe.

export function surveyTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface Found {
  readonly responseId: string;
  readonly tenantId: string;
}

type Invitation = SvcSurveyResponse & { readonly survey: SvcSurvey };

function linkNotValid() {
  return serviceMissing(
    'El enlace de la encuesta no es válido o se reemplazó por uno más reciente. Use el último correo que recibió.',
  );
}

@Injectable()
export class SurveyPublicUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async find(token: string): Promise<Found> {
    const rows = await this.database.withoutTenant(
      (tx) =>
        tx.$queryRaw<{ response_id: string; tenant_id: string }[]>`
          SELECT response_id, tenant_id FROM svc_find_survey_link(${surveyTokenHash(token)})`,
    );
    const row = rows[0];
    if (row === undefined) throw linkNotValid();
    return { responseId: row.response_id, tenantId: row.tenant_id };
  }

  private async invitation(tx: TenantTransaction, id: string): Promise<Invitation> {
    const row = await tx.svcSurveyResponse.findFirst({
      where: { id, deletedAt: null, supersededAt: null },
      include: { survey: true },
    });
    if (row === null) throw linkNotValid();
    return row;
  }

  private stateOf(row: Invitation, now: Date): PublicSurvey['state'] {
    if (row.answeredAt !== null) return 'answered';
    return row.expiresAt !== null && row.expiresAt <= now ? 'expired' : 'open';
  }

  async view(input: PublicSurveyRequest): Promise<PublicSurvey> {
    const found = await this.find(input.token);
    const now = this.clock.now();
    return this.database.withTenant({ tenantId: found.tenantId, userId: null }, async (tx) => {
      const row = await this.invitation(tx, found.responseId);
      const ticket = await tx.svcTicket.findUniqueOrThrow({ where: { id: row.entityId } });
      return {
        state: this.stateOf(row, now),
        company: (await companyIdentity(tx)).legalName,
        ticket_code: ticket.code,
        ticket_subject: ticket.subject,
        recommend_question: row.survey.recommendQuestion,
        satisfaction_question: row.survey.satisfactionQuestion,
        comment_question: row.survey.commentQuestion,
      };
    });
  }

  async answer(input: PublicSurveyAnswerRequest, meta: RequestMeta): Promise<void> {
    const found = await this.find(input.token);
    const actor: ServiceActor = {
      tenantId: found.tenantId,
      userId: null,
      meta,
      at: this.clock.now(),
    };
    await this.database.withTenant({ tenantId: found.tenantId, userId: null }, async (tx) => {
      const row = await this.invitation(tx, found.responseId);
      const state = this.stateOf(row, actor.at);
      if (state === 'answered') throw statusInvalid('Esta encuesta ya se respondió. ¡Gracias!');
      if (state === 'expired') throw statusInvalid('El enlace de esta encuesta ya venció.');
      const { count } = await tx.svcSurveyResponse.updateMany({
        where: { id: row.id, answeredAt: null, version: row.version },
        data: {
          score: input.score,
          satisfaction: input.satisfaction,
          comment: input.comment,
          answeredAt: actor.at,
        },
      });
      if (count === 0) throw statusInvalid('Esta encuesta ya se respondió. ¡Gracias!');
      await recordServiceChange(tx, actor, {
        action: 'service.survey.answer',
        event: 'service.survey.answered',
        entityType: 'svc_survey_response',
        entityId: row.id,
        changes: { score: input.score, satisfaction: input.satisfaction },
        payload: {
          ticket_id: row.entityId,
          party_id: row.partyId,
          score: input.score,
          satisfaction: input.satisfaction,
        },
      });
    });
  }
}
