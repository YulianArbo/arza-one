import { z } from 'zod';

// Reglas de las solicitudes de titulares (M18, B42; Ley 1581 de 2012, arts. 8, 14 y 15): derechos,
// plazos legales en días hábiles, estados, canales y qué paso admite cada estado.

function enumOf<T extends string>(labels: Readonly<Record<T, string>>) {
  return z.enum(Object.keys(labels) as [T, ...T[]]);
}

/** Consulta (art. 14) o reclamo (art. 15). */
export const PRIVACY_REQUEST_KINDS = {
  inquiry: 'Consulta',
  claim: 'Reclamo',
} as const;

export type PrivacyRequestKind = keyof typeof PRIVACY_REQUEST_KINDS;

export const privacyRequestKindSchema = enumOf(PRIVACY_REQUEST_KINDS);

/** El derecho que ejerce el titular (art. 8). */
export const PRIVACY_RIGHTS = {
  know: 'Conocer los datos que tienen de mí',
  proof: 'Pedir la prueba de mi autorización',
  usage: 'Saber cómo se usan mis datos',
  update: 'Actualizar mis datos',
  rectify: 'Corregir mis datos',
  erase: 'Suprimir mis datos',
  revoke: 'Revocar mi autorización',
  complaint: 'Reclamar por un incumplimiento',
} as const;

export type PrivacyRight = keyof typeof PRIVACY_RIGHTS;

export const privacyRightSchema = enumOf(PRIVACY_RIGHTS).describe('Derecho que ejerce el titular');

const INQUIRY_RIGHTS: readonly PrivacyRight[] = ['know', 'proof', 'usage'];

/** Conocer, pedir la prueba o saber el uso es consulta; lo demás, reclamo (decisión 2). */
export function privacyRequestKindOf(right: PrivacyRight): PrivacyRequestKind {
  return INQUIRY_RIGHTS.includes(right) ? 'inquiry' : 'claim';
}

/** Plazos legales en días hábiles (arts. 14 y 15) y reglas del trámite (decisiones 4 y 11). */
export const PRIVACY_TERMS = {
  inquiry: { days: 10, extension: 5 },
  claim: { days: 15, extension: 8 },
  /** Un reclamo incompleto se requiere dentro de los 5 días hábiles siguientes a recibirlo. */
  requirementBusinessDays: 5,
  /** Si en dos meses el titular no completa el reclamo, se entiende que desistió. */
  desistMonths: 2,
  /** Aviso al Oficial cuando faltan estos días hábiles, y otro el día del vencimiento. */
  warnBusinessDaysBefore: 2,
} as const;

export const PRIVACY_REQUEST_STATUSES = {
  received: 'Recibida',
  verifying: 'En verificación de identidad',
  in_progress: 'En trámite',
  responded: 'Respondida',
  closed: 'Cerrada',
} as const;

export type PrivacyRequestStatus = keyof typeof PRIVACY_REQUEST_STATUSES;

export const privacyRequestStatusSchema = enumOf(PRIVACY_REQUEST_STATUSES);

export const OPEN_PRIVACY_REQUEST_STATUSES: readonly PrivacyRequestStatus[] = [
  'received',
  'verifying',
  'in_progress',
];

export const PRIVACY_REQUEST_CHANNELS = {
  web: 'Sitio web',
  portal: 'Portal del cliente',
  email: 'Correo',
  phone: 'Teléfono',
  in_person: 'En persona',
  written: 'Por escrito',
  pqrsf: 'Trasladada desde una PQRSF',
} as const;

export type PrivacyRequestChannel = keyof typeof PRIVACY_REQUEST_CHANNELS;

export const privacyRequestChannelSchema = enumOf(PRIVACY_REQUEST_CHANNELS);

/** Cómo comprobó el Oficial quién es el titular (decisión 3). */
export const IDENTITY_METHODS = {
  document: 'Copia del documento de identidad',
  email_match: 'El correo coincide con el registrado',
  in_person: 'Se presentó en persona',
  portal_session: 'Ingresó al portal con su cuenta',
} as const;

export type IdentityMethod = keyof typeof IDENTITY_METHODS;

export const identityMethodSchema = enumOf(IDENTITY_METHODS);

export const PRIVACY_REQUEST_CLOSURES = {
  answered: 'Respondida al titular',
  desisted: 'Desistida: el titular no completó el reclamo',
} as const;

export type PrivacyRequestClosure = keyof typeof PRIVACY_REQUEST_CLOSURES;

export const privacyRequestClosureSchema = enumOf(PRIVACY_REQUEST_CLOSURES);

/** Lo que va quedando en la historia de la solicitud. */
export const PRIVACY_REQUEST_EVENTS = {
  received: 'Recibida',
  verification_started: 'Inició la verificación de identidad',
  verified: 'Identidad verificada',
  requirement: 'Se pidió completar el reclamo',
  requirement_answered: 'El titular completó el reclamo',
  extended: 'Se amplió el plazo',
  exported: 'Se prepararon sus datos',
  erased: 'Se suprimieron sus datos',
  responded: 'Respondida',
  closed: 'Cerrada',
  desisted: 'Cerrada por desistimiento',
} as const;

export type PrivacyRequestEventKind = keyof typeof PRIVACY_REQUEST_EVENTS;

export const privacyRequestEventKindSchema = enumOf(PRIVACY_REQUEST_EVENTS);

/** Radicado: PRV-AAAA-NNNN. */
export const privacyRequestCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^PRV-\d{4}-\d{4,8}$/u, 'Escriba el código como aparece en el correo: PRV-2026-0001.')
  .describe('Código de la solicitud');

/** Qué paso admite cada estado (la API y la pantalla usan la misma tabla). */
export const PRIVACY_REQUEST_ACTIONS = {
  start_verification: ['received'],
  verify: ['received', 'verifying'],
  require: ['received', 'verifying', 'in_progress'],
  answer_requirement: ['received', 'verifying', 'in_progress'],
  extend: ['received', 'verifying', 'in_progress'],
  export: ['in_progress'],
  erase: ['in_progress'],
  respond: ['in_progress'],
  close: ['responded'],
} as const satisfies Record<string, readonly PrivacyRequestStatus[]>;

export type PrivacyRequestAction = keyof typeof PRIVACY_REQUEST_ACTIONS;

export function canPrivacyRequestStep(
  action: PrivacyRequestAction,
  status: PrivacyRequestStatus,
): boolean {
  const allowed: readonly PrivacyRequestStatus[] = PRIVACY_REQUEST_ACTIONS[action];
  return allowed.includes(status);
}
