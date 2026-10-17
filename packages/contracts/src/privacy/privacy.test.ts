import { describe, expect, it } from 'vitest';

import { consentGrantSchema, revokeConsentRequestSchema } from './consents.js';
import { createNoticeRequestSchema, isAuthorizationNotice, noticeKeySchema } from './notices.js';
import { createActivityRequestSchema, createProcessorRequestSchema } from './register.js';

const BODY = 'Texto de prueba del aviso de privacidad con la extensión mínima exigida.';

const GRANT = {
  notice_id: '019a0000-0000-7000-8000-000000000001',
  accepted: true,
  purposes: ['COMMERCIAL'],
  channel: 'digital',
  granted_on: '2026-10-16',
};

describe('avisos de privacidad', () => {
  it('una autorización ofrece finalidades y un texto informativo no', () => {
    const authorization = { key: 'authorization_customer', title: 'Clientes', body: BODY };
    expect(createNoticeRequestSchema.safeParse({ ...authorization, purposes: [] }).success).toBe(
      false,
    );
    expect(
      createNoticeRequestSchema.safeParse({ ...authorization, purposes: ['COMMERCIAL'] }).success,
    ).toBe(true);
    const policy = { key: 'privacy_policy', title: 'Política', body: BODY, purposes: ['BILLING'] };
    expect(createNoticeRequestSchema.safeParse(policy).success).toBe(false);
  });

  it('el registro anterior a B17 no se redacta ni se publica', () => {
    const prior = { key: 'authorization_prior', title: 'Previo', body: BODY, purposes: ['X'] };
    expect(createNoticeRequestSchema.safeParse(prior).success).toBe(false);
    expect(noticeKeySchema.parse('authorization_prior')).toBe('authorization_prior');
    expect(isAuthorizationNotice('privacy_notice')).toBe(false);
  });

  it('un texto corto o con finalidades repetidas no se guarda', () => {
    const short = { key: 'privacy_notice', title: 'Aviso', body: 'Corto', purposes: [] };
    expect(createNoticeRequestSchema.safeParse(short).success).toBe(false);
    const repeated = {
      key: 'authorization_supplier',
      title: 'Proveedores',
      body: BODY,
      purposes: ['SUPPLIER', 'SUPPLIER'],
    };
    expect(createNoticeRequestSchema.safeParse(repeated).success).toBe(false);
  });
});

describe('autorizaciones', () => {
  it('sin la casilla marcada no hay autorización', () => {
    expect(consentGrantSchema.parse(GRANT).evidence_file_id).toBeNull();
    const unchecked = consentGrantSchema.safeParse({ ...GRANT, accepted: false });
    expect(unchecked.error?.issues[0]?.message).toBe(
      'Marque la casilla de autorización para continuar.',
    );
    const missing = { ...GRANT, accepted: undefined };
    expect(consentGrantSchema.safeParse(missing).success).toBe(false);
  });

  it('exige al menos una finalidad, sin repetir', () => {
    expect(consentGrantSchema.safeParse({ ...GRANT, purposes: [] }).success).toBe(false);
    const repeated = { ...GRANT, purposes: ['COMMERCIAL', 'COMMERCIAL'] };
    expect(consentGrantSchema.safeParse(repeated).success).toBe(false);
  });

  it('revocar exige un motivo', () => {
    expect(revokeConsentRequestSchema.safeParse({ reason: 'No' }).success).toBe(false);
    expect(revokeConsentRequestSchema.safeParse({ reason: 'Lo pidió el titular' }).success).toBe(
      true,
    );
  });
});

describe('registro de tratamiento y encargados', () => {
  const ACTIVITY = {
    name: 'Gestión de clientes',
    purpose: 'Atender la relación comercial con los clientes',
    data_categories: ['identification', 'contact'],
    holder_types: ['customers'],
    legal_basis: 'Autorización del titular (Ley 1581, art. 9)',
    retention: 'Diez años después de terminada la relación',
  };

  it('una actividad necesita categorías y titulares, y los encargados son opcionales', () => {
    const parsed = createActivityRequestSchema.parse(ACTIVITY);
    expect(parsed.processor_ids).toEqual([]);
    expect(parsed.international_transfers).toBeNull();
    const empty = { ...ACTIVITY, data_categories: [] };
    expect(createActivityRequestSchema.safeParse(empty).success).toBe(false);
  });

  it('el país del encargado es el código de dos letras', () => {
    const processor = {
      party_id: '019a0000-0000-7000-8000-000000000002',
      service: 'Correo transaccional',
      country: 'us',
      review_on: '2027-01-31',
    };
    const parsed = createProcessorRequestSchema.parse(processor);
    expect(parsed.country).toBe('US');
    expect(parsed.contract_file_id).toBeNull();
    const wrong = { ...processor, country: 'Colombia' };
    expect(createProcessorRequestSchema.safeParse(wrong).success).toBe(false);
  });
});
