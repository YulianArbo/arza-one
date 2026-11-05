import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { NtfScenario } from './support/ntf-scenario.js';

// Avisos de Contratos (B24): quien elaboró el contrato o el otrosí se entera de lo que decidió la
// Dirección; el responsable, del vencimiento, de la firma y de sus obligaciones.

const scenario = new NtfScenario('avisos de contratos');

/** Martes 13 de octubre de 2026, 9:30 a. m. en Bogotá: dentro de la jornada. */
const WORKDAY = new Date('2026-10-13T14:30:00Z');

describe('avisos de contratos', () => {
  it('cada novedad llega a quien corresponde y no a nadie si falta la persona', async () => {
    const author = await scenario.people('autor-contrato', ['COMERCIAL']);
    const contract = { id: uuidv7(), code: 'CTR-2026-0101' };
    const amendment = { id: uuidv7(), code: 'CTR-2026-0101-OT01', contract_id: contract.id };
    const obligation = { contract_id: contract.id, code: contract.code, due_on: '2026-10-20' };
    const events: [string, object][] = [
      ['contract.approved', { ...contract, author_id: author.id, responsible_id: null }],
      ['contract.signed', { ...contract, author_id: null, responsible_id: author.id }],
      ['contract.returned', { ...contract, author_id: null, responsible_id: author.id }],
      ['contract.expiring', { ...contract, author_id: null, responsible_id: author.id, days: 30 }],
      ['contract.expiring', { ...contract, author_id: null, responsible_id: null }],
      ['contract.amendment.approved', { ...amendment, author_id: author.id }],
      ['contract.amendment.returned', { ...amendment, author_id: null }],
      ['contract.obligation.due', { ...obligation, responsible_id: author.id }],
      ['contract.obligation.overdue', { ...obligation, responsible_id: author.id }],
    ];
    for (const [type, payload] of events) {
      await scenario.event(type, { ...payload }, WORKDAY);
    }
    await scenario.publishOutbox();
    const notices = await scenario.inTenant((tx) =>
      tx.notification.findMany({ where: { userId: author.id, kind: 'ctr_contract_update' } }),
    );
    const bodies = notices.map((notice) => notice.body).join('\n');
    expect(notices).toHaveLength(6);
    expect(bodies).toContain('vence en 30 días');
    expect(bodies).toContain('venció el 20/10/2026');
    expect(bodies).toContain('vence el 20/10/2026');
  });
});

describe('avisos de la firma electrónica', () => {
  it('el cierre del proceso llega al responsable y al autor, una vez a cada uno', async () => {
    const author = await scenario.people('autor-firma', ['COMERCIAL']);
    const responsible = await scenario.people('responsable-firma', ['COMERCIAL']);
    const base = { contract_id: uuidv7(), document_code: 'CTR-2026-0102' };
    const events: [string, object][] = [
      [
        'signature.envelope.rejected',
        { ...base, author_id: author.id, responsible_id: responsible.id },
      ],
      ['signature.envelope.expired', { ...base, author_id: author.id, responsible_id: author.id }],
      ['signature.envelope.cancelled', { ...base, author_id: null, responsible_id: null }],
    ];
    for (const [type, payload] of events) {
      await scenario.event(type, { ...payload }, WORKDAY);
    }
    await scenario.publishOutbox();
    const count = async (userId: string) =>
      (
        await scenario.inTenant((tx) =>
          tx.notification.findMany({ where: { userId, kind: 'ctr_contract_update' } }),
        )
      ).length;
    expect(await count(author.id)).toBe(2);
    expect(await count(responsible.id)).toBe(1);
  });
});
