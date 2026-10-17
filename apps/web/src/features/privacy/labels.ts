import type {
  ConsentChannel,
  ConsentStatus,
  DataCategory,
  HolderType,
  NoticeStatus,
} from '@arza/contracts';

// Textos de privacidad (B17, numeral 16.6: sin jerga, trato de usted).

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const PRIVACY_PATH = '/app/privacidad';

export const PRIVACY_PATHS = {
  home: PRIVACY_PATH,
  notices: `${PRIVACY_PATH}/avisos`,
  consents: `${PRIVACY_PATH}/autorizaciones`,
  activities: `${PRIVACY_PATH}/actividades`,
  processors: `${PRIVACY_PATH}/encargados`,
} as const;

export const CHANNEL_LABELS: Readonly<Record<ConsentChannel, string>> = {
  written: 'Documento firmado',
  digital: 'Formulario web o correo',
  verbal: 'Verbal, con constancia',
  contract: 'Cláusula del contrato',
};

export const CONSENT_STATUS_LABELS: Readonly<Record<ConsentStatus, string>> = {
  active: 'Vigente',
  revoked: 'Revocada',
};

export const CONSENT_STATUS_TONES: Readonly<Record<ConsentStatus, Tone>> = {
  active: 'success',
  revoked: 'neutral',
};

export const NOTICE_STATUS_LABELS: Readonly<Record<NoticeStatus, string>> = {
  draft: 'Borrador',
  published: 'Publicado',
  replaced: 'Reemplazado',
};

export const NOTICE_STATUS_TONES: Readonly<Record<NoticeStatus, Tone>> = {
  draft: 'warning',
  published: 'success',
  replaced: 'neutral',
};

export const DATA_CATEGORY_LABELS: Readonly<Record<DataCategory, string>> = {
  identification: 'Identificación',
  contact: 'Contacto',
  demographic: 'Sociodemográficos',
  financial: 'Financieros',
  employment: 'Laborales',
  education: 'Académicos',
  images: 'Imágenes y video',
  location: 'Ubicación',
  health: 'Salud (sensible)',
  biometric: 'Biométricos (sensible)',
};

export const HOLDER_TYPE_LABELS: Readonly<Record<HolderType, string>> = {
  customers: 'Clientes',
  suppliers: 'Proveedores',
  employees: 'Colaboradores',
  candidates: 'Candidatos',
  contacts: 'Contactos',
  visitors: 'Visitantes del sitio',
  users: 'Usuarios de la plataforma',
};

export const SOURCE_LABELS: Readonly<Record<string, string>> = {
  party_create: 'Al registrar el tercero',
  party_consent: 'Desde la ficha del tercero',
  prior_record: 'Registro anterior a B17',
};

/** Etiqueta de cada finalidad según el catálogo; si no está, el código. */
export function purposeLabel(
  catalog: readonly { readonly code: string; readonly label: string }[],
  code: string,
): string {
  return catalog.find((item) => item.code === code)?.label ?? code;
}
