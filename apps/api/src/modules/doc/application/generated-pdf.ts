import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { v7 as uuidv7 } from 'uuid';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { FileStorage } from '../infrastructure/file-storage.js';
import type { HtmlDocument, SourceDocument } from '../infrastructure/gotenberg-converter.js';
import type { DocActor } from './doc-support.js';

// Piezas comunes de los PDF que genera el worker (B20): lo que necesita (base de datos,
// almacenamiento y Gotenberg) y cómo guarda cada PDF con su huella, amarrado a su registro.

export interface PdfRenderDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'read' | 'put' | 'delete'>;
  readonly convertHtml: (document: HtmlDocument) => Promise<Buffer>;
  readonly convertOffice: (source: SourceDocument) => Promise<Buffer>;
  readonly stamp: (pdf: Buffer, text: string) => Promise<Buffer>;
}

export type Outcome = 'ready' | 'failed' | 'skipped';

export function systemActor(tenantId: string, at: Date): DocActor {
  return { tenantId, userId: null, meta: null, at };
}

/** El registro ya no espera su PDF (otra pasada lo hizo): el archivo generado sobra. */
class AlreadyDoneError extends Error {}

/** Guarda el PDF y lo amarra a su registro en la misma transacción; si sobra, lo borra. */
export async function storePdf(
  deps: Pick<PdfRenderDependencies, 'database' | 'clock' | 'storage'>,
  target: { readonly tenantId: string; readonly fileName: string; readonly content: Buffer },
  attach: (tx: TenantTransaction, fileId: string, at: Date) => Promise<boolean>,
): Promise<boolean> {
  const id = uuidv7();
  const key = `${target.tenantId}/${id}`;
  const { content } = target;
  await deps.storage.put(
    { key, contentType: 'application/pdf', sizeBytes: content.length },
    Readable.from(content),
  );
  try {
    const at = deps.clock.now();
    await deps.database.withTenant({ tenantId: target.tenantId, userId: null }, async (tx) => {
      await tx.file.create({
        data: {
          id,
          tenantId: target.tenantId,
          storageKey: key,
          fileName: target.fileName,
          mimeType: 'application/pdf',
          sizeBytes: content.length,
          sha256: createHash('sha256').update(content).digest('hex'),
          scanStatus: 'available',
          scannedAt: at,
        },
      });
      if (!(await attach(tx, id, at))) throw new AlreadyDoneError();
    });
    return true;
  } catch (error) {
    await deps.storage.delete(key);
    if (error instanceof AlreadyDoneError) return false;
    throw error;
  }
}
