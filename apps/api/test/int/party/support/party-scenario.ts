import { nitCheckDigit, partyDetailSchema, type PartyDetail } from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';

import { seedCore } from '../../../../src/modules/core/index.js';
import { seedPrivacyDemo, seedPrivacyNotices } from '../../../../src/modules/privacy/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { tenantScope, type SignedIn } from '../../iam/support/iam-fixtures.js';
import { CoreScenario } from '../../core/support/core-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Escenario de las pruebas de terceros (B13): dos empresas con la semilla del núcleo (catálogos de
// documentos, bancos y finalidades) y fichas de prueba con datos ficticios. Las personas llegan con
// su autorización sobre el texto de contactos publicado (B17).

/** Número de 10 dígitos que ninguna otra prueba usa. */
export function uniqueNumber(): string {
  return `9${uuidv7().replaceAll(/\D/g, '').slice(-9).padStart(9, '0')}`;
}

/** NIT ficticio con su dígito de verificación correcto. */
export function uniqueNit(): { id_number: string; check_digit: number } {
  const idNumber = uniqueNumber();
  return { id_number: idNumber, check_digit: nitCheckDigit(idNumber) };
}

/** Cuerpo de una ficha de prueba; el número de documento se usa para buscarla. */
export type PartyBody = Record<string, unknown> & { readonly id_number: string };

export function organizationBody(overrides: object = {}): PartyBody {
  return {
    kind: 'organization',
    legal_name: `Organización de prueba ${uniqueNumber()} S.A.S.`,
    id_type: 'NIT',
    ...uniqueNit(),
    city: 'Medellín',
    roles: ['customer'],
    ...overrides,
  };
}

/** Datos de una persona, sin su autorización (así se editan). */
export function personBody(overrides: object = {}): PartyBody {
  return {
    kind: 'person',
    first_name: 'Persona',
    last_name: `De Prueba ${uniqueNumber()}`,
    id_type: 'CC',
    id_number: uniqueNumber(),
    ...overrides,
  };
}

/** Textos de privacidad publicados por empresa: se preparan una sola vez aunque se pidan a la vez. */
const publishedNotices = new Map<string, Promise<string>>();

async function publishNotices(s: AccessScenario, tenantId: string): Promise<string> {
  await seedCore(apiDatabase(), [tenantId], systemClock);
  await seedPrivacyNotices(apiDatabase(), [tenantId], systemClock);
  await seedPrivacyDemo(apiDatabase(), [tenantId], systemClock);
  const notice = await tenantScope(
    s.db,
    tenantId,
  )((tx) =>
    tx.privacyNotice.findFirstOrThrow({
      where: { key: 'authorization_contact', status: 'published' },
    }),
  );
  return notice.id;
}

/** Id del texto de autorización de contactos publicado en la empresa. */
export function contactNoticeId(s: AccessScenario, tenantId = s.tenant.id): Promise<string> {
  const pending = publishedNotices.get(tenantId) ?? publishNotices(s, tenantId);
  publishedNotices.set(tenantId, pending);
  return pending;
}

/** Autorización válida para el formulario de una persona: casilla marcada y texto vigente. */
export async function consentFor(
  s: AccessScenario,
  tenantId = s.tenant.id,
): Promise<Record<string, unknown>> {
  return {
    notice_id: await contactNoticeId(s, tenantId),
    accepted: true,
    purposes: ['COMMERCIAL'],
    channel: 'written',
    granted_on: '2026-10-01',
  };
}

export class PartyScenario extends CoreScenario {
  /** Persona de comercial: crea y edita terceros, no ve cuentas bancarias. */
  sales(tenantId = this.tenant.id): Promise<Person> {
    return this.person('comercial', ['COMERCIAL'], { tenantId });
  }

  /** Persona de finanzas: registra, ve y aprueba cuentas bancarias. */
  finance(tenantId = this.tenant.id): Promise<Person> {
    return this.person('finanzas', ['ADMIN_FINANCIERO'], { tenantId });
  }

  /** Acción con la versión que se vio, como cambiar el estado. */
  postVersioned(path: string, session: SignedIn, body: object, version: number): request.Test {
    return this.post(path, session, body).set('If-Match', `"${String(version)}"`);
  }

  /** Persona nueva con su autorización, lista para registrar. */
  async personWithConsent(overrides: object = {}, tenantId = this.tenant.id): Promise<PartyBody> {
    return { ...personBody(overrides), consent: await consentFor(this, tenantId) };
  }

  async party(person: Person, body: object = organizationBody()): Promise<string> {
    return this.create('/v1/parties', person, body);
  }

  async detail(person: Person, id: string): Promise<PartyDetail> {
    const response = await this.get(`/v1/parties/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return partyDetailSchema.parse(response.body);
  }
}
