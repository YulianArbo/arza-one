import { Inject, Injectable } from '@nestjs/common';
import {
  versionStatusSchema,
  type ObsoleteVersionRequest,
  type PublishVersionRequest,
  type RejectVersionRequest,
} from '@arza/contracts';

import type { DocDocument, DocVersion, Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { allowedActions, VERSION_TRANSITIONS, type VersionStep } from '../domain/document-rules.js';
import { selfApproval, transitionNotAllowed } from './doc-messages.js';
import {
  actorOf,
  auditDoc,
  lockDocument,
  readerOf,
  type DocActor,
  type DocReader,
} from './doc-support.js';
import { findVisibleVersion } from './versions.js';

// Pasos del ciclo de una versión (B18, ficha 17.4). Publicar deja obsoleta la vigente anterior en
// la misma transacción: nunca hay dos vigentes. Quien elabora no aprueba ni devuelve. En B19
// estos pasos los dará la Solicitud de Acción Documental con su flujo.

export interface StepTarget {
  readonly id: string;
  readonly version: number;
}

interface StepContext {
  readonly tx: TenantTransaction;
  readonly actor: DocActor;
  readonly document: DocDocument;
  readonly version: DocVersion;
}

function assertStep(step: VersionStep, version: DocVersion, reader: DocReader): void {
  const isAuthor = version.createdBy === reader.userId;
  const status = versionStatusSchema.parse(version.status);
  const state = { status, pdfReady: version.renderStatus === 'ready' };
  if (allowedActions(state, { ...reader, isAuthor }).includes(step)) return;
  const reviews = step === 'approve' || step === 'reject';
  if (reviews && isAuthor && version.status === VERSION_TRANSITIONS[step].from)
    throw selfApproval();
  throw transitionNotAllowed();
}

async function moveVersion(
  context: StepContext,
  step: VersionStep,
  data: Prisma.DocVersionUpdateManyMutationInput,
): Promise<void> {
  const { from, to } = VERSION_TRANSITIONS[step];
  const { count } = await context.tx.docVersion.updateMany({
    where: { id: context.version.id, status: from },
    data: { ...data, status: to },
  });
  if (count === 0) throw transitionNotAllowed();
}

async function auditStep(
  context: StepContext,
  step: VersionStep,
  changes: Prisma.InputJsonObject = {},
): Promise<void> {
  await auditDoc(context.tx, context.actor, {
    action: `doc.version.${step}`,
    entityType: 'doc_version',
    entityId: context.version.id,
    changes: {
      code: context.document.code,
      label: context.version.versionLabel,
      from: VERSION_TRANSITIONS[step].from,
      to: VERSION_TRANSITIONS[step].to,
      ...changes,
    },
  });
}

/** La vigente anterior pasa a obsoleta y el documento toma los datos de la nueva. */
async function publishVersion(context: StepContext, effectiveDate: string): Promise<void> {
  const { tx, actor, document, version } = context;
  const previous = await tx.docVersion.findFirst({
    where: { documentId: document.id, status: 'current', deletedAt: null },
  });
  if (previous !== null) {
    await tx.docVersion.update({
      where: { id: previous.id },
      data: { status: 'obsolete', obsoletedAt: actor.at },
    });
  }
  await moveVersion(context, 'publish', {
    publishedAt: actor.at,
    effectiveDate: fromCalendarDate(effectiveDate),
  });
  await tx.docDocument.update({
    where: { id: document.id },
    data: {
      status: 'current',
      currentVersionId: version.id,
      title: version.title,
      classification: version.classification,
      ownerPositionId: version.ownerPositionId,
    },
  });
  await auditStep(context, 'publish', {
    effective_date: effectiveDate,
    replaced_label: previous?.versionLabel ?? null,
  });
}

@Injectable()
export class VersionActionsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async submit(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, ability, target, meta, 'submit', async (context) => {
      await moveVersion(context, 'submit', { submittedAt: context.actor.at, reviewNote: null });
      await auditStep(context, 'submit');
    });
  }

  async reject(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    input: RejectVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, ability, target, meta, 'reject', async (context) => {
      await moveVersion(context, 'reject', { submittedAt: null, reviewNote: input.note });
      await auditStep(context, 'reject', { note: input.note });
    });
  }

  async approve(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, ability, target, meta, 'approve', async (context) => {
      await moveVersion(context, 'approve', {
        approvedBy: principal.userId,
        approvedAt: context.actor.at,
      });
      await auditStep(context, 'approve');
    });
  }

  async publish(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    input: PublishVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, ability, target, meta, 'publish', async (context) => {
      await publishVersion(context, input.effective_date ?? bogotaToday(context.actor.at));
    });
  }

  /** El documento deja de regir: su vigente pasa a obsoleta y ya no la descargan los usuarios. */
  async obsolete(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    input: ObsoleteVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, ability, target, meta, 'obsolete', async (context) => {
      await moveVersion(context, 'obsolete', { obsoletedAt: context.actor.at });
      await context.tx.docDocument.update({
        where: { id: context.document.id },
        data: { status: 'obsolete' },
      });
      await auditStep(context, 'obsolete', { reason: input.reason });
    });
  }

  /** Revisa el permiso y la versión vista, con el documento bloqueado, y da el paso. */
  private async run(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    meta: RequestMeta,
    step: VersionStep,
    apply: (context: StepContext) => Promise<void>,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const found = await findVisibleVersion(tx, reader, target.id);
      assertStep(step, found.version, reader);
      await lockDocument(tx, actor.tenantId, found.document.id);
      const version = await tx.docVersion.findUniqueOrThrow({ where: { id: target.id } });
      if (version.version !== target.version) throw versionConflict();
      await apply({ tx, actor, document: found.document, version });
    });
  }
}
