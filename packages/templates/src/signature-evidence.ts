import { escapeHtml } from './notice-email.js';

// Firma electrónica (B25, numeral 19.3): la página final de firmas que se agrega al PDF firmado y el
// certificado de evidencia. El encabezado y el pie los pone Gotenberg (institutional.ts). Todo lo que
// viene de una persona (nombres, navegador, motivo) va escapado.

export interface SignedBy {
  readonly name: string;
  readonly idNumber: string;
  readonly role: string;
  readonly email: string;
  /** Cómo se identificó: enlace y código al correo, o sesión con segundo factor. */
  readonly method: string;
  /** «30/10/2026, 3:05 p. m.», en hora de Colombia. */
  readonly signedAtBogota: string;
  /** ISO 8601 en UTC. */
  readonly signedAtUtc: string;
  readonly ip: string;
  readonly userAgent: string;
  readonly acceptanceText: string;
}

export interface EvidenceEvent {
  readonly sequence: number;
  readonly label: string;
  readonly signer: string;
  readonly atBogota: string;
  readonly atUtc: string;
  readonly ip: string;
  readonly hash: string;
}

export interface SignatureEvidence {
  readonly envelopeCode: string;
  readonly documentCode: string;
  readonly documentTitle: string;
  readonly documentSha256: string;
  readonly companyName: string;
  readonly verificationCode: string;
  /** Dirección de la página pública de verificación. */
  readonly verifyUrl: string;
  readonly completedAtBogota: string;
  readonly completedAtUtc: string;
  readonly signers: readonly SignedBy[];
  readonly events: readonly EvidenceEvent[];
}

function factsTable(lines: readonly (readonly [string, string])[]): string {
  const rows = lines.map(
    ([label, value]) =>
      `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
  );
  return `<table>${rows.join('')}</table>`;
}

function verification(evidence: SignatureEvidence): string {
  return [
    `<p>Código de verificación: <strong>${escapeHtml(evidence.verificationCode)}</strong>. `,
    `Cualquier persona puede confirmar que este documento es el original en `,
    `${escapeHtml(evidence.verifyUrl)}, con el código o cargando el archivo. `,
    'Si el archivo cambió, aunque sea en un solo carácter, la verificación lo indica.</p>',
  ].join('');
}

/** Página final de firmas: quién firmó, con qué documento, cuándo y el código de verificación. */
export function signaturesPageBody(evidence: SignatureEvidence): string {
  const blocks = evidence.signers.map((signer) =>
    factsTable([
      ['Firmó', signer.name],
      ['Identificación', signer.idNumber],
      ['En calidad de', signer.role],
      ['Fecha y hora', `${signer.signedAtBogota} (hora de Colombia)`],
      ['Método', signer.method],
    ]),
  );
  return [
    '<h1>PÁGINA DE FIRMAS</h1>',
    `<p>Documento ${escapeHtml(evidence.documentCode)}: ${escapeHtml(evidence.documentTitle)}. `,
    'Firmado electrónicamente en ARZA ONE conforme a la Ley 527 de 1999 y el Decreto 2364 de 2012, ',
    `en el proceso ${escapeHtml(evidence.envelopeCode)}.</p>`,
    ...blocks,
    verification(evidence),
  ].join('');
}

function signerEvidence(signer: SignedBy, index: number): string {
  return [
    `<h2>Firmante ${String(index + 1)}: ${escapeHtml(signer.name)}</h2>`,
    factsTable([
      ['Identificación', signer.idNumber],
      ['Correo', signer.email],
      ['En calidad de', signer.role],
      ['Método de autenticación', signer.method],
      ['Fecha y hora (UTC)', signer.signedAtUtc],
      ['Fecha y hora (Colombia)', signer.signedAtBogota],
      ['Dirección IP', signer.ip],
      ['Dispositivo', signer.userAgent],
      ['Texto aceptado', signer.acceptanceText],
    ]),
  ].join('');
}

function eventsTable(events: readonly EvidenceEvent[]): string {
  const head = ['#', 'Evento', 'Quién', 'Colombia', 'UTC', 'IP', 'Huella'];
  const header = `<tr>${head.map((title) => `<th>${escapeHtml(title)}</th>`).join('')}</tr>`;
  const rows = events.map(
    (event) =>
      `<tr>${[
        String(event.sequence),
        event.label,
        event.signer,
        event.atBogota,
        event.atUtc,
        event.ip,
        event.hash,
      ]
        .map((value) => `<td>${escapeHtml(value)}</td>`)
        .join('')}</tr>`,
  );
  return `<table class="events">${header}${rows.join('')}</table>`;
}

/** Certificado de evidencia: el proceso, el documento, cada firmante y la cadena de eventos. */
export function evidenceCertificateBody(evidence: SignatureEvidence): string {
  return [
    '<h1>CERTIFICADO DE EVIDENCIA DE FIRMA ELECTRÓNICA</h1>',
    factsTable([
      ['Proceso de firma', evidence.envelopeCode],
      ['Documento', `${evidence.documentCode}: ${evidence.documentTitle}`],
      ['Huella SHA-256 del documento enviado a firma', evidence.documentSha256],
      ['Emitido por', evidence.companyName],
      ['Firmado por todos (UTC)', evidence.completedAtUtc],
      ['Firmado por todos (Colombia)', evidence.completedAtBogota],
      ['Código de verificación', evidence.verificationCode],
    ]),
    ...evidence.signers.map(signerEvidence),
    '<h2>Cadena de eventos</h2>',
    '<p>Cada evento guarda la huella del anterior; la primera parte de la huella del documento. ',
    'Cambiar, quitar o reordenar un evento rompe todas las huellas que siguen.</p>',
    eventsTable(evidence.events),
    verification(evidence),
  ].join('');
}
