import { Inject, Injectable } from '@nestjs/common';
import {
  contractKindSchema,
  unknownVariables,
  type ClauseList,
  type ClauseVersionRequest,
  type ContractTemplate,
  type CreateClauseRequest,
} from '@arza/contracts';

import type { CtrClause } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { clauseKeyTaken, clauseVariablesUnknown, contractNotFound } from './contract-messages.js';
import {
  contractActorOf,
  peopleNames,
  personRef,
  recordContractChange,
  type ContractActor,
} from './contract-support.js';

// Biblioteca de cláusulas aprobadas (B24, ficha 17.7). Solo la Dirección la administra: lo que
// agrega o cambia queda aprobado por ella. Cambiar una cláusula crea su versión siguiente; los
// contratos ya aprobados conservan la que usaron.

function assertVariables(body: string): void {
  const unknown = unknownVariables(body);
  if (unknown.length > 0) throw clauseVariablesUnknown(unknown);
}

/** Las plantillas activas con sus cláusulas, en orden. */
export async function activeTemplates(tx: TenantTransaction): Promise<ContractTemplate[]> {
  const [templates, library] = await Promise.all([
    tx.ctrTemplate.findMany({
      where: { isActive: true, deletedAt: null },
      include: { clauses: { where: { deletedAt: null }, orderBy: { position: 'asc' } } },
      orderBy: { code: 'asc' },
    }),
    latestByKey(tx),
  ]);
  return templates.map((template) => ({
    id: template.id,
    code: template.code,
    name: template.name,
    kind: contractKindSchema.parse(template.kind),
    version: template.formatVersion,
    clauses: template.clauses.map((entry) => ({
      key: entry.clauseKey,
      title: library.get(entry.clauseKey)?.title ?? entry.clauseKey,
      required: entry.required,
    })),
  }));
}

async function latestByKey(tx: TenantTransaction): Promise<Map<string, CtrClause>> {
  const rows = await tx.ctrClause.findMany({
    where: { deletedAt: null },
    orderBy: [{ key: 'asc' }, { clauseVersion: 'asc' }],
  });
  return new Map(rows.map((row) => [row.key, row]));
}

@Injectable()
export class ClauseLibraryUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ContractActor {
    return contractActorOf(principal, meta, this.clock.now());
  }

  /** La versión vigente de cada cláusula y las plantillas que la usan. */
  async list(principal: Principal): Promise<ClauseList> {
    return this.database.withTenant(principal, async (tx) => {
      const [library, templates] = await Promise.all([latestByKey(tx), activeTemplates(tx)]);
      const clauses = [...library.values()];
      const names = await peopleNames(
        tx,
        clauses.map((clause) => clause.approvedBy),
      );
      return {
        data: clauses.map((clause) => ({
          key: clause.key,
          version: clause.clauseVersion,
          title: clause.title,
          body: clause.body,
          numbered: clause.numbered,
          legal_validated: clause.legalValidated,
          approved_by: personRef(names, clause.approvedBy),
          approved_at: clause.approvedAt.toISOString(),
          templates: templates
            .filter((template) => template.clauses.some((entry) => entry.key === clause.key))
            .map((template) => template.code),
        })),
      };
    });
  }

  async create(principal: Principal, input: CreateClauseRequest, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    assertVariables(input.body);
    await this.database.withTenant(principal, async (tx) => {
      const taken = await tx.ctrClause.count({ where: { key: input.key } });
      if (taken > 0) throw clauseKeyTaken();
      await this.store(tx, actor, input.key, 1, input);
    });
  }

  /** Versión siguiente: la anterior queda para los contratos que la usaron. */
  async newVersion(
    principal: Principal,
    key: string,
    input: ClauseVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    assertVariables(input.body);
    await this.database.withTenant(principal, async (tx) => {
      const current = (await latestByKey(tx)).get(key);
      if (current === undefined) throw contractNotFound('La cláusula');
      await this.store(tx, actor, key, current.clauseVersion + 1, input);
    });
  }

  private async store(
    tx: TenantTransaction,
    actor: ContractActor,
    key: string,
    version: number,
    input: ClauseVersionRequest,
  ): Promise<void> {
    const clause = await tx.ctrClause.create({
      data: {
        tenantId: actor.tenantId,
        key,
        clauseVersion: version,
        title: input.title,
        body: input.body,
        numbered: input.numbered,
        legalValidated: input.legal_validated,
        approvedBy: actor.userId,
        approvedAt: actor.at,
      },
    });
    await recordContractChange(tx, actor, {
      action: version === 1 ? 'contract.clause.create' : 'contract.clause.version',
      event: 'contract.clause.approved',
      entityType: 'ctr_clause',
      entityId: clause.id,
      changes: {
        key,
        version,
        title: input.title,
        body: input.body,
        legal_validated: input.legal_validated,
      },
      payload: { key, version },
    });
  }
}
