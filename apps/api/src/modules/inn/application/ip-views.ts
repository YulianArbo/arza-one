import {
  daysUntil,
  renewalAlertOn,
  type InnRef,
  type IpAsset,
  type IpAuthor,
  type IpKind,
} from '@arza/contracts';

import type { InnIpAsset, InnIpAuthor } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { attachedFiles } from '../../doc/index.js';
import { dateOf, refOf, userRefs } from './inn-support.js';

// Cómo se muestra un activo del portafolio (B40): fechas, alerta de renovación (decisión 6) y si la
// cadena de titularidad está completa (decisión 8).

type AssetWithAuthors = InnIpAsset & { readonly authors: readonly InnIpAuthor[] };

/** Ya llegó la fecha de aviso de la renovación de un activo vigente. */
function renewalDue(row: InnIpAsset, today: string): boolean {
  const alertOn = renewalAlertOn(row.kind as IpKind, dateOf(row.expiresOn));
  return row.status === 'registered' && alertOn !== null && alertOn <= today;
}

/** Hay al menos un autor y todos tienen soporte de cesión (la base exige el soporte). */
function chainComplete(authors: readonly InnIpAuthor[]): boolean {
  return authors.some((author) => author.deletedAt === null);
}

export function authorView(row: InnIpAuthor): IpAuthor {
  return {
    id: row.id,
    name: row.name,
    user_id: row.userId,
    contribution: row.contribution,
    support_kind: row.supportKind as IpAuthor['support_kind'],
    support_label: row.supportLabel,
  };
}

function assetView(
  row: AssetWithAuthors,
  refs: {
    readonly people: ReadonlyMap<string, InnRef>;
    readonly files: ReadonlyMap<string, { readonly id: string; readonly file_name: string }>;
  },
  today: string,
): IpAsset {
  const expiresOn = dateOf(row.expiresOn);
  const authors = row.authors.filter((author) => author.deletedAt === null);
  const file = row.documentId === null ? undefined : refs.files.get(row.documentId);
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as IpKind,
    title: row.title,
    holder: row.holder,
    registry_number: row.registryNumber,
    nice_classes: row.niceClasses,
    office: row.office,
    filed_on: dateOf(row.filedOn),
    granted_on: dateOf(row.grantedOn),
    expires_on: expiresOn,
    status: row.status as IpAsset['status'],
    responsible: refOf(refs.people, row.responsibleId),
    product: row.product,
    version_label: row.versionLabel,
    certificate: file === undefined ? null : { id: file.id, file_name: file.file_name },
    notes: row.notes,
    renewal_due: renewalDue(row, today),
    days_to_expiry: expiresOn === null ? null : daysUntil(today, expiresOn),
    authors_count: authors.length,
    chain_complete: chainComplete(authors),
    version: row.version,
  };
}

/** Los activos con los nombres de sus responsables y de sus certificados. */
export async function assetViews(
  tx: TenantTransaction,
  rows: readonly AssetWithAuthors[],
  today: string,
): Promise<IpAsset[]> {
  const [people, files] = await Promise.all([
    userRefs(
      tx,
      rows.map((row) => row.responsibleId),
    ),
    attachedFiles(
      tx,
      rows.flatMap((row) => (row.documentId === null ? [] : [row.documentId])),
    ),
  ]);
  return rows.map((row) => assetView(row, { people, files }, today));
}
