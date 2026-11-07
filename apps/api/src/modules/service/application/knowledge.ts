import { Inject, Injectable } from '@nestjs/common';
import {
  canKbStep,
  KB_STATUSES,
  kbAudienceSchema,
  kbCategorySchema,
  kbStatusSchema,
  type KbAction,
  type KbArticleDetail,
  type KbArticleListQuery,
  type KbArticleListResponse,
  type KbArticleRequest,
  type KbArticleSummary,
} from '@arza/contracts';

import type { Prisma, SvcKbArticle } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  peopleNames,
  personRef,
  recordServiceChange,
  serviceActorOf,
  serviceNotFound,
  statusInvalid,
  type ServiceActor,
  type ServiceTarget,
} from './service-support.js';

// Base de conocimiento (B29, ficha 17.9; capítulo 22: el manual de usuario vive aquí). Servicio al
// cliente escribe, publica y archiva; todo el equipo interno lee los artículos publicados
// (decisión 10). Los de los clientes los leerá el portal (B30).

function canManage(ability: AppAbility): boolean {
  return hasUnconditionalPermission(ability, 'service.kb.manage');
}

/** Quien no administra solo ve lo publicado; un borrador ajeno «no existe». */
function visibleWhere(ability: AppAbility): Prisma.SvcKbArticleWhereInput {
  return canManage(ability) ? {} : { status: 'published' };
}

function filtersOf(query: KbArticleListQuery): Prisma.SvcKbArticleWhereInput {
  const contains =
    query.q === undefined ? null : ({ contains: query.q, mode: 'insensitive' } as const);
  return {
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.audience === undefined ? {} : { audience: query.audience }),
    ...(query.category === undefined ? {} : { category: query.category }),
    ...(contains === null
      ? {}
      : { OR: [{ title: contains }, { summary: contains }, { body: contains }] }),
  };
}

function summaryOf(article: SvcKbArticle): KbArticleSummary {
  return {
    id: article.id,
    title: article.title,
    summary: article.summary,
    category: kbCategorySchema.parse(article.category),
    audience: kbAudienceSchema.parse(article.audience),
    status: kbStatusSchema.parse(article.status),
    published_at: article.publishedAt?.toISOString() ?? null,
    updated_at: article.updatedAt.toISOString(),
  };
}

function auditOf(article: SvcKbArticle): Record<string, string> {
  return {
    title: article.title,
    status: article.status,
    audience: article.audience,
    category: article.category,
  };
}

async function findVisible(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
): Promise<SvcKbArticle> {
  const article = await tx.svcKbArticle.findFirst({
    where: { id, deletedAt: null, ...visibleWhere(ability) },
  });
  if (article === null) throw serviceNotFound('El artículo');
  return article;
}

const PAST: Readonly<Record<KbAction, string>> = {
  edit: 'updated',
  publish: 'published',
  archive: 'archived',
};

@Injectable()
export class KnowledgeUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: KbArticleListQuery,
  ): Promise<KbArticleListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.svcKbArticle.findMany({
        where: { deletedAt: null, AND: [visibleWhere(ability), filtersOf(query)] },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      return {
        data: page.map(summaryOf),
        next_cursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
        can_manage: canManage(ability),
      };
    });
  }

  async detail(principal: Principal, ability: AppAbility, id: string): Promise<KbArticleDetail> {
    return this.database.withTenant(principal, async (tx) => {
      const article = await findVisible(tx, ability, id);
      const names = await peopleNames(tx, [article.createdBy]);
      const status = kbStatusSchema.parse(article.status);
      const manage = canManage(ability);
      return {
        ...summaryOf(article),
        body: article.body,
        author: personRef(names, article.createdBy),
        version: article.version,
        can: {
          edit: manage && canKbStep('edit', status),
          publish: manage && canKbStep('publish', status),
          archive: manage && canKbStep('archive', status),
        },
      };
    });
  }

  async create(principal: Principal, input: KbArticleRequest, meta: RequestMeta): Promise<string> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const article = await tx.svcKbArticle.create({
        data: { tenantId: actor.tenantId, ...fieldsOf(input) },
      });
      await recordServiceChange(tx, actor, {
        action: 'service.kb.create',
        event: 'service.kb.created',
        entityType: 'svc_kb_article',
        entityId: article.id,
        changes: auditOf(article),
        payload: { status: article.status, audience: article.audience },
      });
      return article.id;
    });
  }

  async update(
    principal: Principal,
    target: ServiceTarget,
    input: KbArticleRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.step(principal, target, meta, 'edit', fieldsOf(input));
  }

  async publish(principal: Principal, target: ServiceTarget, meta: RequestMeta): Promise<void> {
    const at = this.clock.now();
    await this.step(principal, target, meta, 'publish', { status: 'published', publishedAt: at });
  }

  async archive(principal: Principal, target: ServiceTarget, meta: RequestMeta): Promise<void> {
    await this.step(principal, target, meta, 'archive', { status: 'archived' });
  }

  private async step(
    principal: Principal,
    target: ServiceTarget,
    meta: RequestMeta,
    action: KbAction,
    data: Prisma.SvcKbArticleUpdateManyMutationInput,
  ): Promise<void> {
    const actor: ServiceActor = serviceActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const article = await tx.svcKbArticle.findFirst({
        where: { id: target.id, deletedAt: null },
      });
      if (article === null) throw serviceNotFound('El artículo');
      const status = kbStatusSchema.parse(article.status);
      if (!canKbStep(action, status)) {
        throw statusInvalid(`Un artículo «${KB_STATUSES[status]}» no admite ese paso.`);
      }
      const { count } = await tx.svcKbArticle.updateMany({
        where: { id: article.id, version: target.version, status: article.status, deletedAt: null },
        data,
      });
      if (count === 0) throw versionConflict();
      const after = await tx.svcKbArticle.findUniqueOrThrow({ where: { id: article.id } });
      await recordServiceChange(tx, actor, {
        action: `service.kb.${action === 'edit' ? 'update' : action}`,
        event: `service.kb.${PAST[action]}`,
        entityType: 'svc_kb_article',
        entityId: article.id,
        changes: { ...auditOf(after), status: [article.status, after.status] },
        payload: { status: after.status, audience: after.audience },
      });
    });
  }
}

function fieldsOf(input: KbArticleRequest) {
  return {
    title: input.title,
    summary: input.summary,
    body: input.body,
    category: input.category,
    audience: input.audience,
  };
}
