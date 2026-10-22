import { Inject, Injectable } from '@nestjs/common';
import {
  retentionDispositionSchema,
  type CreateRetentionRule,
  type DocumentRetention,
  type RetentionRule,
  type RetentionRuleListResponse,
  type SetDocumentRetentionRule,
  type UnassignedDocumentsResponse,
  type UpdateRetentionRule,
} from '@arza/contracts';

import { Prisma, type DocRetentionRule } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, catalogLabels, orgUnitsById } from '../../core/index.js';
import { activeProcess, assertDocumentType, DOCUMENT_TYPES_CATALOG } from './doc-references.js';
import { actorOf, auditDoc, readerOf, type DocActor } from './doc-support.js';
import { findVisibleDocument } from './documents.js';
import {
  documentDisposed,
  retentionRuleConflict,
  retentionRuleNotFound,
} from './retention-messages.js';
import { documentsPerRule, documentsWithoutRule, retentionFacts } from './retention-support.js';

// Tabla de retención (B21, RE-SGC-005): Calidad crea y edita las series con sus años y su
// disposición final. Cada documento toma la regla de su tipo y su proceso; Calidad puede darle
// otra como excepción. Cuántos documentos quedan sin regla es la evidencia del capítulo 18.2.

const UNASSIGNED_SHOWN = 100;

type RuleInput = CreateRetentionRule | UpdateRetentionRule;

/** Dos reglas con el mismo código o activas para el mismo tipo y proceso: decide el índice. */
function conflictOnDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw retentionRuleConflict();
  }
  throw error;
}

async function checkReferences(tx: TenantTransaction, input: RuleInput): Promise<void> {
  if (input.doc_type !== null) await assertDocumentType(tx, input.doc_type);
  if (input.process_id !== null) await activeProcess(tx, input.process_id);
}

function ruleData(input: RuleInput) {
  return {
    name: input.name,
    docType: input.doc_type,
    processId: input.process_id,
    activeYears: input.active_years,
    archiveYears: input.archive_years,
    disposition: input.disposition,
    legalBasis: input.legal_basis,
  };
}

function auditedRule(rule: DocRetentionRule) {
  return {
    code: rule.code,
    name: rule.name,
    doc_type: rule.docType,
    process_id: rule.processId,
    active_years: rule.activeYears,
    archive_years: rule.archiveYears,
    disposition: rule.disposition,
    is_active: rule.isActive,
  };
}

async function auditRule(
  tx: TenantTransaction,
  actor: DocActor,
  action: 'create' | 'update',
  rule: DocRetentionRule,
  before: DocRetentionRule | null,
): Promise<void> {
  await auditDoc(tx, actor, {
    action: `doc.retention_rule.${action}`,
    entityType: 'doc_retention_rule',
    entityId: rule.id,
    changes:
      before === null
        ? auditedRule(rule)
        : { before: auditedRule(before), after: auditedRule(rule) },
  });
}

async function ruleViews(
  tx: TenantTransaction,
  rules: readonly DocRetentionRule[],
  counts: ReadonlyMap<string | null, number>,
): Promise<RetentionRule[]> {
  const types = await catalogLabels(tx, DOCUMENT_TYPES_CATALOG);
  const processIds = rules.flatMap((rule) => (rule.processId === null ? [] : [rule.processId]));
  const processes = await orgUnitsById(tx, processIds);
  return rules.map((rule) => {
    const process = rule.processId === null ? undefined : processes.get(rule.processId);
    return {
      id: rule.id,
      code: rule.code,
      name: rule.name,
      doc_type: rule.docType,
      doc_type_label: rule.docType === null ? null : (types.get(rule.docType) ?? rule.docType),
      process:
        process === undefined ? null : { id: process.id, code: process.code, name: process.name },
      active_years: rule.activeYears,
      archive_years: rule.archiveYears,
      disposition: retentionDispositionSchema.parse(rule.disposition),
      legal_basis: rule.legalBasis,
      is_active: rule.isActive,
      documents: counts.get(rule.id) ?? 0,
      version: rule.version,
    };
  });
}

async function findRule(tx: TenantTransaction, id: string): Promise<DocRetentionRule> {
  const rule = await tx.docRetentionRule.findFirst({ where: { id, deletedAt: null } });
  if (rule === null) throw retentionRuleNotFound();
  return rule;
}

@Injectable()
export class RetentionRulesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<RetentionRuleListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rules = await tx.docRetentionRule.findMany({
        where: { deletedAt: null },
        orderBy: { code: 'asc' },
      });
      const counts = await documentsPerRule(tx);
      return {
        data: await ruleViews(tx, rules, counts),
        unassigned_documents: counts.get(null) ?? 0,
      };
    });
  }

  async unassigned(principal: Principal): Promise<UnassignedDocumentsResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await documentsWithoutRule(tx, UNASSIGNED_SHOWN);
      const total = (await documentsPerRule(tx)).get(null) ?? 0;
      const data = rows.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        doc_type: row.docType,
      }));
      return { data, total };
    });
  }

  async create(
    principal: Principal,
    input: CreateRetentionRule,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database
      .withTenant(principal, async (tx) => {
        await checkReferences(tx, input);
        const rule = await tx.docRetentionRule.create({
          data: { tenantId: actor.tenantId, code: input.code, ...ruleData(input) },
        });
        await auditRule(tx, actor, 'create', rule, null);
        return rule.id;
      })
      .catch(conflictOnDuplicate);
  }

  async update(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: UpdateRetentionRule,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database
      .withTenant(principal, async (tx) => {
        const before = await findRule(tx, target.id);
        if (before.version !== target.version) throw versionConflict();
        await checkReferences(tx, input);
        const rule = await tx.docRetentionRule.update({
          where: { id: before.id },
          data: { ...ruleData(input), isActive: input.is_active },
        });
        await auditRule(tx, actor, 'update', rule, before);
      })
      .catch(conflictOnDuplicate);
  }

  /** La retención de un documento que la persona puede ver. */
  async ofDocument(
    principal: Principal,
    ability: AppAbility,
    documentId: string,
  ): Promise<DocumentRetention> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const document = await findVisibleDocument(tx, reader, documentId);
      const facts = (await retentionFacts(tx, [document.id])).get(document.id);
      const ruleId = facts?.ruleId ?? null;
      const rule = ruleId === null ? null : await findRule(tx, ruleId);
      const dueOn = facts?.dueOn ?? null;
      return {
        rule:
          rule === null
            ? null
            : {
                id: rule.id,
                code: rule.code,
                name: rule.name,
                active_years: rule.activeYears,
                archive_years: rule.archiveYears,
                disposition: retentionDispositionSchema.parse(rule.disposition),
              },
        explicit: rule !== null && rule.id === document.retentionRuleId,
        base_on: facts?.baseOn ?? null,
        due_on: dueOn,
        expired: dueOn !== null && dueOn <= today,
        version: document.version,
      };
    });
  }

  /** Regla de excepción de un documento; null vuelve a la de su tipo y su proceso. */
  async setForDocument(
    request: { principal: Principal; ability: AppAbility; meta: RequestMeta },
    target: { readonly id: string; readonly version: number },
    input: SetDocumentRetentionRule,
  ): Promise<void> {
    const { principal, ability, meta } = request;
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const document = await findVisibleDocument(tx, reader, target.id);
      if (document.status === 'disposed') throw documentDisposed();
      if (document.version !== target.version) throw versionConflict();
      const ruleId = input.retention_rule_id;
      if (ruleId !== null && !(await findRule(tx, ruleId)).isActive) throw retentionRuleNotFound();
      await tx.docDocument.update({
        where: { id: document.id },
        data: { retentionRuleId: ruleId },
      });
      await auditDoc(tx, actor, {
        action: 'doc.document.retention_rule',
        entityType: 'doc_document',
        entityId: document.id,
        changes: { code: document.code, from: document.retentionRuleId, to: ruleId },
      });
    });
  }
}
