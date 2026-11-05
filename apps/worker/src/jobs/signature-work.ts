import {
  followUpSignatures,
  processSignatureWork as processPendingSignatures,
  type SignatureFollowUpResult,
  type SignatureWorkDependencies,
  type SignatureWorkResult,
} from '@arza/api/contract';

export type SignatureWorkJobDependencies = SignatureWorkDependencies;

/**
 * Firma electrónica (B25), en el módulo de Contratos: los correos con enlace, los códigos pedidos y
 * el documento firmado con su certificado de evidencia. Repetirlo no cambia nada; si el correo,
 * Gotenberg o el almacenamiento no responden, lo pendiente queda para la siguiente pasada.
 */
export async function processSignatureWork(
  deps: SignatureWorkJobDependencies,
): Promise<SignatureWorkResult> {
  return processPendingSignatures(deps);
}

/** Revisión diaria: recordatorios cada tres días y vencimiento de los procesos fuera de plazo. */
export async function processSignatureFollowUp(
  deps: SignatureWorkJobDependencies,
): Promise<SignatureFollowUpResult> {
  return followUpSignatures(deps);
}
