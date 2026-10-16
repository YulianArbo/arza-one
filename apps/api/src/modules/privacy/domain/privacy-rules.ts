import {
  isAuthorizationNotice,
  SENSITIVE_DATA_CATEGORIES,
  type DataCategory,
  type NoticeKey,
} from '@arza/contracts';

// Reglas de privacidad que no dependen de la base de datos (ficha 17.19).

/** Una autorización ofrece al menos una finalidad; un texto informativo, ninguna. */
export function purposesFitKey(key: NoticeKey, purposes: readonly string[]): boolean {
  return isAuthorizationNotice(key) ? purposes.length > 0 : purposes.length === 0;
}

/** El titular solo puede autorizar finalidades que el texto le ofreció. */
export function unofferedPurposes(offered: readonly string[], chosen: readonly string[]): string[] {
  return chosen.filter((purpose) => !offered.includes(purpose));
}

/** Nadie autoriza en el futuro: la fecha es hoy o antes (fechas AAAA-MM-DD en Bogotá). */
export function isGrantDateValid(grantedOn: string, today: string): boolean {
  return grantedOn <= today;
}

/** La actividad trata datos sensibles (Ley 1581, art. 5). */
export function hasSensitiveData(categories: readonly DataCategory[]): boolean {
  return categories.some((category) => SENSITIVE_DATA_CATEGORIES.includes(category));
}

/** Siguiente versión de un texto: la mayor que existe más uno, o la primera. */
export function nextVersionNumber(latest: number | null): number {
  return (latest ?? 0) + 1;
}
