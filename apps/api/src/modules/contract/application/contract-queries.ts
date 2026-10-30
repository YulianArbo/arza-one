import { Inject, Injectable } from '@nestjs/common';
import type {
  ContractDetail,
  ContractDocument,
  ContractListQuery,
  ContractListResponse,
  ContractOptions,
  ContractOptionsQuery,
  DownloadLinkResponse,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { acceptedQuote, type ContractQuote } from '../../crm/index.js';
import { AttachedFileLinks } from '../../doc/index.js';
import { commercialParties, contractParty, matchingPartyIds } from '../../party/index.js';
import { activeTemplates } from './clause-library.js';
import { pdfNotReady } from './contract-messages.js';
import { findVisibleContract, visibleContracts } from './contract-records.js';
import { peopleNames } from './contract-support.js';
import { detailView, summaryView } from './contract-views.js';

// Lista y ficha de los contratos (B24), lo que necesita el asistente y los PDF para descargar.

async function searchOf(
  tx: TenantTransaction,
  query: ContractListQuery,
): Promise<Prisma.CtrContractWhereInput> {
  const filters: Prisma.CtrContractWhereInput = {
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.kind === undefined ? {} : { kind: query.kind }),
    ...(query.party_id === undefined ? {} : { partyId: query.party_id }),
  };
  if (query.q === undefined) return filters;
  const contains = { contains: query.q, mode: 'insensitive' } as const;
  const partyIds = await matchingPartyIds(tx, query.q);
  return {
    ...filters,
    OR: [{ code: contains }, { title: contains }, { partyId: { in: partyIds } }],
  };
}

function quoteOption(quote: ContractQuote, partyName: string): ContractOptions['quote'] {
  return {
    id: quote.id,
    code: quote.code,
    version_number: quote.versionNumber,
    party: { id: quote.partyId, name: partyName },
    title: quote.title,
    object: quote.object,
    value: quote.total,
    payment_terms: quote.paymentTerms,
  };
}

@Injectable()
export class ContractQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: ContractListQuery,
  ): Promise<ContractListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.ctrContract.findMany({
        where: {
          deletedAt: null,
          AND: [visibleContracts(principal, ability), await searchOf(tx, query)],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      const [parties, names] = await Promise.all([
        commercialParties(
          tx,
          page.map((row) => row.partyId),
        ),
        peopleNames(
          tx,
          page.map((row) => row.responsibleId),
        ),
      ]);
      return {
        data: page.map((row) => summaryView(row, parties, names)),
        next_cursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  /** La ficha completa del contrato: su expediente. */
  async detail(principal: Principal, ability: AppAbility, id: string): Promise<ContractDetail> {
    return this.database.withTenant(principal, async (tx) =>
      detailView(tx, await findVisibleContract(tx, ability, id)),
    );
  }

  /** Plantillas, quién firma por el cliente y la cotización aceptada, para el asistente. */
  async options(principal: Principal, query: ContractOptionsQuery): Promise<ContractOptions> {
    return this.database.withTenant(principal, async (tx) => {
      const quote = query.quote_id === undefined ? null : await acceptedQuote(tx, query.quote_id);
      const partyId = quote?.partyId ?? query.party_id;
      const party = partyId === undefined ? null : await contractParty(tx, partyId);
      return {
        templates: await activeTemplates(tx),
        signers: party?.signers.map((signer) => ({ ...signer })) ?? [],
        quote: quote === null ? null : quoteOption(quote, party?.name ?? 'Cliente'),
      };
    });
  }

  /** Enlace temporal del PDF aprobado o de la copia firmada del contrato. */
  async pdfLink(
    principal: Principal,
    ability: AppAbility,
    id: string,
    document: ContractDocument,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const contract = await findVisibleContract(tx, ability, id);
      const fileId = document === 'signed' ? contract.signedFileId : contract.pdfFileId;
      if (fileId === null) throw pdfNotReady();
      return this.links.issue(tx, principal, fileId, meta);
    });
  }

  /** Enlace temporal del PDF aprobado o de la copia firmada de un otrosí. */
  async amendmentPdfLink(
    principal: Principal,
    ability: AppAbility,
    target: { readonly contractId: string; readonly id: string },
    document: ContractDocument,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleContract(tx, ability, target.contractId);
      const amendment = await tx.ctrAmendment.findFirst({
        where: { id: target.id, contractId: target.contractId, deletedAt: null },
      });
      const fileId = document === 'signed' ? amendment?.signedFileId : amendment?.pdfFileId;
      if (fileId === null || fileId === undefined) throw pdfNotReady();
      return this.links.issue(tx, principal, fileId, meta);
    });
  }
}
