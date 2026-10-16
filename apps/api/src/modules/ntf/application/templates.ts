import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_KINDS,
  type NotificationKind,
  type NotificationTemplate as TemplateView,
  type UpdateNotificationTemplateRequest,
} from '@arza/contracts';

import type { NotificationTemplate } from '../../../generated/prisma/client.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { DEFAULT_TEMPLATES, unknownVariables } from '../domain/templates.js';
import { auditNtf } from './ntf-audit.js';
import { templateInvalid, templateNotFound } from './ntf-messages.js';

// Plantillas institucionales de los avisos (B16). Cada cambio agrega una versión; la vigente es la
// de número mayor y cada correo guarda con qué versión se escribió.

function isKind(key: string): key is NotificationKind {
  return key in NOTIFICATION_KINDS;
}

/** La versión vigente de cada plantilla de la empresa. */
export async function currentTemplates(
  tx: TenantTransaction,
): Promise<Map<NotificationKind, NotificationTemplate>> {
  const rows = await tx.notificationTemplate.findMany({
    where: { deletedAt: null },
    orderBy: [{ key: 'asc' }, { versionNumber: 'desc' }],
  });
  const current = new Map<NotificationKind, NotificationTemplate>();
  for (const row of rows) {
    if (isKind(row.key) && !current.has(row.key)) current.set(row.key, row);
  }
  return current;
}

function templateView(row: NotificationTemplate & { key: NotificationKind }): TemplateView {
  const kind = NOTIFICATION_KINDS[row.key];
  return {
    kind: row.key,
    label: kind.label,
    variables: [...kind.variables],
    subject: row.subject,
    body: row.body,
    urgent: row.urgent,
    version: row.versionNumber,
    updated_at: row.createdAt.toISOString(),
  };
}

/** Plantillas con las que nace la empresa; no toca las que ya existen. Devuelve las creadas. */
async function createMissingTemplates(tx: TenantTransaction, tenantId: string): Promise<string[]> {
  const existing = await currentTemplates(tx);
  const missing = NOTIFICATION_KIND_KEYS.filter((kind) => !existing.has(kind));
  await tx.notificationTemplate.createMany({
    data: missing.map((kind) => ({
      tenantId,
      key: kind,
      versionNumber: 1,
      ...DEFAULT_TEMPLATES[kind],
    })),
  });
  return missing;
}

/** Semilla: las plantillas de cada empresa, en una transacción corta por empresa. */
export async function seedNotificationTemplates(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const actor = { tenantId, userId: null, meta: null, at: clock.now() };
    await database.withTenant(actor, async (tx) => {
      const created = await createMissingTemplates(tx, tenantId);
      if (created.length === 0) return;
      await auditNtf(tx, actor, {
        action: 'ntf.template.seed',
        entityType: 'ntf_template',
        entityId: null,
        changes: { kinds: created },
      });
    });
  }
}

function isDuplicate(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class TemplatesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<TemplateView[]> {
    const current = await this.database.withTenant(principal, currentTemplates);
    return NOTIFICATION_KIND_KEYS.flatMap((kind) => {
      const row = current.get(kind);
      return row === undefined ? [] : [templateView({ ...row, key: kind })];
    });
  }

  /** Guarda una versión nueva si nadie la cambió entretanto (If-Match con la versión vista). */
  async update(
    principal: Principal,
    kind: NotificationKind,
    version: number,
    input: UpdateNotificationTemplateRequest,
    meta: RequestMeta,
  ): Promise<TemplateView> {
    const unknown = unknownVariables(kind, [input.subject, input.body]);
    if (unknown.length > 0) throw templateInvalid(unknown);
    try {
      return await this.database.withTenant(principal, async (tx) => {
        const current = (await currentTemplates(tx)).get(kind);
        if (current === undefined) throw templateNotFound();
        if (current.versionNumber !== version) throw versionConflict();
        const created = await tx.notificationTemplate.create({
          data: { tenantId: principal.tenantId, key: kind, versionNumber: version + 1, ...input },
        });
        const { subject, body, urgent } = current;
        await auditNtf(
          tx,
          { ...principal, meta, at: this.clock.now() },
          {
            action: 'ntf.template.update',
            entityType: 'ntf_template',
            entityId: created.id,
            changes: {
              kind,
              version: version + 1,
              ...changesBetween({ subject, body, urgent }, input),
            },
          },
        );
        return templateView({ ...created, key: kind });
      });
    } catch (error) {
      // Dos personas guardaron la misma versión a la vez: la segunda debe recargar.
      throw isDuplicate(error) ? versionConflict() : error;
    }
  }
}
