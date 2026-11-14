import { Inject, Injectable } from '@nestjs/common';
import type {
  DownloadLinkResponse,
  PortalArticle,
  PortalArticleList,
  PortalContractList,
  PortalDocument,
  PortalDocumentKind,
  PortalDocumentList,
  PortalHome,
  PortalPqrsfList,
  PortalProjectDetail,
  PortalProjectList,
  PortalSignatureList,
  PortalTicketDetail,
  PortalTicketList,
} from '@arza/contracts';

import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  clientAmendmentFile,
  clientContractFile,
  clientContracts,
  clientSignatures,
  clientSignedDocuments,
} from '../../contract/index.js';
import { AttachedFileLinks } from '../../doc/index.js';
import { commercialParties } from '../../party/index.js';
import {
  clientAwaitingActs,
  clientProject,
  clientProjectDocuments,
  clientProjects,
  clientUpcomingMilestones,
} from '../../project/index.js';
import {
  clientArticle,
  clientArticles,
  clientPqrsf,
  clientTicket,
  clientTicketCounts,
  clientTickets,
} from '../../service/index.js';
import { PortalAccess, portalNotFound, type PortalContext } from './portal-access.js';
import { projectScope, serviceScope, signingRights } from './portal-scopes.js';

// Consultas del portal del cliente (B30, ficha 17.10): el inicio, proyectos, firmas, contratos,
// documentos, tiquetes, PQRSF y artículos de ayuda. Todo sale filtrado por la empresa cliente de la
// persona y, si es usuario del cliente, por lo que se le asignó. Lo de otra empresa «no existe».

interface Viewer {
  readonly principal: Principal;
  readonly ability: AppAbility;
}

async function documentsOf(tx: TenantTransaction, context: PortalContext) {
  const agreements = hasPermission(context.ability, 'portal.contract.read')
    ? await clientSignedDocuments(tx, context.partyId)
    : [];
  const { acts, shared } = await clientProjectDocuments(tx, projectScope(context));
  const rows: (PortalDocument & { readonly fileId: string })[] = [
    ...agreements.map((row) => ({ ...row, project: null })),
    ...acts.map((row) => ({ ...row, kind: 'acceptance' as const })),
    ...shared.map((row) => ({ ...row, kind: 'shared' as const })),
  ].map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    code: row.code,
    project: row.project,
    dated_at: row.datedAt.toISOString(),
    fileId: row.fileId,
  }));
  return rows.sort((a, b) => b.dated_at.localeCompare(a.dated_at));
}

@Injectable()
export class PortalQueries {
  constructor(
    @Inject(PortalAccess) private readonly access: PortalAccess,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  async home(viewer: Viewer): Promise<PortalHome> {
    return this.access.run(viewer, async (tx, context) => {
      const scope = projectScope(context);
      const canSign = hasPermission(context.ability, 'portal.contract.read');
      const [company, projects, milestones, approvals, tickets, signatures] = await Promise.all([
        commercialParties(tx, [context.partyId]),
        clientProjects(tx, scope),
        clientUpcomingMilestones(tx, scope, 5),
        clientAwaitingActs(tx, scope),
        clientTicketCounts(tx, serviceScope(context)),
        canSign
          ? clientSignatures(tx, this.signer(context), context.at)
          : { pending: [], recent: [] },
      ]);
      return {
        company: company.get(context.partyId)?.name ?? 'Su empresa',
        projects: projects.length,
        next_milestones: milestones.map((row) => ({
          project_id: row.projectId,
          project: row.project,
          name: row.name,
          due_on: row.dueOn,
        })),
        pending: {
          signatures: signatures.pending.filter((row) => row.my_turn).length,
          approvals,
          open_tickets: tickets.open,
          waiting_tickets: tickets.waiting,
        },
      };
    });
  }

  async projects(viewer: Viewer): Promise<PortalProjectList> {
    return this.access.run(viewer, async (tx, context) => ({
      data: await clientProjects(tx, projectScope(context)),
    }));
  }

  async project(viewer: Viewer, id: string): Promise<PortalProjectDetail> {
    return this.access.run(viewer, (tx, context) => clientProject(tx, projectScope(context), id));
  }

  async signatures(viewer: Viewer): Promise<PortalSignatureList> {
    return this.access.run(viewer, (tx, context) =>
      clientSignatures(tx, this.signer(context), context.at),
    );
  }

  async contracts(viewer: Viewer): Promise<PortalContractList> {
    return this.access.run(viewer, async (tx, context) => ({
      data: await clientContracts(tx, context.partyId),
    }));
  }

  /** Enlace temporal de la copia firmada de un contrato; queda registrado quién lo descargó. */
  async contractLink(viewer: Viewer, id: string, meta: RequestMeta): Promise<DownloadLinkResponse> {
    return this.access.run(viewer, async (tx, context) => {
      const fileId = await clientContractFile(tx, context.partyId, id);
      return this.links.issue(tx, viewer.principal, fileId, meta);
    });
  }

  async documents(viewer: Viewer): Promise<PortalDocumentList> {
    return this.access.run(viewer, async (tx, context) => ({
      data: (await documentsOf(tx, context)).map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        code: row.code,
        project: row.project,
        dated_at: row.dated_at,
      })),
    }));
  }

  /** Enlace temporal de un documento que la persona ve; queda registrado quién lo descargó. */
  async documentLink(
    viewer: Viewer,
    target: { readonly kind: PortalDocumentKind; readonly id: string },
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.access.run(viewer, async (tx, context) => {
      const fileId = await this.documentFile(tx, context, target);
      return this.links.issue(tx, viewer.principal, fileId, meta);
    });
  }

  async tickets(viewer: Viewer): Promise<PortalTicketList> {
    return this.access.run(viewer, async (tx, context) => ({
      data: await clientTickets(tx, serviceScope(context)),
    }));
  }

  async ticket(viewer: Viewer, id: string): Promise<PortalTicketDetail> {
    return this.access.run(viewer, (tx, context) => clientTicket(tx, serviceScope(context), id));
  }

  async pqrsf(viewer: Viewer): Promise<PortalPqrsfList> {
    return this.access.run(viewer, async (tx, context) => ({
      data: await clientPqrsf(tx, serviceScope(context)),
    }));
  }

  async articles(viewer: Viewer, q: string | undefined): Promise<PortalArticleList> {
    return this.access.run(viewer, async (tx) => ({ data: await clientArticles(tx, q) }));
  }

  async article(viewer: Viewer, id: string): Promise<PortalArticle> {
    return this.access.run(viewer, (tx) => clientArticle(tx, id));
  }

  private signer(context: PortalContext) {
    return { partyId: context.partyId, email: context.email, rights: signingRights(context) };
  }

  private async documentFile(
    tx: TenantTransaction,
    context: PortalContext,
    target: { readonly kind: PortalDocumentKind; readonly id: string },
  ): Promise<string> {
    const readsContracts = hasPermission(context.ability, 'portal.contract.read');
    if (target.kind === 'contract' && readsContracts) {
      return clientContractFile(tx, context.partyId, target.id);
    }
    if (target.kind === 'amendment' && readsContracts) {
      return clientAmendmentFile(tx, context.partyId, target.id);
    }
    const found = (await documentsOf(tx, context)).find(
      (row) => row.kind === target.kind && row.id === target.id,
    );
    if (found === undefined) throw portalNotFound('El documento');
    return found.fileId;
  }
}
