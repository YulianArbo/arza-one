import {
  AMENDMENT_KINDS,
  CONTRACT_KINDS,
  amendmentKindSchema,
  clauseOrdinal,
  contractKindSchema,
} from '@arza/contracts';
import {
  contractDocumentBody,
  institutionalFooter,
  institutionalHeader,
  pesos,
  printPage,
  printedDate,
  type ContractDocumentClause,
  type ContractSignature,
} from '@arza/templates';
import { z } from 'zod';

import type { CtrAmendment, CtrContract } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { companyIdentity, toCalendarDate } from '../../core/index.js';

// El PDF definitivo de un contrato aprobado y el de cada otrosí (B24), listos para que Gotenberg los
// convierta con el encabezado y el pie institucionales. Se arman una sola vez, al aprobarse: el
// texto es el que la Dirección aprobó y ya no cambia.

/** Lo que Gotenberg necesita para convertir una página HTML (doc/gotenberg-converter). */
export interface ContractHtml {
  readonly index: string;
  readonly header: string;
  readonly footer: string;
  readonly landscape: boolean;
}

const storedValuesSchema = z.record(z.string(), z.string());

function signaturesOf(contract: CtrContract, company: { legalName: string; taxId: string }) {
  const values = storedValuesSchema.parse(contract.variableValues);
  const client = values['cliente_nombre'] ?? '';
  const nda = contract.kind === 'nda';
  const signatures: ContractSignature[] = [
    {
      role: nda ? `POR ${client.toUpperCase()}` : 'EL CONTRATANTE',
      name: contract.clientSignerName,
      detail: `${contract.clientSignerDocument} · ${client}`,
    },
    {
      role: nda ? `POR ${company.legalName.toUpperCase()}` : 'EL CONTRATISTA',
      name: 'Representante legal',
      detail: `${company.legalName} · NIT ${company.taxId}`,
    },
  ];
  return signatures;
}

async function frameOf(tx: TenantTransaction, contract: CtrContract) {
  const [company, template] = await Promise.all([
    companyIdentity(tx),
    tx.ctrTemplate.findFirstOrThrow({ where: { id: contract.templateId } }),
  ]);
  const format = {
    code: template.code,
    name: template.name.toUpperCase(),
    version: template.formatVersion,
    date: '—',
  };
  return { company, template, header: institutionalHeader(format, company) };
}

export function contractFileName(contract: Pick<CtrContract, 'code'>): string {
  return `${contract.code}.pdf`;
}

/** El contrato aprobado, cláusula por cláusula. */
export async function contractHtml(
  tx: TenantTransaction,
  contract: CtrContract,
): Promise<ContractHtml> {
  const [{ company, template, header }, rows] = await Promise.all([
    frameOf(tx, contract),
    tx.ctrContractClause.findMany({
      where: { contractId: contract.id, deletedAt: null },
      orderBy: { position: 'asc' },
    }),
  ]);
  let numbered = 0;
  const clauses: ContractDocumentClause[] = rows.map((row) => {
    if (row.numbered) numbered += 1;
    return {
      ordinal: row.numbered ? clauseOrdinal(numbered) : null,
      title: row.title,
      body: row.body,
    };
  });
  const body = contractDocumentBody({
    heading: template.name.toUpperCase(),
    code: contract.code,
    clauses,
    closing: 'Para constancia, las partes firman este documento en la fecha de la última firma.',
    signatures: signaturesOf(contract, company),
  });
  return {
    index: printPage(`${template.name} ${contract.code}`, body),
    header,
    footer: institutionalFooter(company, contract.code),
    landscape: false,
  };
}

function amendmentClauses(
  contract: CtrContract,
  amendment: CtrAmendment,
): ContractDocumentClause[] {
  const kind = CONTRACT_KINDS[contractKindSchema.parse(contract.kind)].toLowerCase();
  const values = storedValuesSchema.parse(contract.variableValues);
  const changes = [
    amendment.newEndsOn === null
      ? null
      : `La nueva fecha de terminación es el ${printedDate(toCalendarDate(amendment.newEndsOn))}.`,
    amendment.newValue === null
      ? null
      : `El nuevo valor total es de ${pesos(amendment.newValue.toFixed(2))}.`,
  ].filter((line): line is string => line !== null);
  return [
    {
      ordinal: null,
      title: 'Partes',
      body: `${values['empresa_razon_social'] ?? ''} y ${values['cliente_nombre'] ?? ''}, partes del ${kind} ${contract.code}, acuerdan lo siguiente.`,
    },
    { ordinal: clauseOrdinal(1), title: amendment.summary, body: amendment.body },
    {
      ordinal: clauseOrdinal(2),
      title: 'Vigencia',
      body: [
        `Este documento rige desde el ${printedDate(toCalendarDate(amendment.effectiveOn))}.`,
        ...changes,
      ].join('\n'),
    },
    {
      ordinal: clauseOrdinal(3),
      title: 'Lo demás',
      body: `Las demás cláusulas del ${kind} ${contract.code} continúan sin cambios.`,
    },
  ];
}

export function amendmentFileName(amendment: Pick<CtrAmendment, 'code'>): string {
  return `${amendment.code}.pdf`;
}

/** El otrosí o la prórroga aprobados. */
export async function amendmentHtml(
  tx: TenantTransaction,
  contract: CtrContract,
  amendment: CtrAmendment,
): Promise<ContractHtml> {
  const { company, header } = await frameOf(tx, contract);
  const label = AMENDMENT_KINDS[amendmentKindSchema.parse(amendment.kind)].toUpperCase();
  const body = contractDocumentBody({
    heading: `${label} No. ${String(amendment.sequence).padStart(2, '0')} AL ${contract.code}`,
    code: amendment.code,
    clauses: amendmentClauses(contract, amendment),
    closing: 'Para constancia, las partes firman este documento en la fecha de la última firma.',
    signatures: signaturesOf(contract, company),
  });
  return {
    index: printPage(`${label} ${amendment.code}`, body),
    header,
    footer: institutionalFooter(company, amendment.code),
    landscape: false,
  };
}
