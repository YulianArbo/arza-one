import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_RULES, type AccessReviewResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCsv } from '../../../platform/export/csv.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { isUnusedAccount } from '../domain/access-policy.js';
import { usersWithConfirmedFactor } from '../infrastructure/second-factor-store.js';
import { allUsers } from '../infrastructure/user-directory-store.js';
import { userSummaryOf } from './user-directory.js';

type ReviewUser = AccessReviewResponse['users'][number];

export interface AccessReviewFile {
  readonly fileName: string;
  readonly content: string;
}

// Los mismos nombres que muestra la pantalla de usuarios.
const KIND_LABELS: Readonly<Record<ReviewUser['kind'], string>> = {
  internal: 'Interno',
  portal: 'Portal del cliente',
};

const STATUS_LABELS: Readonly<Record<ReviewUser['status'], string>> = {
  invited: 'Invitado',
  active: 'Activo',
  locked: 'Bloqueado',
  inactive: 'Inactivo',
};

/** Fecha y hora de Colombia como dd/mm/aaaa hh:mm, para el archivo. */
function bogotaDateTime(iso: string | null): string | null {
  if (iso === null) return null;
  const parts = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

function csvOf(report: AccessReviewResponse): string {
  const rows = report.users.map((user) => [
    user.display_name,
    user.email,
    KIND_LABELS[user.kind],
    STATUS_LABELS[user.status],
    user.roles.map((role) => role.name).join(', ') || 'Sin roles',
    user.second_factor ? 'Sí' : 'No',
    bogotaDateTime(user.last_login_at),
    user.unused ? 'Sí' : 'No',
  ]);
  const header = ['Nombre', 'Correo', 'Tipo', 'Estado', 'Roles vigentes', 'Segundo factor'];
  return toCsv(
    [...header, 'Último ingreso', `Sin uso en ${String(report.unused_days)} días`],
    rows,
  );
}

/**
 * Informe de revisión de accesos para la Dirección (ficha 17.2, revisión trimestral; anexo E,
 * punto 17 «Informe de accesos»): usuarios, roles vigentes, segundo factor, último ingreso y
 * cuentas activas sin uso en 60 días. Cada consulta y cada descarga quedan en la auditoría, porque
 * el informe reúne datos de todas las cuentas.
 */
@Injectable()
export class AccessReviewQuery {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(principal: Principal, meta: RequestMeta): Promise<AccessReviewResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const report = await this.report(tx);
      await this.audit(tx, principal, meta, {
        action: 'iam.access_review.read',
        changes: report.totals,
      });
      return report;
    });
  }

  /** El mismo informe en CSV para Excel (UTF-8 con BOM, punto y coma). */
  async export(principal: Principal, meta: RequestMeta): Promise<AccessReviewFile> {
    return this.database.withTenant(principal, async (tx) => {
      const report = await this.report(tx);
      const changes = { ...report.totals, rows: report.users.length };
      await this.audit(tx, principal, meta, { action: 'iam.access_review.export', changes });
      const day = report.generated_at.slice(0, 10);
      return { fileName: `revision-de-accesos-${day}.csv`, content: csvOf(report) };
    });
  }

  private async report(tx: TenantTransaction): Promise<AccessReviewResponse> {
    const now = this.clock.now();
    const accounts = await allUsers(tx, now);
    const confirmed = await usersWithConfirmedFactor(
      tx,
      accounts.map((user) => user.id),
    );
    const users = accounts.map((user) => ({
      ...userSummaryOf(user),
      unused: isUnusedAccount(user, now),
      second_factor: confirmed.has(user.id),
    }));
    const activeInternal = users.filter((u) => u.kind === 'internal' && u.status === 'active');
    const totals = {
      users: users.length,
      active: users.filter((user) => user.status === 'active').length,
      unused: users.filter((user) => user.unused).length,
      without_roles: users.filter((user) => user.roles.length === 0).length,
      without_second_factor: activeInternal.filter((user) => !user.second_factor).length,
    };
    return {
      generated_at: now.toISOString(),
      unused_days: ACCESS_RULES.unusedAccountDays,
      totals,
      users,
    };
  }

  private async audit(
    tx: TenantTransaction,
    principal: Principal,
    meta: RequestMeta,
    event: { readonly action: string; readonly changes: Record<string, number> },
  ): Promise<void> {
    await recordAuditEvent(tx, {
      tenantId: principal.tenantId,
      occurredAt: this.clock.now(),
      actor: { kind: 'user', id: principal.userId },
      action: event.action,
      entityType: 'iam_access_review',
      entityId: null,
      result: 'success',
      changes: event.changes,
      meta,
    });
  }
}
