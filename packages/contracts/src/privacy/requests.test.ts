import { describe, expect, it } from 'vitest';

import { cookieConsentQuerySchema } from './cookie-report.js';
import {
  canPrivacyIncidentStep,
  closePrivacyIncidentSchema,
  createPrivacyIncidentSchema,
} from './incidents.js';
import {
  canPrivacyRequestStep,
  privacyRequestCodeSchema,
  privacyRequestKindOf,
  PRIVACY_TERMS,
} from './request-rules.js';
import { publicPrivacyRequestSchema } from './requests.js';

const PUBLIC_REQUEST = {
  right: 'know',
  name: 'Titular de Prueba',
  document_number: '1000000001',
  email: 'Titular@Ejemplo.test',
  description: 'Quiero saber qué datos míos tienen.',
  accepts_privacy: true,
};

describe('solicitudes de titulares', () => {
  it('conocer, pedir la prueba o el uso es consulta; lo demás, reclamo', () => {
    expect(privacyRequestKindOf('know')).toBe('inquiry');
    expect(privacyRequestKindOf('proof')).toBe('inquiry');
    expect(privacyRequestKindOf('usage')).toBe('inquiry');
    for (const right of ['update', 'rectify', 'erase', 'revoke', 'complaint'] as const) {
      expect(privacyRequestKindOf(right)).toBe('claim');
    }
  });

  it('los plazos son los de la Ley 1581', () => {
    expect(PRIVACY_TERMS.inquiry).toEqual({ days: 10, extension: 5 });
    expect(PRIVACY_TERMS.claim).toEqual({ days: 15, extension: 8 });
    expect(PRIVACY_TERMS.requirementBusinessDays).toBe(5);
  });

  it('el formulario público exige la casilla y deja vacío el campo trampa', () => {
    const parsed = publicPrivacyRequestSchema.parse(PUBLIC_REQUEST);
    expect(parsed.email).toBe('titular@ejemplo.test');
    expect(parsed.website).toBe('');
    const unchecked = { ...PUBLIC_REQUEST, accepts_privacy: false };
    expect(publicPrivacyRequestSchema.safeParse(unchecked).success).toBe(false);
    const robot = { ...PUBLIC_REQUEST, website: 'https://spam.test' };
    expect(publicPrivacyRequestSchema.safeParse(robot).success).toBe(false);
  });

  it('el código se escribe como en el correo', () => {
    expect(privacyRequestCodeSchema.parse(' prv-2026-0001 ')).toBe('PRV-2026-0001');
    expect(privacyRequestCodeSchema.safeParse('PQRSF-2026-0001').success).toBe(false);
  });

  it('cada paso se permite solo en su estado', () => {
    expect(canPrivacyRequestStep('verify', 'received')).toBe(true);
    expect(canPrivacyRequestStep('respond', 'received')).toBe(false);
    expect(canPrivacyRequestStep('close', 'responded')).toBe(true);
    expect(canPrivacyRequestStep('erase', 'closed')).toBe(false);
  });
});

describe('incidentes y cookies', () => {
  it('un incidente pide la descripción y al menos un tipo de dato', () => {
    const incident = {
      title: 'Correo enviado a un destinatario equivocado',
      description: 'Se envió un archivo con datos de contacto a una persona que no debía.',
      detected_at: '2026-11-20T15:00:00.000Z',
      affected_count: 12,
      data_categories: [],
    };
    expect(createPrivacyIncidentSchema.safeParse(incident).success).toBe(false);
    const valid = { ...incident, data_categories: ['contact'] };
    expect(createPrivacyIncidentSchema.parse(valid).project_incident_ref).toBeNull();
  });

  it('un incidente cerrado no admite más pasos', () => {
    expect(canPrivacyIncidentStep('contain', 'open')).toBe(true);
    expect(canPrivacyIncidentStep('add_measure', 'closed')).toBe(false);
    expect(closePrivacyIncidentSchema.parse({}).not_reportable_reason).toBeNull();
  });

  it('el informe de cookies no acepta fechas al revés', () => {
    const query = { from: '2026-11-30', to: '2026-11-01' };
    expect(cookieConsentQuerySchema.safeParse(query).success).toBe(false);
  });
});
