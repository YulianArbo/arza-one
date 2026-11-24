import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';

import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import forge from 'node-forge';

// Sello de integridad de la empresa (numeral 19.3, fase F8, B43): el PDF firmado por todos se
// sella con el certificado de la empresa (PAdES básico, firma CMS separada). Cualquier lector de
// PDF muestra quién lo selló y avisa si el archivo cambió después.

/** Espacio reservado para la firma CMS: alcanza para el certificado y su cadena. */
const SIGNATURE_BYTES = 16_384;
const TEMPORARY_DAYS = 365;
const DAY_MS = 86_400_000;

export interface PdfSeal {
  /** Huella SHA-256 (hexadecimal) del certificado con que se sella: queda en la evidencia. */
  readonly certificateSha256: string;
  /** Nombre del titular del certificado, tal como lo muestra el lector de PDF. */
  readonly holder: string;
  seal(pdf: Buffer, at: Date): Promise<Buffer>;
}

function firstCertificate(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.Certificate {
  const bags = p12.getBags({ bagType: forge.pki.oids['certBag'] ?? '' });
  const certificate = (bags[forge.pki.oids['certBag'] ?? ''] ?? [])[0]?.cert;
  if (certificate === undefined)
    throw new Error('El certificado del sello no trae su certificado.');
  return certificate;
}

function holderOf(certificate: forge.pki.Certificate): string {
  const commonName = certificate.subject.getField('CN') as { value?: unknown } | null;
  return typeof commonName?.value === 'string' ? commonName.value : 'ARZA ONE';
}

function sha256Of(certificate: forge.pki.Certificate): string {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  return createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex');
}

/**
 * Sello con el certificado de la empresa (archivo PKCS#12 y su clave, de las variables de
 * entorno). Falla al crearlo si el archivo o la clave no sirven: mejor no arrancar que no sellar.
 */
export function pdfSealFromPkcs12(pkcs12: Buffer, passphrase: string): PdfSeal {
  const asn1 = forge.asn1.fromDer(pkcs12.toString('binary'));
  const certificate = firstCertificate(forge.pkcs12.pkcs12FromAsn1(asn1, passphrase));
  const holder = holderOf(certificate);
  return {
    certificateSha256: sha256Of(certificate),
    holder,
    async seal(pdf, at) {
      const prepared = plainAddPlaceholder({
        pdfBuffer: pdf,
        reason: 'Sello de integridad del documento firmado electrónicamente',
        contactInfo: holder,
        name: holder,
        location: 'Colombia',
        signingTime: at,
        signatureLength: SIGNATURE_BYTES,
        appName: 'ARZA ONE',
      });
      // El firmante consume el certificado al leerlo: uno nuevo por documento.
      return new SignPdf().sign(prepared, new P12Signer(pkcs12, { passphrase }), at);
    },
  };
}

/**
 * Certificado propio y desechable para el equipo local, las pruebas y el ambiente de pruebas
 * (decisión 4 de B43): sella igual, pero ningún lector lo reconoce como de confianza.
 */
export function temporaryPdfSeal(holder: string, now: Date): PdfSeal {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = forge.pki.privateKeyFromPem(
    keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  );
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(
    keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  certificate.serialNumber = `01${randomBytes(8).toString('hex')}`;
  certificate.validity.notBefore = now;
  certificate.validity.notAfter = new Date(now.getTime() + TEMPORARY_DAYS * DAY_MS);
  const subject = [{ name: 'commonName', value: holder }];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(privateKey, forge.md.sha256.create());
  const passphrase = randomBytes(24).toString('base64url');
  const p12 = forge.pkcs12.toPkcs12Asn1(privateKey, [certificate], passphrase, {
    algorithm: 'aes256',
  });
  return pdfSealFromPkcs12(Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'), passphrase);
}
