import { Inject, Injectable } from '@nestjs/common';
import type {
  Comment as CommentView,
  CommentList,
  CreatedResponse,
  RecordRef,
} from '@arza/contracts';

import type { AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { activeInternalUserByEmail } from '../../iam/index.js';
import { auditNtf } from './ntf-audit.js';
import { commentNotFound, mentionInvalid } from './ntf-messages.js';
import { peopleViews, personIn } from './people.js';
import { recordFor, refOf, type RecordAccess, type RecordFacts } from './record-access.js';

// Comentarios con menciones en cualquier registro (B16, ficha 17.5). No se editan: quien lo
// escribió puede retirarlo, y el retiro queda en la auditoría. Cada mención produce un aviso por
// medio del evento «comment.mentioned» de la bandeja de salida.

export interface CommentInput extends RecordRef {
  readonly body: string;
  readonly mention_emails: readonly string[];
}

/** Las personas mencionadas deben ser colaboradores activos de la empresa, y no quien escribe. */
/**
 * Las personas mencionadas, por su correo: deben ser colaboradores activos de la empresa, y no
 * quien escribe. Así se menciona como se delega una tarea (B15), sin abrir el directorio.
 */
async function validMentions(
  tx: TenantTransaction,
  principal: Principal,
  emails: readonly string[],
): Promise<string[]> {
  const ids = new Set<string>();
  for (const email of new Set(emails)) {
    const id = await activeInternalUserByEmail(tx, email);
    if (id === null || id === principal.userId) throw mentionInvalid();
    ids.add(id);
  }
  return [...ids];
}

/** Cada mención produce un aviso por el evento «comment.mentioned» de la bandeja de salida. */
async function announceMentions(
  tx: TenantTransaction,
  actor: { readonly tenantId: string; readonly userId: string; readonly at: Date },
  mention: {
    readonly commentId: string;
    readonly mentionIds: string[];
    readonly record: RecordFacts;
  },
): Promise<void> {
  if (mention.mentionIds.length === 0) return;
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    eventType: 'comment.mentioned',
    actorId: actor.userId,
    occurredAt: actor.at,
    payload: {
      comment_id: mention.commentId,
      author_id: actor.userId,
      mention_ids: mention.mentionIds,
      record_label: mention.record.label,
      link: mention.record.link,
    },
  });
}

@Injectable()
export class CommentsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal, ability: AppAbility, ref: RecordRef): Promise<CommentList> {
    const access = this.accessOf(principal, ability);
    return this.database.withTenant(principal, async (tx) => {
      await recordFor(tx, access, ref, 'read');
      const rows = await tx.comment.findMany({
        where: { entityType: ref.entity_type, entityId: ref.entity_id, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const people = await peopleViews(
        tx,
        rows.flatMap((row) => [row.createdBy, ...row.mentionIds]),
      );
      return {
        items: rows.map((row): CommentView => ({
          id: row.id,
          body: row.body,
          author: personIn(people, row.createdBy),
          mentions: row.mentionIds.flatMap((id) => people.get(id) ?? []),
          created_at: row.createdAt.toISOString(),
          can_delete: row.createdBy === principal.userId,
        })),
      };
    });
  }

  async create(
    principal: Principal,
    ability: AppAbility,
    input: CommentInput,
    meta: RequestMeta,
  ): Promise<CreatedResponse> {
    const access = this.accessOf(principal, ability);
    return this.database.withTenant(principal, async (tx) => {
      const record = await recordFor(tx, access, input, 'write');
      const mentionIds = await validMentions(tx, principal, input.mention_emails);
      const comment = await tx.comment.create({
        data: {
          tenantId: principal.tenantId,
          entityType: input.entity_type,
          entityId: input.entity_id,
          body: input.body,
          mentionIds,
        },
      });
      const actor = { ...principal, meta, at: access.now };
      await auditNtf(tx, actor, {
        action: 'ntf.comment.create',
        entityType: 'core_comment',
        entityId: comment.id,
        changes: {
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          mention_ids: mentionIds,
        },
      });
      await announceMentions(tx, actor, { commentId: comment.id, mentionIds, record });
      return { id: comment.id };
    });
  }

  /** Retira el comentario. Solo quien lo escribió, y solo si todavía ve el registro. */
  async remove(
    principal: Principal,
    ability: AppAbility,
    id: string,
    meta: RequestMeta,
  ): Promise<void> {
    const access = this.accessOf(principal, ability);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.comment.findFirst({ where: { id, deletedAt: null } });
      if (row === null) throw commentNotFound();
      await recordFor(tx, access, refOf(row), 'read');
      if (row.createdBy !== principal.userId) throw permissionDenied();
      await tx.comment.update({ where: { id }, data: { deletedAt: access.now } });
      await auditNtf(
        tx,
        { ...principal, meta, at: access.now },
        {
          action: 'ntf.comment.delete',
          entityType: 'core_comment',
          entityId: id,
          changes: refOf(row),
        },
      );
    });
  }

  private accessOf(principal: Principal, ability: AppAbility): RecordAccess {
    return { principal, ability, now: this.clock.now() };
  }
}
