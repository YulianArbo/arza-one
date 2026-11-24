import { pdfSealFromPkcs12, temporaryPdfSeal, type PdfSeal } from '@arza/api/platform';

import type { WorkerEnv } from './env-schema.js';

type SealConfig = Pick<WorkerEnv, 'APP_ENV' | 'PDF_SEAL_PKCS12' | 'PDF_SEAL_PASSPHRASE'>;

/**
 * Sello de los PDF firmados (B43): el certificado de la empresa si está configurado o, fuera de
 * producción (la configuración lo exige allí), uno temporal marcado «sin validez».
 */
export function pdfSealFrom(config: SealConfig, now: Date): PdfSeal {
  const { PDF_SEAL_PKCS12: pkcs12, PDF_SEAL_PASSPHRASE: passphrase } = config;
  if (pkcs12 === undefined || passphrase === undefined) {
    return temporaryPdfSeal(`ARZA ONE (${config.APP_ENV}, sin validez)`, now);
  }
  return pdfSealFromPkcs12(Buffer.from(pkcs12, 'base64'), passphrase);
}
