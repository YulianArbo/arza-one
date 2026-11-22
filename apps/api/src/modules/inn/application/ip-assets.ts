import { Inject, Injectable } from '@nestjs/common';
import {
  CHAIN_REQUIRED_STATUSES,
  IP_OFFICES,
  type InnCodeResponse,
  type IpAsset,
  type IpAssetDetail,
  type SaveIpAsset,
} from '@arza/contracts';

import type { InnIpAsset } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import {
  assertFile,
  assertPerson,
  chainIncomplete,
  dateOf,
  innActorOf,
  innNotFound,
  recordInnChange,
  type InnActor,
  type Target,
} from './inn-support.js';
import { assetViews, authorView } from './ip-views.js';

// Portafolio de propiedad intelectual (B40, ficha 17.16; RE-INN-001). Cada activo registra titular,
// número, fechas y vencimiento. Un registro de software no pasa a radicado ni a vigente sin la
// cesión escrita de todos sus autores (decisión 8). Lo administra Calidad (inn.ip.manage).

const ASSETS = { name: 'Portafolio de propiedad intelectual', prefix: 'PI', padding: 4 };
const ACTIVE_AUTHORS = { where: { deletedAt: null } } as const;

function date(value: string | null): Date | null {
  return value === null ? null : fromCalendarDate(value);
}

/** Las columnas de un activo que llegan del formulario o de la liberación de una versión. */
export interface AssetData {
  readonly kind: string;
  readonly title: string;
  readonly holder: string;
  readonly registryNumber: string | null;
  readonly niceClasses: string | null;
  readonly office: string;
  readonly filedOn: Date | null;
  readonly grantedOn: Date | null;
  readonly expiresOn: Date | null;
  readonly status: string;
  readonly responsibleId: string;
  readonly product: string | null;
  readonly versionLabel: string | null;
  readonly documentId: string | null;
  readonly notes: string | null;
}

function assetData(input: SaveIpAsset): AssetData {
  return {
    kind: input.kind,
    title: input.title,
    holder: input.holder,
    registryNumber: input.registry_number,
    niceClasses: input.nice_classes,
    office: input.office ?? IP_OFFICES[input.kind],
    filedOn: date(input.filed_on),
    grantedOn: date(input.granted_on),
    expiresOn: date(input.expires_on),
    status: input.status,
    responsibleId: input.responsible_id,
    product: input.product,
    versionLabel: input.version_label,
    documentId: input.certificate_file_id,
    notes: input.notes,
  };
}

function auditOf(row: {
  kind: string;
  status: string;
  registryNumber: string | null;
  expiresOn: Date | null;
  responsibleId: string;
}) {
  return {
    kind: row.kind,
    status: row.status,
    registry_number: row.registryNumber,
    expires_on: dateOf(row.expiresOn),
    responsible_id: row.responsibleId,
  };
}

/** Decisión 8: el software radicado o vigente tiene al menos un autor con su cesión. */
async function assertChain(
  tx: TenantTransaction,
  input: SaveIpAsset,
  assetId: string | null,
): Promise<void> {
  if (input.kind !== 'software' || !CHAIN_REQUIRED_STATUSES.includes(input.status)) return;
  const authors =
    assetId === null ? 0 : await tx.innIpAuthor.count({ where: { assetId, deletedAt: null } });
  if (authors === 0) throw chainIncomplete();
}

async function assertRefs(
  tx: TenantTransaction,
  principal: Principal,
  input: SaveIpAsset,
  current: InnIpAsset | null,
): Promise<void> {
  await assertPerson(tx, input.responsible_id);
  // El certificado que ya estaba no se vuelve a validar: lo pudo subir otra persona.
  if (input.certificate_file_id !== current?.documentId) {
    await assertFile(tx, principal, input.certificate_file_id);
  }
}

/** Al renovar (cambia el vencimiento) se puede volver a avisar el nuevo vencimiento. */
function renewalReset(row: InnIpAsset, expiresOn: Date | null) {
  const same = row.expiresOn?.getTime() === expiresOn?.getTime();
  return same ? {} : { renewalAlertedFor: null };
}

@Injectable()
export class IpAssets {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** El portafolio, del vencimiento más próximo al más lejano. */
  async list(principal: Principal): Promise<IpAsset[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.innIpAsset.findMany({
        where: { deletedAt: null },
        include: { authors: ACTIVE_AUTHORS },
        orderBy: [{ expiresOn: { sort: 'asc', nulls: 'last' } }, { code: 'asc' }],
        take: 500,
      });
      return assetViews(tx, rows, today);
    });
  }

  async detail(principal: Principal, id: string): Promise<IpAssetDetail> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.innIpAsset.findFirst({
        where: { id, deletedAt: null },
        include: { authors: { ...ACTIVE_AUTHORS, orderBy: { createdAt: 'asc' } } },
      });
      if (row === null) throw innNotFound('El activo no existe.');
      const [view] = await assetViews(tx, [row], today);
      if (view === undefined) throw innNotFound('El activo no existe.');
      return { ...view, authors: row.authors.map(authorView) };
    });
  }

  async create(
    principal: Principal,
    meta: RequestMeta,
    input: SaveIpAsset,
  ): Promise<InnCodeResponse> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertRefs(tx, principal, input, null);
      await assertChain(tx, input, null);
      return createAsset(tx, actor, assetData(input));
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveIpAsset,
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.innIpAsset.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw innNotFound('El activo no existe.');
      await assertRefs(tx, principal, input, row);
      await assertChain(tx, input, row.id);
      const data = assetData(input);
      const updated = await tx.innIpAsset.updateMany({
        where: { id: row.id, version: target.version },
        data: { ...data, ...renewalReset(row, data.expiresOn) },
      });
      if (updated.count !== 1) throw versionConflict();
      await recordInnChange(tx, actor, {
        action: 'inn.asset.update',
        event: 'inn.asset.updated',
        entityType: 'inn_ip_asset',
        entityId: row.id,
        changes: { code: row.code, ...changesBetween(auditOf(row), auditOf(data)) },
      });
    });
  }
}

/** Crea el activo con su código; lo usan el registro manual y la liberación de una versión. */
export async function createAsset(
  tx: TenantTransaction,
  actor: InnActor,
  data: AssetData,
): Promise<InnCodeResponse> {
  const code = await nextBusinessCode(tx, 'inn.asset', actor.at, ASSETS);
  const row = await tx.innIpAsset.create({ data: { tenantId: actor.tenantId, code, ...data } });
  await recordInnChange(tx, actor, {
    action: 'inn.asset.create',
    event: 'inn.asset.created',
    entityType: 'inn_ip_asset',
    entityId: row.id,
    changes: { code, title: row.title, ...auditOf(row) },
  });
  return { id: row.id, code };
}
