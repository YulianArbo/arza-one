import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  SITE_ERROR_CODES,
  type Page,
  type PageAction,
  type PublicPage,
  type PublicPageList,
  type SavePage,
} from '@arza/contracts';

import { Prisma, type WebPage } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  optionalRef,
  recordWebChange,
  userRefs,
  webActorOf,
  webConflict,
  webNotFound,
  type Target,
} from './web-support.js';

// Páginas institucionales administrables (B41, ficha 17.18; decisión 10): borrador, publicada o
// retirada. El visitante solo ve las publicadas.

function slugTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    SITE_ERROR_CODES.slugTaken,
    'Ya hay otra página con esa dirección.',
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function pageView(row: WebPage, refs: Map<string, { id: string; name: string }>): Page {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    status: row.status as Page['status'],
    published_at: row.publishedAt?.toISOString() ?? null,
    updated_by: optionalRef(refs, row.updatedBy),
    version: row.version,
  };
}

function pageData(input: SavePage) {
  return { slug: input.slug, title: input.title, summary: input.summary, body: input.body };
}

/** Las páginas publicadas, para el menú y el mapa del sitio. */
export async function publishedPages(tx: TenantTransaction): Promise<PublicPageList> {
  const rows = await tx.webPage.findMany({
    where: { status: 'published', deletedAt: null },
    orderBy: [{ title: 'asc' }],
    select: { slug: true, title: true },
    take: 100,
  });
  return { data: rows };
}

/** Una página publicada por su dirección, o null. */
export async function publishedPage(
  tx: TenantTransaction,
  slug: string,
): Promise<PublicPage | null> {
  const row = await tx.webPage.findFirst({ where: { slug, status: 'published', deletedAt: null } });
  if (row === null) return null;
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    published_at: (row.publishedAt ?? row.updatedAt).toISOString(),
  };
}

@Injectable()
export class Pages {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<Page[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.webPage.findMany({
        where: { deletedAt: null },
        orderBy: [{ title: 'asc' }],
        take: 200,
      });
      const refs = await userRefs(
        tx,
        rows.map((row) => row.updatedBy),
      );
      return rows.map((row) => pageView(row, refs));
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SavePage): Promise<string> {
    const actor = webActorOf(principal, this.clock.now(), meta);
    try {
      return await this.database.withTenant(principal, async (tx) => {
        const row = await tx.webPage.create({
          data: { tenantId: actor.tenantId, ...pageData(input) },
        });
        await recordWebChange(tx, actor, {
          action: 'web.page.create',
          event: 'web.page.created',
          entityType: 'web_page',
          entityId: row.id,
          changes: { slug: row.slug, title: row.title },
        });
        return row.id;
      });
    } catch (error) {
      throw isUniqueViolation(error) ? slugTaken() : error;
    }
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SavePage,
  ): Promise<void> {
    const actor = webActorOf(principal, this.clock.now(), meta);
    try {
      await this.database.withTenant(principal, async (tx) => {
        const { count } = await tx.webPage.updateMany({
          where: { id: target.id, version: target.version, deletedAt: null },
          data: pageData(input),
        });
        if (count !== 1) {
          const exists = await tx.webPage.count({ where: { id: target.id, deletedAt: null } });
          throw exists === 0 ? webNotFound('La página no existe.') : versionConflict();
        }
        await recordWebChange(tx, actor, {
          action: 'web.page.update',
          event: 'web.page.updated',
          entityType: 'web_page',
          entityId: target.id,
          changes: { slug: input.slug, title: input.title },
        });
      });
    } catch (error) {
      throw isUniqueViolation(error) ? slugTaken() : error;
    }
  }

  /** Publicar o retirar. Retirar una página que no está publicada no tiene sentido. */
  async act(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: PageAction,
  ): Promise<void> {
    const actor = webActorOf(principal, this.clock.now(), meta);
    const publish = input.action === 'publish';
    await this.database.withTenant(principal, async (tx) => {
      const { count } = await tx.webPage.updateMany({
        where: {
          id: target.id,
          version: target.version,
          deletedAt: null,
          status: publish ? { not: 'published' } : 'published',
        },
        data: publish ? { status: 'published', publishedAt: actor.at } : { status: 'withdrawn' },
      });
      if (count !== 1) {
        const row = await tx.webPage.findFirst({ where: { id: target.id, deletedAt: null } });
        if (row === null) throw webNotFound('La página no existe.');
        if (row.version !== target.version) throw versionConflict();
        throw webConflict(
          publish ? 'La página ya está publicada.' : 'La página no está publicada.',
        );
      }
      await recordWebChange(tx, actor, {
        action: publish ? 'web.page.publish' : 'web.page.withdraw',
        event: publish ? 'web.page.published' : 'web.page.withdrawn',
        entityType: 'web_page',
        entityId: target.id,
        changes: { status: publish ? 'published' : 'withdrawn' },
      });
    });
  }
}
