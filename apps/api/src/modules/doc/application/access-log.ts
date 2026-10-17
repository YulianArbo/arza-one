import { classificationSchema, isLoggedClassification } from '@arza/contracts';

import type { DocDocument } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { auditDoc, type DocActor } from './doc-support.js';

// Registro de accesos (B18, numeral 15.4 y ficha 17.4): cada descarga de un documento confidencial
// o restringido, y cada consulta de uno restringido, queda en doc_access_log.

/** Descarga de una versión de un documento confidencial o restringido. */
export async function logDownload(
  tx: TenantTransaction,
  actor: DocActor & { readonly userId: string },
  document: DocDocument,
  versionId: string,
): Promise<void> {
  if (!isLoggedClassification(classificationSchema.parse(document.classification))) return;
  await tx.docAccessLog.create({
    data: {
      tenantId: actor.tenantId,
      documentId: document.id,
      versionId,
      userId: actor.userId,
      action: 'download',
      occurredAt: actor.at,
    },
  });
}

/** Consulta de un documento restringido: va al registro de accesos y a la auditoría. */
export async function logRestrictedView(
  tx: TenantTransaction,
  actor: DocActor & { readonly userId: string },
  document: DocDocument,
): Promise<void> {
  if (document.classification !== 'restricted') return;
  await tx.docAccessLog.create({
    data: {
      tenantId: actor.tenantId,
      documentId: document.id,
      userId: actor.userId,
      action: 'view',
      occurredAt: actor.at,
    },
  });
  await auditDoc(tx, actor, {
    action: 'doc.document.view',
    entityType: 'doc_document',
    entityId: document.id,
    changes: { code: document.code },
  });
}
