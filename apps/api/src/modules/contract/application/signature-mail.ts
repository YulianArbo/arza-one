import { SIGNATURE_RULES } from '@arza/contracts';
import { printedDate } from '@arza/templates';

import type { SigEnvelope, SigSigner } from '../../../generated/prisma/client.js';
import { bogotaToday, type CompanyIdentity } from '../../core/index.js';

// Los correos de la firma electrónica (B25): el enlace para firmar, el recordatorio, el código de
// seis números y la copia del documento firmado. La llave del enlace solo existe en el correo; el
// código nunca queda en la cola ni en los registros.

export interface SignatureMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export type LinkMailKind = 'invitation' | 'reminder' | 'copy';

/** El enlace de la página de firma: la llave va después de «#», que el navegador no envía. */
export function signingUrl(appUrl: string, token: string): string {
  const url = new URL('/firmar', appUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

function closing(company: CompanyIdentity): string {
  return `${company.legalName} · NIT ${company.taxId}\nEste es un correo automático de ARZA ONE; no lo responda.`;
}

interface LinkMailInput {
  readonly kind: LinkMailKind;
  readonly envelope: SigEnvelope;
  readonly signer: SigSigner;
  readonly company: CompanyIdentity;
  readonly url: string;
  readonly verifyUrl: string;
}

function invitation(input: LinkMailInput): SignatureMail {
  const { envelope, signer, company } = input;
  const until = printedDate(bogotaToday(envelope.expiresAt));
  const reminder = input.kind === 'reminder';
  return {
    to: signer.email,
    subject: `${reminder ? 'Recordatorio: ' : ''}firme el documento ${envelope.documentCode} de ${company.legalName}`,
    text: [
      `Hola, ${signer.name}:`,
      reminder
        ? `Le recordamos que el documento ${envelope.documentCode} («${envelope.documentTitle}») espera su firma electrónica.`
        : `${company.legalName} le envía para firma electrónica el documento ${envelope.documentCode}: «${envelope.documentTitle}».`,
      ...(envelope.message === null ? [] : [`Mensaje: ${envelope.message}`]),
      'Para leerlo y firmarlo, abra este enlace. Es personal: no lo reenvíe.',
      input.url,
      'Al abrirlo le pediremos un código de seis números que enviaremos a este mismo correo. Puede descargar el documento antes de firmar.',
      `Puede firmar hasta el ${until} a las 11:59 p. m. (hora de Colombia). Si no está de acuerdo, en el mismo enlace puede rechazarlo y decir por qué.`,
      'Si recibe otro correo con un enlace para este documento, use el más reciente: el anterior deja de servir.',
      'Si no esperaba este correo, ignórelo.',
      closing(company),
    ].join('\n\n'),
  };
}

function copy(input: LinkMailInput): SignatureMail {
  const { envelope, signer, company } = input;
  return {
    to: signer.email,
    subject: `Documento ${envelope.documentCode} firmado por todas las partes`,
    text: [
      `Hola, ${signer.name}:`,
      `El documento ${envelope.documentCode} («${envelope.documentTitle}») quedó firmado electrónicamente por todas las partes.`,
      `Descargue su copia íntegra, con la página de firmas y el certificado de evidencia, en este enlace durante los próximos ${String(SIGNATURE_RULES.copyDays)} días:`,
      input.url,
      `Para comprobar en cualquier momento que un archivo es el original, use el código de verificación ${envelope.verificationCode ?? ''} en ${input.verifyUrl}.`,
      closing(company),
    ].join('\n\n'),
  };
}

export function linkMail(input: LinkMailInput): SignatureMail {
  return input.kind === 'copy' ? copy(input) : invitation(input);
}

export function codeMail(
  envelope: SigEnvelope,
  signer: SigSigner,
  company: CompanyIdentity,
  code: string,
): SignatureMail {
  return {
    to: signer.email,
    subject: `Su código para firmar ${envelope.documentCode}: ${code}`,
    text: [
      `Hola, ${signer.name}:`,
      `Su código para firmar el documento ${envelope.documentCode} es: ${code}`,
      `Vale ${String(SIGNATURE_RULES.codeMinutes)} minutos. Nadie de ${company.legalName} se lo pedirá por teléfono ni por otro medio.`,
      'Si usted no lo pidió, ignore este correo: sin el código nadie puede firmar a su nombre.',
      closing(company),
    ].join('\n\n'),
  };
}
