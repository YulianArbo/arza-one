import { Inject, Injectable } from '@nestjs/common';
import { IP_KINDS, IP_STATUSES, type DownloadLinkResponse, type IpAsset } from '@arza/contracts';
import { printedDate } from '@arza/templates';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { toCsv, type CsvCell } from '../../../platform/export/csv.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday } from '../../core/index.js';
import { AttachedFileLinks, systemFormPdf } from '../../doc/index.js';
import { innActorOf, innConflict, innNotFound, recordInnChange } from './inn-support.js';
import { IpAssets } from './ip-assets.js';

// Descargas de Innovación (B40): el PDF del FT-INN-003 de una idea, el certificado de un activo y el
// portafolio RE-INN-001 en CSV para Excel (decisión 5, columnas por validar). Cada enlace vence a los
// cinco minutos y cada descarga queda en la auditoría.

export const PORTFOLIO_COLUMNS = [
  'Código',
  'Tipo',
  'Nombre',
  'Titular',
  'Número de registro',
  'Entidad',
  'Clases de Niza',
  'Radicación',
  'Concesión',
  'Vencimiento',
  'Estado',
  'Responsable',
  'Soporte',
] as const;

function printed(value: string | null): CsvCell {
  return value === null ? null : printedDate(value);
}

export function portfolioRow(asset: IpAsset): CsvCell[] {
  return [
    asset.code,
    IP_KINDS[asset.kind],
    asset.title,
    asset.holder,
    asset.registry_number,
    asset.office,
    asset.nice_classes,
    printed(asset.filed_on),
    printed(asset.granted_on),
    printed(asset.expires_on),
    IP_STATUSES[asset.status],
    asset.responsible.name,
    asset.certificate?.file_name ?? null,
  ];
}

@Injectable()
export class InnFiles {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
    @Inject(IpAssets) private readonly assets: IpAssets,
  ) {}

  async viabilityLink(
    principal: Principal,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const idea = await tx.innIdea.findFirst({ where: { id, deletedAt: null } });
      if (idea === null) throw innNotFound('La idea no existe.');
      if (idea.viabilityRecordId === null) throw innConflict('La idea aún no tiene evaluación.');
      const pdf = await systemFormPdf(tx, idea.viabilityRecordId);
      const fileId = pdf?.fileId ?? null;
      if (fileId === null) {
        throw innConflict('El PDF aún se está generando. Intente de nuevo en un minuto.');
      }
      return this.links.issue(tx, principal, fileId, meta);
    });
  }

  async certificateLink(
    principal: Principal,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const asset = await tx.innIpAsset.findFirst({ where: { id, deletedAt: null } });
      if (asset === null) throw innNotFound('El activo no existe.');
      if (asset.documentId === null) throw innConflict('El activo no tiene certificado adjunto.');
      return this.links.issue(tx, principal, asset.documentId, meta);
    });
  }

  /** El portafolio RE-INN-001 en CSV; la descarga queda en la auditoría. */
  async portfolio(
    principal: Principal,
    meta: RequestMeta,
  ): Promise<{ readonly fileName: string; readonly content: string }> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    const assets = await this.assets.list(principal);
    const content = toCsv(PORTFOLIO_COLUMNS, assets.map(portfolioRow));
    await this.database.withTenant(principal, async (tx) => {
      await recordInnChange(tx, actor, {
        action: 'inn.asset.export',
        event: 'inn.asset.exported',
        entityType: 'inn_ip_asset',
        entityId: actor.tenantId,
        changes: { rows: assets.length },
      });
    });
    return { fileName: `portafolio-propiedad-intelectual-${bogotaToday(actor.at)}.csv`, content };
  }
}
