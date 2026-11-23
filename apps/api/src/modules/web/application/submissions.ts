import { createHash } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  SITE_ERROR_CODES,
  maskEmail,
  siteFormKeySchema,
  type SiteFormKey,
  type Submission,
  type Unsubscribe,
  type UnsubscribeRequest,
  type UnsubscribeResult,
} from '@arza/contracts';
import { z } from 'zod';

import type { WebFormSubmission } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { recordWebAudit, recordWebChange, siteTenantId, type WebActor } from './web-support.js';

// Formularios recibidos y bajas de comunicaciones comerciales (B41, decisión 9). La llave de baja
// solo existe en el correo de acuse: aquí se guarda su huella y sirve una sola vez.

const dataSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  detail: z.string(),
  service: z.string().optional(),
  timeframe: z.string().optional(),
});

/** Huella de la llave de baja: lo único que se guarda. */
export function unsubscribeTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function linkInvalid(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    SITE_ERROR_CODES.linkInvalid,
    'El enlace de baja no es válido. Revise que lo copió completo del correo.',
  );
}

function submissionView(row: WebFormSubmission): Submission {
  const data = dataSchema.parse(row.data);
  return {
    id: row.id,
    code: row.code,
    form_key: siteFormKeySchema.parse(row.formKey),
    name: `${data.first_name} ${data.last_name}`,
    email: row.email,
    phone: data.phone,
    company: data.company,
    detail: data.detail,
    service: data.service ?? null,
    timeframe: data.timeframe ?? null,
    received_at: row.receivedAt.toISOString(),
    notice_version: row.noticeVersion,
    lead:
      row.createdLeadId === null
        ? null
        : { id: row.createdLeadId, code: row.createdLeadCode ?? '' },
    ack_sent_at: row.ackSentAt?.toISOString() ?? null,
  };
}

/** El correo se dio de baja de las comunicaciones comerciales (todo envío comercial lo consulta). */
export async function isUnsubscribed(tx: TenantTransaction, email: string): Promise<boolean> {
  const count = await tx.webUnsubscribe.count({
    where: { email: email.trim().toLowerCase(), deletedAt: null },
  });
  return count > 0;
}

async function recordUnsubscribe(
  tx: TenantTransaction,
  actor: WebActor,
  row: WebFormSubmission,
): Promise<boolean> {
  await tx.webFormSubmission.update({
    where: { id: row.id },
    data: { unsubscribeUsedAt: actor.at },
  });
  if (await isUnsubscribed(tx, row.email)) {
    // El correo ya estaba de baja por otro enlace: queda constancia de que se usó este.
    await recordWebAudit(tx, actor, {
      action: 'web.unsubscribe.link.use',
      entityType: 'web_form_submission',
      entityId: row.id,
      changes: { code: row.code, already: true },
    });
    return true;
  }
  const created = await tx.webUnsubscribe.create({
    data: {
      tenantId: actor.tenantId,
      email: row.email,
      source: 'ack_link',
      submissionId: row.id,
      unsubscribedAt: actor.at,
    },
  });
  await recordWebChange(tx, actor, {
    action: 'web.unsubscribe.record',
    event: 'web.unsubscribe.recorded',
    entityType: 'web_unsubscribe',
    entityId: created.id,
    changes: { source: 'ack_link', submission_code: row.code },
  });
  return false;
}

@Injectable()
export class Submissions {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Pick<Env, 'PUBLIC_SITE_TAX_ID'>,
  ) {}

  async list(principal: Principal, formKey: SiteFormKey | undefined): Promise<Submission[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.webFormSubmission.findMany({
        where: { deletedAt: null, ...(formKey === undefined ? {} : { formKey }) },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        take: 300,
      });
      return rows.map(submissionView);
    });
  }

  async unsubscribes(principal: Principal): Promise<Unsubscribe[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.webUnsubscribe.findMany({
        where: { deletedAt: null },
        orderBy: [{ unsubscribedAt: 'desc' }, { id: 'desc' }],
        take: 500,
      });
      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        source: row.source,
        unsubscribed_at: row.unsubscribedAt.toISOString(),
      }));
    });
  }

  /** Baja en un clic, sin sesión: la llave del correo sirve una sola vez. */
  async unsubscribe(input: UnsubscribeRequest, meta: RequestMeta): Promise<UnsubscribeResult> {
    const tenantId = await siteTenantId(this.database, this.config);
    if (tenantId === null) throw linkInvalid();
    const actor: WebActor = { tenantId, userId: null, at: this.clock.now(), meta };
    return this.database.withTenant({ tenantId, userId: null }, async (tx) => {
      const row = await tx.webFormSubmission.findFirst({
        where: { unsubscribeTokenHash: unsubscribeTokenHash(input.token), deletedAt: null },
      });
      if (row === null) throw linkInvalid();
      if (row.unsubscribeUsedAt !== null) return { email: maskEmail(row.email), already: true };
      const already = await recordUnsubscribe(tx, actor, row);
      return { email: maskEmail(row.email), already };
    });
  }
}
