import { describe, expect, it } from 'vitest';

import { systemRoleGrants, type SystemRoleCode } from '../iam/role-matrix.js';
import { siteBlocks } from './common.js';
import {
  cookieChoiceExpired,
  decodeCookieChoice,
  encodeCookieChoice,
  type StoredCookieChoice,
} from './cookies.js';
import { contactFormSchema, maskEmail, quoteFormSchema } from './forms.js';
import { legalTextKeyOfSlug } from './legal.js';
import { savePageSchema } from './pages.js';

const ID = '01900000-0000-7000-8000-000000000001';

function grant(role: SystemRoleCode, code: string) {
  return systemRoleGrants(role).find((item) => item.code === code) ?? null;
}

const CONTACT = {
  first_name: 'Ana',
  last_name: 'Prueba',
  email: 'ana@ejemplo.test',
  notice_id: ID,
  accept_privacy: true,
  message: 'Quiero saber más de sus servicios.',
};

describe('permisos del sitio (decisión 2)', () => {
  it('publican los textos legales solo la Dirección y el Oficial de datos', () => {
    expect(grant('DIRECCION', 'web.legal_text.publish')).not.toBeNull();
    expect(grant('OFICIAL_DATOS', 'web.legal_text.publish')).not.toBeNull();
    expect(grant('COMERCIAL', 'web.legal_text.publish')).toBeNull();
    expect(grant('COMERCIAL', 'web.legal_text.manage')).not.toBeNull();
  });
});

describe('formularios del sitio', () => {
  it('no se envían sin la casilla de autorización marcada', () => {
    expect(contactFormSchema.safeParse(CONTACT).success).toBe(true);
    expect(contactFormSchema.safeParse({ ...CONTACT, accept_privacy: false }).success).toBe(false);
    expect(contactFormSchema.safeParse({ ...CONTACT, accept_privacy: undefined }).success).toBe(
      false,
    );
  });

  it('la cotización exige un servicio conocido y su plazo', () => {
    const base = {
      first_name: 'Ana',
      last_name: 'Prueba',
      email: 'ana@ejemplo.test',
      notice_id: ID,
      accept_privacy: true,
      description: 'Un portal de clientes nuevo.',
    };
    expect(quoteFormSchema.safeParse({ ...base, service: 'cloud', timeframe: 'now' }).success).toBe(
      true,
    );
    expect(quoteFormSchema.safeParse({ ...base, service: 'otro', timeframe: 'now' }).success).toBe(
      false,
    );
  });

  it('oculta la parte local del correo', () => {
    expect(maskEmail('ana@ejemplo.test')).toBe('a•••@ejemplo.test');
  });
});

describe('páginas y textos', () => {
  it('no deja usar una dirección de la plataforma', () => {
    const page = { slug: 'nosotros', title: 'Nosotros', body: 'Somos una empresa de prueba.' };
    expect(savePageSchema.safeParse(page).success).toBe(true);
    expect(savePageSchema.safeParse({ ...page, slug: 'iniciar-sesion' }).success).toBe(false);
    expect(savePageSchema.safeParse({ ...page, slug: 'Con Espacios' }).success).toBe(false);
  });

  it('reconoce títulos, párrafos y listas sin interpretar HTML', () => {
    expect(siteBlocks('## Título\nUno\ndos\n\n- a\n- b\n<b>x</b>')).toEqual([
      { kind: 'heading', text: 'Título' },
      { kind: 'paragraph', text: 'Uno dos' },
      { kind: 'list', items: ['a', 'b'] },
      { kind: 'paragraph', text: '<b>x</b>' },
    ]);
  });

  it('encuentra el texto legal por su dirección', () => {
    expect(legalTextKeyOfSlug('cookies')).toBe('cookie_policy');
    expect(legalTextKeyOfSlug('no-existe')).toBeNull();
  });
});

describe('elección de cookies', () => {
  const choice: StoredCookieChoice = {
    visitorId: ID,
    policyVersion: 2,
    preferences: false,
    decidedAt: '2026-11-22T12:00:00.000Z',
  };

  it('se guarda y se lee igual', () => {
    expect(decodeCookieChoice(encodeCookieChoice(choice))).toEqual(choice);
    expect(decodeCookieChoice('basura')).toBeNull();
    expect(decodeCookieChoice(undefined)).toBeNull();
  });

  it('se vuelve a pedir si cambia la política o pasan doce meses', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    expect(cookieChoiceExpired(choice, 2, now)).toBe(false);
    expect(cookieChoiceExpired(choice, 3, now)).toBe(true);
    expect(cookieChoiceExpired(choice, 2, new Date('2027-12-01T00:00:00Z'))).toBe(true);
    expect(cookieChoiceExpired(null, 2, now)).toBe(true);
  });
});
