import { bankAccountListResponseSchema, revealedBankAccountSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { MINUTE, errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { PartyScenario } from './support/party-scenario.js';

// Cuentas bancarias (B13, ficha 17.3): cifradas, con doble aprobación y con cada consulta del
// número completo registrada (numeral 12.4, dato restringido).

const scenario = new PartyScenario('cuentas');
const ACCOUNT = { bank: 'BANCOLOMBIA', account_type: 'savings', account_number: '00123456789' };

async function newAccount(owner: Person, partyId: string, body: object = ACCOUNT) {
  return scenario.create(`/v1/parties/${partyId}/bank-accounts`, owner, body);
}

async function accounts(person: Person, partyId: string) {
  const response = await scenario.get(`/v1/parties/${partyId}/bank-accounts`, person.session);
  expect(response.status, response.text).toBe(200);
  return bankAccountListResponseSchema.parse(response.body).data;
}

function action(person: Person, partyId: string, id: string, name: string, body: object = {}) {
  return scenario.post(
    `/v1/parties/${partyId}/bank-accounts/${id}/actions/${name}`,
    person.session,
    body,
  );
}

describe('cuentas cifradas', () => {
  it('guarda el número cifrado y solo muestra los cuatro últimos dígitos', async () => {
    const registrar = await scenario.finance();
    const partyId = await scenario.party(registrar);
    const id = await newAccount(registrar, partyId);
    const stored = await scenario.inTenant((tx) =>
      tx.bankAccount.findUniqueOrThrow({ where: { id } }),
    );
    expect(stored.accountNumberEncrypted).toMatch(/^v1\./);
    expect(stored.accountNumberEncrypted).not.toContain('123456789');
    const [listed] = await accounts(registrar, partyId);
    expect(listed).toMatchObject({ number_masked: '•••• 6789', status: 'pending' });
    expect(JSON.stringify(listed)).not.toContain('123456789');
  });

  it('el número completo exige confirmar la identidad y queda en la auditoría', async () => {
    const registrar = await scenario.finance();
    const partyId = await scenario.party(registrar);
    const id = await newAccount(registrar, partyId);
    const reveal = await action(registrar, partyId, id, 'reveal');
    expect(revealedBankAccountSchema.parse(reveal.body).account_number).toBe('00123456789');
    const reveals = await scenario.inTenant((tx) =>
      tx.auditEvent.findMany({ where: { entityId: id, action: 'party.bank_account.reveal' } }),
    );
    expect(reveals).toHaveLength(1);
    expect(JSON.stringify(reveals[0]?.changes)).not.toContain('123456789');
  });

  it('el banco debe estar en el catálogo', async () => {
    const registrar = await scenario.finance();
    const partyId = await scenario.party(registrar);
    const response = await scenario.post(
      `/v1/parties/${partyId}/bank-accounts`,
      registrar.session,
      {
        ...ACCOUNT,
        bank: 'BANCO_INVENTADO',
      },
    );
    expect(errorCode(response)).toBe('PARTY_CATALOG_VALUE_INVALID');
  });
});

describe('doble aprobación', () => {
  it('quien registró no aprueba; otra persona sí, y la cuenta nueva reemplaza la anterior', async () => {
    const registrar = await scenario.finance();
    const reviewer = await scenario.finance();
    const partyId = await scenario.party(registrar);
    const first = await newAccount(registrar, partyId);
    expect(errorCode(await action(registrar, partyId, first, 'approve'))).toBe(
      'PARTY_SAME_REVIEWER',
    );
    expect((await action(reviewer, partyId, first, 'approve')).status).toBe(204);
    expect(errorCode(await action(reviewer, partyId, first, 'approve'))).toBe(
      'PARTY_REVIEW_CLOSED',
    );
    const second = await newAccount(registrar, partyId, {
      ...ACCOUNT,
      bank: 'DAVIVIENDA',
      account_number: '4567000011',
      replaces_id: first,
    });
    expect((await action(reviewer, partyId, second, 'approve')).status).toBe(204);
    const statuses = (await accounts(reviewer, partyId)).map((row) => [row.id, row.status]);
    expect(statuses).toEqual([
      [second, 'approved'],
      [first, 'replaced'],
    ]);
  });

  it('el rechazo lleva motivo y la cuenta rechazada no se puede aprobar después', async () => {
    const registrar = await scenario.finance();
    const reviewer = await scenario.finance();
    const partyId = await scenario.party(registrar);
    const id = await newAccount(registrar, partyId);
    expect((await action(reviewer, partyId, id, 'reject', {})).status).toBe(422);
    const note = { note: 'El certificado no coincide' };
    expect((await action(reviewer, partyId, id, 'reject', note)).status).toBe(204);
    expect(errorCode(await action(reviewer, partyId, id, 'approve'))).toBe('PARTY_REVIEW_CLOSED');
  });
});

describe('doble aprobación en la base de datos', () => {
  it('la base de datos tampoco deja aprobar a quien registró ni cambiar una cuenta aprobada', async () => {
    const registrar = await scenario.finance();
    const reviewer = await scenario.finance();
    const partyId = await scenario.party(registrar);
    const id = await newAccount(registrar, partyId);
    const selfApproval = scenario.inTenant((tx) =>
      tx.bankAccount.update({
        where: { id },
        data: { status: 'approved', reviewedBy: registrar.id, reviewedAt: new Date() },
      }),
    );
    await expect(selfApproval).rejects.toThrow(/pty_bank_accounts_reviewer_check/);
    await action(reviewer, partyId, id, 'approve');
    const tamper = scenario.inTenant((tx) =>
      tx.bankAccount.update({ where: { id }, data: { accountLast4: '0000' } }),
    );
    await expect(tamper).rejects.toThrow(/no se modifica/);
  });
});

describe('confirmación de identidad', () => {
  it('registrar, aprobar o ver el número con una sesión de más de 30 minutos pide confirmarla', async () => {
    const registrar = await scenario.finance();
    const partyId = await scenario.party(registrar);
    const id = await newAccount(registrar, partyId);
    scenario.clock.advance(31 * MINUTE);
    const calls = [
      scenario.post(`/v1/parties/${partyId}/bank-accounts`, registrar.session, ACCOUNT),
      action(registrar, partyId, id, 'reveal'),
    ];
    for (const response of await Promise.all(calls)) {
      expect(errorCode(response)).toBe('REAUTHENTICATION_REQUIRED');
    }
  });
});
