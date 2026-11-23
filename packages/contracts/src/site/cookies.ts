import { z } from 'zod';

import { siteDateTimeSchema } from './common.js';

// Cookies del sitio público (B41, numeral 20.4). Las necesarias no requieren consentimiento; las de
// preferencias sí, y vienen desmarcadas. El sitio no usa analítica ni publicidad (decisión 5). La
// elección se guarda en una cookie necesaria del navegador y se registra con la versión de la
// política, la fecha, las categorías, un identificador aleatorio y la dirección IP truncada.

export const COOKIE_CATEGORIES = {
  necessary: {
    label: 'Estrictamente necesarias',
    text: 'Sesión, protección contra falsificación de peticiones y esta misma elección. Sin ellas el sitio no funciona.',
    used: true,
    optional: false,
  },
  preferences: {
    label: 'Preferencias',
    text: 'Recuerdan si prefiere el modo claro u oscuro. Duran hasta 12 meses.',
    used: true,
    optional: true,
  },
  analytics: {
    label: 'Analíticas',
    text: 'No las usamos.',
    used: false,
    optional: true,
  },
  advertising: {
    label: 'Publicidad y terceros',
    text: 'No las usamos: el sitio no carga píxeles, videos ni mapas de terceros.',
    used: false,
    optional: true,
  },
} as const;
export type CookieCategory = keyof typeof COOKIE_CATEGORIES;

/** Cookie necesaria que guarda la elección del visitante. */
export const COOKIE_CONSENT_COOKIE = 'arza_cookie_consent';
/** La elección se vuelve a pedir a los doce meses. */
export const COOKIE_CONSENT_DAYS = 365;

export const cookieChoiceSchema = z.strictObject({
  preferences: z.boolean(),
});

export const cookieConsentRequestSchema = z.strictObject({
  visitor_id: z.uuid().describe('Identificador aleatorio del navegador'),
  policy_version: z.number().int().positive().describe('Versión de la política que se mostró'),
  choice: cookieChoiceSchema,
});
export const cookieConsentResponseSchema = z.object({ decided_at: siteDateTimeSchema });

/** Valor guardado en la cookie de la elección: versión, categorías y fecha. */
export interface StoredCookieChoice {
  readonly visitorId: string;
  readonly policyVersion: number;
  readonly preferences: boolean;
  readonly decidedAt: string;
}

export function encodeCookieChoice(choice: StoredCookieChoice): string {
  const flags = choice.preferences ? 'p' : '-';
  return [choice.visitorId, String(choice.policyVersion), flags, choice.decidedAt].join('|');
}

/** La elección guardada; null si no hay o no se entiende. */
export function decodeCookieChoice(value: string | undefined): StoredCookieChoice | null {
  if (value === undefined) return null;
  const [visitorId, version, flags, decidedAt] = decodeURIComponent(value).split('|');
  const policyVersion = Number(version);
  if (visitorId === undefined || flags === undefined || decidedAt === undefined) return null;
  if (!Number.isInteger(policyVersion) || policyVersion < 1) return null;
  if (!z.uuid().safeParse(visitorId).success || Number.isNaN(Date.parse(decidedAt))) return null;
  return { visitorId, policyVersion, preferences: flags === 'p', decidedAt };
}

/** Hay que volver a preguntar: no hay elección, cambió la política o pasaron doce meses. */
export function cookieChoiceExpired(
  choice: StoredCookieChoice | null,
  policyVersion: number | null,
  now: Date,
): boolean {
  if (choice === null) return true;
  if (policyVersion !== null && choice.policyVersion !== policyVersion) return true;
  const age = now.getTime() - Date.parse(choice.decidedAt);
  return age > COOKIE_CONSENT_DAYS * 86_400_000;
}

export type CookieChoice = z.infer<typeof cookieChoiceSchema>;
export type CookieConsentRequest = z.infer<typeof cookieConsentRequestSchema>;
export type CookieConsentResponse = z.infer<typeof cookieConsentResponseSchema>;
