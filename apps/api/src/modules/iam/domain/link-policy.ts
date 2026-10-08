// Vigencia de los enlaces de un solo uso (numeral 15.1).

const MINUTE_MS = 60 * 1000;

export type LinkPurpose = 'invitation' | 'password_reset';

const LINK_TTL_MS: Readonly<Record<LinkPurpose, number>> = {
  invitation: 72 * 60 * MINUTE_MS,
  password_reset: 30 * MINUTE_MS,
};

export function linkExpiresAt(purpose: LinkPurpose, issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + LINK_TTL_MS[purpose]);
}
