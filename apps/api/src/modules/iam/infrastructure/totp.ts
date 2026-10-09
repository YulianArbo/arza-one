import { Secret, TOTP } from 'otpauth';

// Códigos de un solo uso basados en el tiempo (TOTP, RFC 6238), compatibles con Google
// Authenticator, Microsoft Authenticator y similares: seis dígitos que cambian cada 30 segundos.

const ISSUER = 'ARZA ONE';
const ALGORITHM = 'SHA1';
const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** Se acepta el código anterior y el siguiente, por diferencias de reloj del celular. */
const WINDOW = 1;
/** 160 bits, el tamaño que recomienda la norma para SHA-1. */
const SECRET_BYTES = 20;

/** Secreto nuevo en base32, el formato que entienden las aplicaciones del celular. */
export function newTotpSecret(): string {
  return new Secret({ size: SECRET_BYTES }).base32;
}

/** Dirección otpauth:// que se muestra como código QR. */
export function totpUri(secret: string, accountLabel: string): string {
  return new TOTP({
    issuer: ISSUER,
    label: accountLabel,
    secret: Secret.fromBase32(secret),
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
  }).toString();
}

/**
 * Paso de tiempo al que corresponde el código, o null si no coincide. Guardar el último paso
 * usado impide que un mismo código sirva dos veces.
 */
export function matchingTotpStep(secret: string, code: string, now: Date): number | null {
  const timestamp = now.getTime();
  const delta = TOTP.validate({
    token: code,
    secret: Secret.fromBase32(secret),
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    timestamp,
    window: WINDOW,
  });
  return delta === null ? null : TOTP.counter({ period: PERIOD_SECONDS, timestamp }) + delta;
}

/** Código vigente en un momento dado, como lo mostraría la aplicación del celular. */
export function totpCodeAt(secret: string, moment: Date): string {
  return TOTP.generate({
    secret: Secret.fromBase32(secret),
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    timestamp: moment.getTime(),
  });
}
