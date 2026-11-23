import type {
  PersonalDataExportStatus,
  PersonalDataOutcome,
  PrivacyIncidentStatus,
  PrivacyRequestStatus,
} from '@arza/contracts';

// Textos y tonos de las solicitudes de titulares, la entrega de datos y los incidentes (B42).
// Las etiquetas de derechos, canales y estados salen de los contratos.

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const PRIVACY_PATH = '/app/privacidad';

export const B42_PATHS = {
  requests: `${PRIVACY_PATH}/solicitudes`,
  request: (id: string) => `${PRIVACY_PATH}/solicitudes/${id}`,
  incidents: `${PRIVACY_PATH}/incidentes`,
  incident: (id: string) => `${PRIVACY_PATH}/incidentes/${id}`,
  cookies: `${PRIVACY_PATH}/cookies`,
} as const;

export const REQUEST_STATUS_TONES: Readonly<Record<PrivacyRequestStatus, Tone>> = {
  received: 'info',
  verifying: 'warning',
  in_progress: 'warning',
  responded: 'success',
  closed: 'neutral',
};

export const INCIDENT_STATUS_TONES: Readonly<Record<PrivacyIncidentStatus, Tone>> = {
  open: 'destructive',
  contained: 'warning',
  reported: 'info',
  closed: 'neutral',
};

export const EXPORT_STATUS_TONES: Readonly<Record<PersonalDataExportStatus, Tone>> = {
  pending: 'info',
  ready: 'success',
  failed: 'destructive',
};

export const OUTCOME_TONES: Readonly<Record<PersonalDataOutcome, Tone>> = {
  erased: 'success',
  blocked: 'warning',
  kept: 'info',
  none: 'neutral',
};

/** Tipos de datos personales, en palabras sencillas. */
export const DATA_CATEGORY_TEXT: Readonly<Record<string, string>> = {
  identification: 'Identificación',
  contact: 'Contacto',
  demographic: 'Demográficos',
  financial: 'Financieros',
  employment: 'Laborales',
  education: 'Educación',
  images: 'Imágenes',
  location: 'Ubicación',
  health: 'Salud (sensible)',
  biometric: 'Biométricos (sensible)',
};
