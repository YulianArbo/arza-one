import { Inject, Injectable } from '@nestjs/common';
import type {
  AuditEventListQuery,
  AuditEventListResponse,
  AuditExportListQuery,
  AuditExportListResponse,
  EntityHistoryParams,
  EntityHistoryQuery,
  SecurityEventListQuery,
  SecurityEventListResponse,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  auditWhere,
  listAuditEvents,
  listExports,
  listSecurityEvents,
} from '../infrastructure/audit-store.js';
import { recordAuditAccess, usedFilters, type AuditAccess } from './audit-record.js';
import { auditEventViews, exportViews, securityEventViews } from './audit-views.js';

/**
 * Consulta de la auditoría (audit.event.read y audit.security.read): eventos, historial de un
 * registro, eventos de seguridad y exportaciones hechas. Cada consulta deja su propio evento.
 */
@Injectable()
export class AuditQuery {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async events(
    principal: Principal,
    query: AuditEventListQuery,
    meta: RequestMeta,
  ): Promise<AuditEventListResponse> {
    const access = this.access(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const page = await listAuditEvents(tx, auditWhere(query), query);
      await recordAuditAccess(tx, access, {
        action: 'audit.event.read',
        entityType: 'aud_events',
        changes: { filters: usedFilters(query) },
      });
      return { data: await auditEventViews(tx, page.rows), next_cursor: page.nextCursor };
    });
  }

  /** Historial de un registro (ficha 17.20): lo que le pasó, del cambio más reciente al primero. */
  async history(
    principal: Principal,
    target: EntityHistoryParams,
    query: EntityHistoryQuery,
    meta: RequestMeta,
  ): Promise<AuditEventListResponse> {
    const access = this.access(principal, meta);
    const where = { entityType: target.type, entityId: target.id };
    return this.database.withTenant(principal, async (tx) => {
      const page = await listAuditEvents(tx, where, query);
      // Se registra aparte del registro consultado: ver su historial no es un cambio del registro.
      await recordAuditAccess(tx, access, {
        action: 'audit.event.read',
        entityType: 'aud_events',
        changes: { history: { entity_type: target.type, entity_id: target.id } },
      });
      return { data: await auditEventViews(tx, page.rows), next_cursor: page.nextCursor };
    });
  }

  async securityEvents(
    principal: Principal,
    query: SecurityEventListQuery,
    meta: RequestMeta,
  ): Promise<SecurityEventListResponse> {
    const access = this.access(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const page = await listSecurityEvents(tx, query);
      await recordAuditAccess(tx, access, {
        action: 'audit.security.read',
        entityType: 'aud_security_events',
        changes: { filters: usedFilters(query) },
      });
      return { data: await securityEventViews(tx, page.rows), next_cursor: page.nextCursor };
    });
  }

  async exports(
    principal: Principal,
    query: AuditExportListQuery,
    meta: RequestMeta,
  ): Promise<AuditExportListResponse> {
    const access = this.access(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const page = await listExports(tx, query);
      await recordAuditAccess(tx, access, {
        action: 'audit.event.read',
        entityType: 'aud_exports',
        changes: {},
      });
      return { data: await exportViews(tx, page.rows), next_cursor: page.nextCursor };
    });
  }

  private access(principal: Principal, meta: RequestMeta): AuditAccess {
    return { principal, meta, now: this.clock.now() };
  }
}
