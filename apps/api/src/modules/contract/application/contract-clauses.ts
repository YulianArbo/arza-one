import type { ContractClauseRequest, ContractValues } from '@arza/contracts';

import type { CtrTemplate } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  composeClauses,
  templateRequest,
  type ComposedClause,
  type LibraryClause,
  type TemplateEntry,
} from '../domain/clause-composition.js';
import { asClauseError, templateInvalid } from './contract-messages.js';

// Las cláusulas de la biblioteca y de la plantilla, y el texto del contrato cláusula por cláusula
// (B24). El borrador usa siempre la versión vigente de cada cláusula; el contrato aprobado conserva
// la que usó.

/** La versión vigente (la más alta) de cada cláusula de la biblioteca. */
export async function currentLibrary(tx: TenantTransaction): Promise<Map<string, LibraryClause>> {
  const rows = await tx.ctrClause.findMany({
    where: { deletedAt: null },
    orderBy: [{ key: 'asc' }, { clauseVersion: 'asc' }],
  });
  return new Map(
    rows.map((row) => [
      row.key,
      {
        key: row.key,
        version: row.clauseVersion,
        title: row.title,
        body: row.body,
        numbered: row.numbered,
      },
    ]),
  );
}

export async function activeTemplate(tx: TenantTransaction, id: string): Promise<CtrTemplate> {
  const template = await tx.ctrTemplate.findFirst({
    where: { id, isActive: true, deletedAt: null },
  });
  if (template === null) throw templateInvalid();
  return template;
}

export async function templateEntries(
  tx: TenantTransaction,
  templateId: string,
): Promise<TemplateEntry[]> {
  const rows = await tx.ctrTemplateClause.findMany({
    where: { templateId, deletedAt: null },
    orderBy: { position: 'asc' },
  });
  return rows.map((row) => ({ key: row.clauseKey, required: row.required }));
}

/**
 * Arma el texto del contrato. Sin cláusulas pedidas, toma las de la plantilla tal como vienen: es
 * el contrato recién generado, idéntico al modelo salvo las variables.
 */
export async function buildClauses(
  tx: TenantTransaction,
  templateId: string,
  requested: readonly ContractClauseRequest[] | null,
  values: ContractValues,
): Promise<ComposedClause[]> {
  const [library, template] = await Promise.all([
    currentLibrary(tx),
    templateEntries(tx, templateId),
  ]);
  try {
    const clauses = requested ?? templateRequest(template, library);
    return composeClauses(clauses, template, library, values);
  } catch (error) {
    throw asClauseError(error);
  }
}

/** Reemplaza el texto del borrador: las cláusulas anteriores quedan borradas lógicamente. */
export async function replaceClauses(
  tx: TenantTransaction,
  contract: { readonly id: string; readonly tenantId: string },
  clauses: readonly ComposedClause[],
  at: Date,
): Promise<void> {
  await tx.ctrContractClause.updateMany({
    where: { contractId: contract.id, deletedAt: null },
    data: { deletedAt: at },
  });
  await tx.ctrContractClause.createMany({
    data: clauses.map((clause) => ({
      ...clause,
      tenantId: contract.tenantId,
      contractId: contract.id,
    })),
  });
}
