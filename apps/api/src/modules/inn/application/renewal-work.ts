import { renewalAlertOn, IP_KINDS, type IpKind } from '@arza/contracts';
import { printedDate } from '@arza/templates';

import type { InnIpAsset } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { innSystemActor, recordInnChange, type InnActor } from './inn-support.js';
import { openFollowUp } from './ip-follow-up.js';

// Trabajo diario de Innovación (B40, decisión 6), a las 6:45 de Colombia: cada marca vigente a
// seis meses de vencer y cada dominio a 60 días le dan a su responsable la tarea «Renovar …». Una
// tarea por vencimiento: si se renueva y cambia la fecha, se avisa el nuevo. Lo que pasó su fecha
// sin renovarse queda vencido. Repetirlo no cambia nada.

export interface InnDailyWorkDeps {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface InnDailyWorkResult {
  readonly alerts: number;
  readonly expired: number;
}

async function tenantsWithAssets(database: InnDailyWorkDeps['database']): Promise<string[]> {
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ tenant_id: string }[]>`
    SELECT inn_tenants_with_expiring_assets()::text AS tenant_id
  `,
  );
  return rows.map((row) => row.tenant_id);
}

function alertDue(asset: InnIpAsset, today: string): boolean {
  if (asset.expiresOn === null) return false;
  const expiresOn = toCalendarDate(asset.expiresOn);
  const alertOn = renewalAlertOn(asset.kind as IpKind, expiresOn);
  const alerted = asset.renewalAlertedFor?.getTime() === asset.expiresOn.getTime();
  return alertOn !== null && alertOn <= today && expiresOn >= today && !alerted;
}

async function alertRenewal(tx: TenantTransaction, actor: InnActor, asset: InnIpAsset) {
  const expiresOn = toCalendarDate(asset.expiresOn ?? actor.at);
  const kind = IP_KINDS[asset.kind as IpKind].toLowerCase();
  await openFollowUp(tx, actor, {
    assetId: asset.id,
    responsibleId: asset.responsibleId,
    title: `Renovar ${kind} ${asset.title} (${asset.code}): vence el ${printedDate(expiresOn)}`,
    reason: 'renewal',
  });
  await tx.innIpAsset.update({
    where: { id: asset.id },
    data: { renewalAlertedFor: asset.expiresOn },
  });
  await recordInnChange(tx, actor, {
    action: 'inn.asset.renewal_alert',
    event: 'inn.asset.expiring',
    entityType: 'inn_ip_asset',
    entityId: asset.id,
    changes: { code: asset.code, expires_on: expiresOn },
  });
}

async function expire(tx: TenantTransaction, actor: InnActor, asset: InnIpAsset) {
  await tx.innIpAsset.update({ where: { id: asset.id }, data: { status: 'expired' } });
  await recordInnChange(tx, actor, {
    action: 'inn.asset.expire',
    event: 'inn.asset.expired',
    entityType: 'inn_ip_asset',
    entityId: asset.id,
    changes: { code: asset.code, status: [asset.status, 'expired'] },
  });
}

async function workTenant(deps: InnDailyWorkDeps, tenantId: string): Promise<InnDailyWorkResult> {
  const at = deps.clock.now();
  const today = bogotaToday(at);
  const actor = innSystemActor(tenantId, at);
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const assets = await tx.innIpAsset.findMany({
      where: { status: 'registered', expiresOn: { not: null }, deletedAt: null },
    });
    let alerts = 0;
    let expired = 0;
    for (const asset of assets) {
      if (asset.expiresOn !== null && asset.expiresOn < fromCalendarDate(today)) {
        await expire(tx, actor, asset);
        expired += 1;
      } else if (alertDue(asset, today)) {
        await alertRenewal(tx, actor, asset);
        alerts += 1;
      }
    }
    return { alerts, expired };
  });
}

export async function runInnDailyWork(deps: InnDailyWorkDeps): Promise<InnDailyWorkResult> {
  let alerts = 0;
  let expired = 0;
  for (const tenantId of await tenantsWithAssets(deps.database)) {
    const result = await workTenant(deps, tenantId);
    alerts += result.alerts;
    expired += result.expired;
  }
  return { alerts, expired };
}
