import { Inject, Injectable } from '@nestjs/common';
import { CHAIN_REQUIRED_STATUSES, type AddIpAuthor, type IpStatus } from '@arza/contracts';

import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { visibleContractByCode } from '../../contract/index.js';
import { attachedFiles } from '../../doc/index.js';
import { signedEmploymentContractOfUser } from '../../hr/index.js';
import {
  assertFile,
  assertPerson,
  chainIncomplete,
  innActorOf,
  innInvalid,
  innNotFound,
  recordInnChange,
  refOf,
  userRefs,
  type InnViewer,
} from './inn-support.js';

// Cadena de titularidad (B40, ficha 17.16, decisión 8): cada autor del activo y el soporte escrito
// de la cesión de sus derechos patrimoniales a la empresa. El contrato laboral firmado llega de
// Talento humano (sin salario); el de cesión, de Contratos por su código; o un documento firmado.

interface Support {
  readonly hrContractId: string | null;
  readonly contractId: string | null;
  readonly supportFileId: string | null;
  readonly supportLabel: string;
}

async function employmentSupport(tx: TenantTransaction, userId: string): Promise<Support> {
  const contract = await signedEmploymentContractOfUser(tx, userId);
  if (contract === null) {
    throw innInvalid('La persona no tiene un contrato laboral firmado en Talento humano.');
  }
  return {
    hrContractId: contract.id,
    contractId: null,
    supportFileId: null,
    supportLabel: contract.label,
  };
}

async function contractSupport(
  tx: TenantTransaction,
  ability: AppAbility,
  code: string,
): Promise<Support> {
  const contract = await visibleContractByCode(tx, ability, code);
  if (contract === null) throw innInvalid('El contrato no existe o usted no puede verlo.');
  const label = `${contract.code}: ${contract.title}`;
  return { hrContractId: null, contractId: contract.id, supportFileId: null, supportLabel: label };
}

async function documentSupport(
  tx: TenantTransaction,
  principal: Principal,
  fileId: string,
): Promise<Support> {
  await assertFile(tx, principal, fileId);
  const file = (await attachedFiles(tx, [fileId])).get(fileId);
  const label = file?.file_name ?? 'Documento de cesión';
  return { hrContractId: null, contractId: null, supportFileId: fileId, supportLabel: label };
}

function supportOf(tx: TenantTransaction, viewer: InnViewer, input: AddIpAuthor): Promise<Support> {
  if (input.support_kind === 'employment_contract') {
    return employmentSupport(tx, input.user_id ?? '');
  }
  if (input.support_kind === 'contract') {
    return contractSupport(tx, viewer.ability, input.contract_code ?? '');
  }
  return documentSupport(tx, viewer.principal, input.support_file_id ?? '');
}

async function authorName(tx: TenantTransaction, input: AddIpAuthor): Promise<string> {
  if (input.user_id === null) return input.name ?? 'Autor';
  await assertPerson(tx, input.user_id);
  return refOf(await userRefs(tx, [input.user_id]), input.user_id).name;
}

@Injectable()
export class IpAuthors {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async add(
    viewer: InnViewer,
    meta: RequestMeta,
    assetId: string,
    input: AddIpAuthor,
  ): Promise<string> {
    const actor = innActorOf(viewer.principal, this.clock.now(), meta);
    return this.database.withTenant(viewer.principal, async (tx) => {
      const asset = await tx.innIpAsset.findFirst({ where: { id: assetId, deletedAt: null } });
      if (asset === null) throw innNotFound('El activo no existe.');
      const name = await authorName(tx, input);
      const support = await supportOf(tx, viewer, input);
      const row = await tx.innIpAuthor.create({
        data: {
          tenantId: actor.tenantId,
          assetId,
          userId: input.user_id,
          name,
          contribution: input.contribution,
          supportKind: input.support_kind,
          ...support,
        },
      });
      await recordInnChange(tx, actor, {
        action: 'inn.author.add',
        event: 'inn.author.added',
        entityType: 'inn_ip_asset',
        entityId: assetId,
        changes: {
          code: asset.code,
          author_id: row.id,
          support_kind: row.supportKind,
          support: row.supportLabel,
        },
      });
      return row.id;
    });
  }

  /** Quita un autor; el software radicado o vigente no se queda sin autores. */
  async remove(
    principal: Principal,
    meta: RequestMeta,
    target: { readonly assetId: string; readonly authorId: string },
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const author = await tx.innIpAuthor.findFirst({
        where: { id: target.authorId, assetId: target.assetId, deletedAt: null },
        include: { asset: true },
      });
      if (author === null) throw innNotFound('El autor no existe.');
      const remaining = await tx.innIpAuthor.count({
        where: { assetId: target.assetId, deletedAt: null, id: { not: author.id } },
      });
      const filed = CHAIN_REQUIRED_STATUSES.includes(author.asset.status as IpStatus);
      if (author.asset.kind === 'software' && filed && remaining === 0) throw chainIncomplete();
      await tx.innIpAuthor.update({ where: { id: author.id }, data: { deletedAt: actor.at } });
      await recordInnChange(tx, actor, {
        action: 'inn.author.remove',
        event: 'inn.author.removed',
        entityType: 'inn_ip_asset',
        entityId: target.assetId,
        changes: { code: author.asset.code, author_id: author.id, name: author.name },
      });
    });
  }
}
