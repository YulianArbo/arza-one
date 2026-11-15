import { z } from 'zod';

// Piezas comunes del portal del cliente (M09, B30; ficha 17.10): códigos de error y la regla de
// quién ve qué. El portal no guarda datos propios: muestra los de Proyectos, Contratos, Servicio e
// Identidad, siempre limitados a la empresa cliente de la persona.

/** Códigos estables de los errores del portal (numeral 14.2). */
export const PORTAL_ERROR_CODES = {
  notFound: 'PORTAL_NOT_FOUND',
  /** La cuenta no es del portal o no está ligada a una empresa cliente. */
  noCompany: 'PORTAL_NO_COMPANY',
  /** Debe aceptar los términos de uso y la política de privacidad vigentes (ficha 17.10). */
  termsPending: 'PORTAL_TERMS_PENDING',
  /** No hay términos publicados: el portal no se puede usar todavía (decisión 8). */
  termsUnavailable: 'PORTAL_TERMS_UNAVAILABLE',
  termsOutdated: 'PORTAL_TERMS_OUTDATED',
  signatureUnavailable: 'PORTAL_SIGNATURE_UNAVAILABLE',
  userInvalid: 'PORTAL_USER_INVALID',
  projectInvalid: 'PORTAL_PROJECT_INVALID',
} as const;

export const portalRoleSchema = z
  .enum(['CLIENTE_ADMIN', 'CLIENTE_USUARIO'])
  .describe('Administrador o usuario del cliente');

export type PortalRole = z.infer<typeof portalRoleSchema>;

export const PORTAL_ROLE_LABELS: Readonly<Record<PortalRole, string>> = {
  CLIENTE_ADMIN: 'Administrador',
  CLIENTE_USUARIO: 'Usuario',
};
