import { createHash, verify } from 'node:crypto';

import forge from 'node-forge';

import { temporaryPdfSeal } from '../../src/platform/pdf/pdf-seal.js';

// Ayudas de prueba del sello de integridad (B43): un PDF real y mínimo, y la comprobación que
// hace un lector de PDF: la huella de lo firmado coincide y la firma corresponde al certificado.

/** El sello de las pruebas: un certificado temporal, como en el equipo local. */
export const TEST_PDF_SEAL = temporaryPdfSeal('ARZA ONE (pruebas)', new Date());

/** Un PDF válido de una página con un texto: tabla de referencias clásica con posiciones exactas. */
export function minimalPdf(text = 'Documento de prueba'): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${rows}`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefAt)}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

export interface SealCheck {
  readonly intact: boolean;
  readonly certificateSha256: string;
  readonly holder: string;
}

function lastByteRange(pdf: Buffer): [number, number, number, number] {
  const matches = [
    ...pdf.toString('latin1').matchAll(/\/ByteRange\s*\[\s*(\d+) (\d+) (\d+) (\d+)/g),
  ];
  const last = matches.at(-1);
  if (last === undefined) throw new Error('El PDF no tiene sello.');
  return [Number(last[1]), Number(last[2]), Number(last[3]), Number(last[4])];
}

/** Lo que hace un lector de PDF con el sello: recalcula la huella y comprueba la firma. */
export function checkPdfSeal(pdf: Buffer): SealCheck {
  const [start, firstLength, second, secondLength] = lastByteRange(pdf);
  const signed = Buffer.concat([
    pdf.subarray(start, start + firstLength),
    pdf.subarray(second, second + secondLength),
  ]);
  const hex = pdf.subarray(start + firstLength + 1, second - 1).toString('latin1');
  const der = Buffer.from(hex.replace(/(00)+$/, ''), 'hex').toString('binary');
  const message = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der, false));
  const capture = (message as unknown as { rawCapture: RawCapture }).rawCapture;
  const certificate = (message as unknown as { certificates: forge.pki.Certificate[] })
    .certificates[0];
  if (certificate === undefined) throw new Error('El sello no trae su certificado.');
  return {
    intact: digestMatches(capture, signed) && signatureMatches(capture, certificate),
    certificateSha256: createHash('sha256')
      .update(
        Buffer.from(
          forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(),
          'binary',
        ),
      )
      .digest('hex'),
    holder: String((certificate.subject.getField('CN') as { value: unknown }).value),
  };
}

interface RawCapture {
  readonly authenticatedAttributes: forge.asn1.Asn1[];
  readonly signature: string;
}

const MESSAGE_DIGEST_OID = forge.pki.oids['messageDigest'] ?? '';

function digestMatches(capture: RawCapture, signed: Buffer): boolean {
  const expected = createHash('sha256').update(signed).digest('binary');
  return capture.authenticatedAttributes.some((attribute) => {
    const [oid, values] = attribute.value as forge.asn1.Asn1[];
    if (oid === undefined || forge.asn1.derToOid(oid.value as string) !== MESSAGE_DIGEST_OID) {
      return false;
    }
    const digest = (values?.value as forge.asn1.Asn1[] | undefined)?.[0]?.value;
    return digest === expected;
  });
}

function signatureMatches(capture: RawCapture, certificate: forge.pki.Certificate): boolean {
  const set = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    capture.authenticatedAttributes,
  );
  const attributes = Buffer.from(forge.asn1.toDer(set).getBytes(), 'binary');
  return verify(
    'sha256',
    attributes,
    forge.pki.publicKeyToPem(certificate.publicKey),
    Buffer.from(capture.signature, 'binary'),
  );
}
