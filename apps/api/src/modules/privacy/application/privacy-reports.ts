import { Inject, Injectable } from '@nestjs/common';
import {
  COOKIE_CATEGORIES,
  PRIVACY_INCIDENT_STATUSES,
  PRIVACY_REQUEST_CHANNELS,
  PRIVACY_REQUEST_KINDS,
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_RIGHTS,
  type CookieCategory,
  type CookieConsentListResponse,
  type CookieConsentQuery,
  type CookieReport,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { toCsv, type CsvCell } from '../../../platform/export/csv.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addDays, bogotaStartOf, bogotaToday } from '../../core/index.js';
import { actorOf, auditPrivacy } from './privacy-support.js';
import { shownDate, shownDateTime } from './personal-data-sources.js';

// Informes de Privacidad (B42): las elecciones de cookies del sitio con su resumen, y los registros
// de solicitudes de titulares y de incidentes en CSV para Excel. Descargar un registro queda en la
// auditoría: lleva datos personales.

export interface CsvFile {
  readonly fileName: string;
  readonly content: string;
}

function rangeOf(query: Pick<CookieConsentQuery, 'from' | 'to'>): Prisma.DateTimeFilter {
  return { gte: bogotaStartOf(query.from), lt: bogotaStartOf(addDays(query.to, 1)) };
}

function label(map: Readonly<Record<string, string>>, key: string): string {
  return map[key] ?? key;
}

const REQUEST_COLUMNS = [
  'Código',
  'Tipo',
  'Derecho',
  'Canal',
  'Titular',
  'Recibida',
  'Fecha límite',
  'Prórroga',
  'Estado',
  'Respondida',
  'Cerrada',
] as const;

const INCIDENT_COLUMNS = [
  'Código',
  'Incidente',
  'Detectado',
  'Titulares afectados',
  'Tipos de datos',
  'Fecha límite SIC',
  'Reportado a la SIC',
  'Radicado SIC',
  'Titulares informados',
  'Estado',
  'Medidas',
] as const;

@Injectable()
export class PrivacyReportsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async cookieConsents(
    principal: Principal,
    query: CookieConsentQuery,
  ): Promise<CookieConsentListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.privacyCookieConsent.findMany({
        where: {
          decidedAt: rangeOf(query),
          ...(query.cursor === undefined ? {} : { id: { lt: query.cursor } }),
        },
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        data: page.map((row) => ({
          id: row.id,
          decided_at: row.decidedAt.toISOString(),
          policy_version: row.policyVersion,
          categories: row.categories.filter(
            (item): item is CookieCategory => item in COOKIE_CATEGORIES,
          ),
          ip_truncated: row.ipTruncated,
          visitor: row.visitorId.slice(0, 8),
        })),
        next_cursor: rows.length > query.limit && last !== undefined ? last.id : null,
      };
    });
  }

  async cookieReport(principal: Principal, query: CookieConsentQuery): Promise<CookieReport> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.privacyCookieConsent.findMany({
        where: { decidedAt: rangeOf(query) },
        select: { categories: true, policyVersion: true },
      });
      const categories = Object.keys(COOKIE_CATEGORIES) as CookieCategory[];
      const versions = new Map<number, number>();
      for (const row of rows)
        versions.set(row.policyVersion, (versions.get(row.policyVersion) ?? 0) + 1);
      return {
        from: query.from,
        to: query.to,
        total: rows.length,
        only_necessary: rows.filter((row) => row.categories.every((item) => item === 'necessary'))
          .length,
        by_category: categories.map((category) => ({
          category,
          count: rows.filter((row) => row.categories.includes(category)).length,
        })),
        by_version: [...versions.entries()]
          .sort(([a], [b]) => a - b)
          .map(([policy_version, count]) => ({ policy_version, count })),
      };
    });
  }

  /** Registro de solicitudes de titulares en CSV. */
  async requestsCsv(principal: Principal, meta: RequestMeta): Promise<CsvFile> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.privacyRequest.findMany({
        where: { deletedAt: null },
        orderBy: { receivedAt: 'asc' },
      });
      const lines: CsvCell[][] = rows.map((row) => [
        row.code,
        label(PRIVACY_REQUEST_KINDS, row.kind),
        label(PRIVACY_RIGHTS, row.right),
        label(PRIVACY_REQUEST_CHANNELS, row.channel),
        row.requesterName,
        shownDateTime(row.receivedAt),
        row.dueOn === null ? 'Suspendido' : shownDate(row.dueOn),
        row.extendedAt === null ? 'No' : 'Sí',
        label(PRIVACY_REQUEST_STATUSES, row.status),
        shownDateTime(row.respondedAt),
        shownDateTime(row.closedAt),
      ]);
      await auditPrivacy(tx, actor, {
        action: 'privacy.request.export_register',
        entityType: 'prv_request',
        entityId: actor.tenantId,
        changes: { rows: rows.length },
      });
      return {
        fileName: `registro-solicitudes-titulares-${bogotaToday(actor.at)}.csv`,
        content: toCsv(REQUEST_COLUMNS, lines),
      };
    });
  }

  /** Registro de incidentes y de sus reportes en CSV. */
  async incidentsCsv(principal: Principal, meta: RequestMeta): Promise<CsvFile> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.privacyIncident.findMany({
        where: { deletedAt: null },
        include: { measures: { where: { deletedAt: null } } },
        orderBy: { detectedAt: 'asc' },
      });
      const lines: CsvCell[][] = rows.map((row) => [
        row.code,
        row.title,
        shownDateTime(row.detectedAt),
        String(row.affectedCount),
        row.dataCategories.join(', '),
        shownDate(row.sicDueOn),
        shownDate(row.reportedOn),
        row.sicReference,
        shownDate(row.holdersNotifiedOn),
        label(PRIVACY_INCIDENT_STATUSES, row.status),
        String(row.measures.length),
      ]);
      await auditPrivacy(tx, actor, {
        action: 'privacy.incident.export_register',
        entityType: 'prv_incident',
        entityId: actor.tenantId,
        changes: { rows: rows.length },
      });
      return {
        fileName: `registro-incidentes-datos-personales-${bogotaToday(actor.at)}.csv`,
        content: toCsv(INCIDENT_COLUMNS, lines),
      };
    });
  }
}
