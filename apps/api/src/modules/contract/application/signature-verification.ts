import { Inject, Injectable } from '@nestjs/common';
import type { VerifyDocumentRequest, VerifyDocumentResponse } from '@arza/contracts';

import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { companyIdentity } from '../../core/index.js';

// Verificación pública (B25, numeral 19.3): cualquiera escribe el código de verificación o carga el
// archivo, y sabe si coincide con el documento firmado. El archivo nunca sale del computador de
// quien consulta: la página calcula su huella SHA-256 y solo envía la huella. La respuesta no
// revela el contenido ni los nombres de quienes firmaron (decisión 10 del B25). Cada consulta que
// encuentra un documento queda registrada en su empresa.

interface Found {
  readonly envelopeId: string;
  readonly tenantId: string;
}

@Injectable()
export class SignatureVerificationUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async find(code: string | null, sha256: string | null): Promise<Found | null> {
    const rows = await this.database.withoutTenant(
      (tx) =>
        tx.$queryRaw<{ envelope_id: string; tenant_id: string }[]>`
          SELECT envelope_id, tenant_id FROM sig_find_signed_document(${code}, ${sha256})`,
    );
    const row = rows[0];
    return row === undefined ? null : { envelopeId: row.envelope_id, tenantId: row.tenant_id };
  }

  async verify(input: VerifyDocumentRequest, meta: RequestMeta): Promise<VerifyDocumentResponse> {
    const code = input.code ?? null;
    const sha256 = input.sha256 ?? null;
    const found = await this.find(code, code === null ? sha256 : null);
    if (found === null) return { result: 'not_found', document: null };
    const at = this.clock.now();
    return this.database.withTenant({ tenantId: found.tenantId, userId: null }, async (tx) => {
      const envelope = await tx.sigEnvelope.findFirstOrThrow({
        where: { id: found.envelopeId },
        include: { signers: { where: { deletedAt: null }, select: { id: true } } },
      });
      // Con el código y el archivo, el archivo debe ser el firmado de ese código.
      const result = sha256 !== null && envelope.signedSha256 !== sha256 ? 'mismatch' : 'valid';
      await tx.sigVerification.create({
        data: {
          tenantId: found.tenantId,
          envelopeId: envelope.id,
          method: sha256 === null ? 'code' : 'file',
          result,
          ip: meta.ip,
          verifiedAt: at,
        },
      });
      const company = await companyIdentity(tx);
      return {
        result,
        document: {
          code: envelope.documentCode,
          company: company.legalName,
          completed_at: (envelope.completedAt ?? at).toISOString(),
          signatures: envelope.signers.length,
          verification_code: envelope.verificationCode ?? '',
        },
      };
    });
  }
}
