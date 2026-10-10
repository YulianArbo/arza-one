import { nitCheckDigit, partyDetailSchema, type PartyDetail } from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';

import type { Person } from '../../iam/support/access-scenario.js';
import type { SignedIn } from '../../iam/support/iam-fixtures.js';
import { CoreScenario } from '../../core/support/core-scenario.js';

// Escenario de las pruebas de terceros (B13): dos empresas con la semilla del núcleo (catálogos de
// documentos, bancos y finalidades) y fichas de prueba con datos ficticios.

/** Número de 10 dígitos que ninguna otra prueba usa. */
export function uniqueNumber(): string {
  return `9${uuidv7().replaceAll(/\D/g, '').slice(-9).padStart(9, '0')}`;
}

/** NIT ficticio con su dígito de verificación correcto. */
export function uniqueNit(): { id_number: string; check_digit: number } {
  const idNumber = uniqueNumber();
  return { id_number: idNumber, check_digit: nitCheckDigit(idNumber) };
}

export function organizationBody(overrides: object = {}): Record<string, unknown> {
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

export function personBody(overrides: object = {}): Record<string, unknown> {
  return {
    kind: 'person',
    first_name: 'Persona',
    last_name: `De Prueba ${uniqueNumber()}`,
    id_type: 'CC',
    id_number: uniqueNumber(),
    data_purpose: 'COMMERCIAL',
    data_authorization: 'written',
    data_authorized_on: '2026-10-01',
    ...overrides,
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

  async party(person: Person, body: object = organizationBody()): Promise<string> {
    return this.create('/v1/parties', person, body);
  }

  async detail(person: Person, id: string): Promise<PartyDetail> {
    const response = await this.get(`/v1/parties/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return partyDetailSchema.parse(response.body);
  }
}
